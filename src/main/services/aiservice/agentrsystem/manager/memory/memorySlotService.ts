import {
  isConversationMode,
  isInteractionState,
  type MemorySlotSnapshot
} from '@share/cache/AItype/states/memorySlots'
import type { WorldEntityType } from '@share/cache/worldbuilding/worldbuilding'
import { AppDataSource } from '../../../../../database'
import { MemorySlotRecord } from '../../../../../../share/entity/database/MemorySlotRecord'
import { interactionObservationService } from '../personal/interactionObservationService'
import { personaConfigService } from '../personal/personaConfigService'
import { applyObservationToMemorySlots, createDefaultMemorySlots } from './memoryWritePolicy'

const MEMORY_SLOT_ROW_ID = 1
const WORLD_ENTITY_TYPES: WorldEntityType[] = [
  'character',
  'race',
  'faction',
  'nation',
  'city',
  'region',
  'map',
  'map_location',
  'event',
  'item',
  'rule',
  'custom'
]

const isWorldEntityType = (value: unknown): value is WorldEntityType =>
  typeof value === 'string' && WORLD_ENTITY_TYPES.includes(value as WorldEntityType)

const parseSnapshot = (input: string): MemorySlotSnapshot => {
  try {
    const parsed = JSON.parse(input) as Record<string, any>
    if (parsed && typeof parsed === 'object') {
      const defaults = createDefaultMemorySlots()
      return {
        ...defaults,
        conversation_state: {
          ...defaults.conversation_state,
          conversation_mode: isConversationMode(parsed.conversation_state?.conversation_mode)
            ? parsed.conversation_state.conversation_mode
            : undefined,
          interaction_state: isInteractionState(parsed.conversation_state?.interaction_state)
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
        world_focus: {
          ...defaults.world_focus,
          worldId:
            typeof parsed.world_focus?.worldId === 'string'
              ? parsed.world_focus.worldId
              : undefined,
          worldName:
            typeof parsed.world_focus?.worldName === 'string'
              ? parsed.world_focus.worldName
              : undefined,
          focusType: isWorldEntityType(parsed.world_focus?.focusType)
            ? parsed.world_focus.focusType
            : undefined,
          entityId:
            typeof parsed.world_focus?.entityId === 'string'
              ? parsed.world_focus.entityId
              : undefined,
          entityName:
            typeof parsed.world_focus?.entityName === 'string'
              ? parsed.world_focus.entityName
              : undefined,
          confidence:
            typeof parsed.world_focus?.confidence === 'number'
              ? parsed.world_focus.confidence
              : defaults.world_focus.confidence,
          status:
            parsed.world_focus?.status === 'candidate' ||
            parsed.world_focus?.status === 'resolved' ||
            parsed.world_focus?.status === 'ambiguous' ||
            parsed.world_focus?.status === 'none'
              ? parsed.world_focus.status
              : defaults.world_focus.status,
          updatedAt:
            typeof parsed.world_focus?.updatedAt === 'string'
              ? parsed.world_focus.updatedAt
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
  private writeQueue: Promise<void> = Promise.resolve()

  private get repo() {
    return AppDataSource.getRepository(MemorySlotRecord)
  }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.writeQueue
    let release: () => void = () => {}
    this.writeQueue = new Promise<void>((resolve) => {
      release = resolve
    })

    await previous
    try {
      return await operation()
    } finally {
      release()
    }
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
    return this.withWriteLock(async () => {
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
    })
  }

  async updateWorldFocus(
    worldFocus: Partial<MemorySlotSnapshot['world_focus']>
  ): Promise<MemorySlotSnapshot> {
    return this.withWriteLock(async () => {
      const row = await this.loadRow()
      const snapshot = parseSnapshot(row.payloadJson)
      snapshot.lastObservationId = row.lastObservationId
      snapshot.world_focus = {
        ...createDefaultMemorySlots().world_focus,
        ...snapshot.world_focus,
        ...worldFocus,
        updatedAt: worldFocus.updatedAt ?? new Date().toISOString()
      }
      row.payloadJson = JSON.stringify(snapshot)
      await this.repo.save(row)
      return snapshot
    })
  }

  async clear(): Promise<void> {
    return this.withWriteLock(async () => {
      let row = await this.repo.findOneBy({ id: MEMORY_SLOT_ROW_ID })
      if (!row) {
        row = this.repo.create({ id: MEMORY_SLOT_ROW_ID })
      }
      row.lastObservationId = 0
      row.payloadJson = JSON.stringify(createDefaultMemorySlots())
      await this.repo.save(row)
    })
  }
}

export const memorySlotService = new MemorySlotService()
