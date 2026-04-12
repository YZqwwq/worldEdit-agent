import type { MemorySlotSnapshot } from '@share/cache/AItype/states/memorySlots'
import { AppDataSource } from '../../../../../database'
import { MemorySlotRecord } from '../../../../../../share/entity/database/MemorySlotRecord'
import { interactionObservationService } from '../personal/interactionObservationService'
import { personaConfigService } from '../personal/personaConfigService'
import {
  applyObservationToMemorySlots,
  createDefaultMemorySlots
} from './memoryWritePolicy'

const MEMORY_SLOT_ROW_ID = 1

const parseSnapshot = (input: string): MemorySlotSnapshot => {
  try {
    const parsed = JSON.parse(input) as Record<string, any>
    if (parsed && typeof parsed === 'object') {
      const defaults = createDefaultMemorySlots()
      return {
        ...defaults,
        conversation_state: {
          ...defaults.conversation_state,
          conversation_mode:
            typeof parsed.conversation_state?.conversation_mode === 'string'
              ? parsed.conversation_state.conversation_mode
              : undefined,
          interaction_state:
            typeof parsed.conversation_state?.interaction_state === 'string'
              ? parsed.conversation_state.interaction_state
              : undefined
        },
        user_mood: {
          ...defaults.user_mood,
          current_mood:
            typeof parsed.user_mood?.current_mood === 'string'
              ? parsed.user_mood.current_mood
              : undefined,
          valence:
            typeof parsed.user_mood?.valence === 'number' ? parsed.user_mood.valence : undefined,
          confidence:
            typeof parsed.user_mood?.confidence === 'number'
              ? parsed.user_mood.confidence
              : defaults.user_mood.confidence,
          updatedAt:
            typeof parsed.user_mood?.updatedAt === 'string'
              ? parsed.user_mood.updatedAt
              : undefined,
          expiresAfterObservationId:
            typeof parsed.user_mood?.expiresAfterObservationId === 'number'
              ? parsed.user_mood.expiresAfterObservationId
              : undefined
        },
        lastObservationId:
          typeof parsed.lastObservationId === 'number' ? parsed.lastObservationId : 0
      }
    }
  } catch {
    // ignore bad payload
  }

  return createDefaultMemorySlots()
}

class MemorySlotService {
  private get repo() {
    return AppDataSource.getRepository(MemorySlotRecord)
  }

  private async loadRow(): Promise<MemorySlotRecord> {
    let row = await this.repo.findOneBy({ id: MEMORY_SLOT_ROW_ID })
    if (!row) {
      row = this.repo.create({
        id: MEMORY_SLOT_ROW_ID,
        lastObservationId: 0,
        payloadJson: JSON.stringify(createDefaultMemorySlots())
      })
      row = await this.repo.save(row)
    }
    return row
  }

  async getSnapshot(): Promise<MemorySlotSnapshot> {
    const row = await this.loadRow()
    const snapshot = parseSnapshot(row.payloadJson)
    snapshot.lastObservationId = row.lastObservationId
    return snapshot
  }

  async reconcileFromObservations(): Promise<MemorySlotSnapshot> {
    const row = await this.loadRow()
    const config = await personaConfigService.getConfig()
    let snapshot = parseSnapshot(row.payloadJson)
    const observations = await interactionObservationService.listSince(row.lastObservationId)

    for (const observation of observations) {
      snapshot = applyObservationToMemorySlots(snapshot, observation, config)
      row.lastObservationId = observation.id
    }

    snapshot.lastObservationId = row.lastObservationId
    row.payloadJson = JSON.stringify(snapshot)
    await this.repo.save(row)
    return snapshot
  }

  async clear(): Promise<void> {
    let row = await this.repo.findOneBy({ id: MEMORY_SLOT_ROW_ID })
    if (!row) {
      row = this.repo.create({ id: MEMORY_SLOT_ROW_ID })
    }
    row.lastObservationId = 0
    row.payloadJson = JSON.stringify(createDefaultMemorySlots())
    await this.repo.save(row)
  }
}

export const memorySlotService = new MemorySlotService()
