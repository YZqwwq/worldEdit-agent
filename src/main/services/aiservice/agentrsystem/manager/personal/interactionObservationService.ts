import type {
  InteractionObservationSnapshot,
  InteractionObservationSource,
  InteractionObservationType
} from '@share/cache/AItype/states/interactionObservation'
import { AppDataSource } from '../../../../../database'
import { InteractionObservationRecord } from '../../../../../../share/entity/database/InteractionObservationRecord'

const parseJsonObject = (input: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(input)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // ignore bad payloads
  }
  return {}
}

const toSnapshot = (row: InteractionObservationRecord): InteractionObservationSnapshot => ({
  id: row.id,
  type: row.type as InteractionObservationType,
  source: row.source as InteractionObservationSource,
  summary: row.summary || undefined,
  payload: parseJsonObject(row.payloadJson),
  createdAt: row.createdAt.toISOString()
})

class InteractionObservationService {
  private get repo() {
    return AppDataSource.getRepository(InteractionObservationRecord)
  }

  async record(input: {
    type: InteractionObservationType
    source: InteractionObservationSource
    summary?: string
    payload?: Record<string, unknown>
  }): Promise<InteractionObservationSnapshot> {
    const row = this.repo.create({
      type: input.type,
      source: input.source,
      summary: input.summary?.trim() || '',
      payloadJson: JSON.stringify(input.payload ?? {})
    })
    return toSnapshot(await this.repo.save(row))
  }

  async listSince(lastObservationId: number, limit = 64): Promise<InteractionObservationSnapshot[]> {
    const rows = await this.repo
      .createQueryBuilder('observation')
      .where('observation.id > :lastObservationId', { lastObservationId })
      .orderBy('observation.id', 'ASC')
      .limit(limit)
      .getMany()

    return rows.map(toSnapshot)
  }

  async clear(): Promise<void> {
    await this.repo.clear()
  }
}

export const interactionObservationService = new InteractionObservationService()
