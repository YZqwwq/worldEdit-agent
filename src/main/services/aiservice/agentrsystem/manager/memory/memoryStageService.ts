import type { EntityManager } from 'typeorm'
import type { MemoryStageSnapshot, MemoryStageStatus } from '@share/cache/AItype/states/memoryState'
import { AppDataSource } from '../../../../../database'
import { MemoryStageRecord } from '../../../../../../share/entity/database/MemoryStageRecord'

const mapRow = (row: MemoryStageRecord): MemoryStageSnapshot => ({
  id: row.id,
  stageIndex: row.stageIndex,
  status: (row.status || 'completed') as MemoryStageStatus,
  triggerKind: row.triggerKind || 'window_overflow',
  messageCount: row.messageCount || 0,
  startSequence: row.startSequence || 0,
  endSequence: row.endSequence || 0,
  startedAt: row.startedAtIso || '',
  endedAt: row.endedAtIso || '',
  summary: row.summary || '',
  moodLabel: row.moodLabel || undefined
})

class MemoryStageService {
  private resolveRepo(manager?: EntityManager) {
    return (manager ?? AppDataSource).getRepository(MemoryStageRecord)
  }

  async create(input: {
    sessionId: string
    stageIndex: number
    status: MemoryStageStatus
    triggerKind: string
    messageCount: number
    startSequence: number
    endSequence: number
    startedAt: string
    endedAt: string
    summary: string
    moodLabel?: string
  }, manager?: EntityManager): Promise<MemoryStageSnapshot> {
    const repo = this.resolveRepo(manager)
    const row = repo.create({
      sessionId: input.sessionId,
      stageIndex: input.stageIndex,
      status: input.status,
      triggerKind: input.triggerKind,
      messageCount: input.messageCount,
      startSequence: input.startSequence,
      endSequence: input.endSequence,
      startedAtIso: input.startedAt,
      endedAtIso: input.endedAt,
      summary: input.summary,
      moodLabel: input.moodLabel || ''
    })
    return mapRow(await repo.save(row))
  }

  async listRecent(sessionId: string, limit = 5): Promise<MemoryStageSnapshot[]> {
    const rows = await this.resolveRepo().find({
      where: { sessionId },
      order: { stageIndex: 'DESC' },
      take: limit
    })
    return rows.map(mapRow)
  }

  async deleteAfterStageIndex(sessionId: string, stageIndex: number, manager?: EntityManager): Promise<void> {
    const repo = this.resolveRepo(manager)
    if (stageIndex <= 0) {
      await repo.clear()
      return
    }
    await repo
      .createQueryBuilder()
      .delete()
      .from(MemoryStageRecord)
      .where('sessionId = :sessionId AND stageIndex > :stageIndex', { sessionId, stageIndex })
      .execute()
  }

  async clear(manager?: EntityManager): Promise<void> {
    await this.resolveRepo(manager).clear()
  }
}

export const memoryStageService = new MemoryStageService()
