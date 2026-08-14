import type { DataSource, EntityManager } from 'typeorm'
import { MainAgentChangeSetRecord } from '@share/entity/database/MainAgentChangeSetRecord'
import { MainAgentToolEffectReceiptRecord } from '@share/entity/database/MainAgentToolEffectReceiptRecord'
import type {
  ToolChangeSetOutcome,
  ToolChangeSetSummary,
  ToolEffectStatus
} from '@share/cache/AItype/states/toolEffect'
import type { ToolEffectExecutionContext } from './toolEffectExecutionContext'

export type ToolChangeSetIdentity = {
  id: string
  scopeType: MainAgentChangeSetRecord['scopeType']
  scopeId: string
  eventId: string
  turnId: number
  sessionId: string
  title?: string
}

const emptyCounts = (): Record<ToolEffectStatus, number> => ({
  planned: 0,
  completed: 0,
  failed: 0,
  aborted: 0,
  unknown: 0
})

export const resolveToolChangeSetOutcome = (
  counts: Record<ToolEffectStatus, number>
): ToolChangeSetOutcome => {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  if (total === 0) return 'empty'
  if (counts.unknown > 0) return 'unknown'
  if (counts.planned > 0) return 'in_progress'
  if (counts.completed > 0 && counts.failed + counts.aborted > 0) return 'partial'
  if (counts.completed > 0) return 'completed'
  return 'failed'
}

export const ensureToolChangeSetWithManager = async (
  manager: EntityManager,
  input: ToolChangeSetIdentity
): Promise<MainAgentChangeSetRecord> => {
  const repository = manager.getRepository(MainAgentChangeSetRecord)
  const existing = await repository.findOneBy({ id: input.id })
  if (existing) return existing
  return repository.save(
    repository.create({
      ...input,
      lifecycle: 'open',
      title: input.title?.trim() || null,
      sealedAt: null
    })
  )
}

export const ensureTurnChangeSetWithManager = (
  manager: EntityManager,
  context: ToolEffectExecutionContext
): Promise<MainAgentChangeSetRecord> =>
  ensureToolChangeSetWithManager(manager, {
    id: context.changeSetId,
    scopeType: 'turn',
    scopeId: `${context.eventId}:${context.turnId}`,
    eventId: context.eventId,
    turnId: context.turnId,
    sessionId: context.sessionId
  })

export const createToolChangeSet = (
  dataSource: DataSource,
  input: ToolChangeSetIdentity
): Promise<MainAgentChangeSetRecord> =>
  dataSource.transaction((manager) => ensureToolChangeSetWithManager(manager, input))

const buildSummaryWithManager = async (
  manager: EntityManager,
  changeSetId: string
): Promise<ToolChangeSetSummary | null> => {
  const changeSet = await manager.getRepository(MainAgentChangeSetRecord).findOneBy({
    id: changeSetId
  })
  if (!changeSet) return null
  const effects = await manager.getRepository(MainAgentToolEffectReceiptRecord).find({
    where: { changeSetId },
    order: { persistedAt: 'ASC' }
  })
  const counts = emptyCounts()
  for (const effect of effects) counts[effect.status] += 1
  return {
    id: changeSet.id,
    scopeType: changeSet.scopeType,
    scopeId: changeSet.scopeId,
    eventId: changeSet.eventId,
    turnId: changeSet.turnId,
    sessionId: changeSet.sessionId,
    lifecycle: changeSet.lifecycle,
    outcome: resolveToolChangeSetOutcome(counts),
    title: changeSet.title ?? undefined,
    effectCount: effects.length,
    counts,
    subjectTypes: [...new Set(effects.map((effect) => effect.subjectType))],
    summaries: effects
      .filter((effect) => effect.status !== 'planned')
      .map((effect) => effect.summary)
      .filter(Boolean)
      .slice(-8),
    createdAt: changeSet.createdAt.toISOString(),
    sealedAt: changeSet.sealedAt?.toISOString()
  }
}

export const getToolChangeSetSummary = (
  dataSource: DataSource,
  changeSetId: string
): Promise<ToolChangeSetSummary | null> =>
  dataSource.transaction((manager) => buildSummaryWithManager(manager, changeSetId))

export const sealTurnChangeSetWithManager = async (
  manager: EntityManager,
  eventId: string,
  turnId: number
): Promise<ToolChangeSetSummary | null> => {
  const repository = manager.getRepository(MainAgentChangeSetRecord)
  const changeSet = await repository.findOneBy({ scopeType: 'turn', eventId, turnId })
  if (!changeSet) return null
  if (changeSet.lifecycle === 'open') {
    changeSet.lifecycle = 'sealed'
    changeSet.sealedAt = new Date()
    await repository.save(changeSet)
  }
  return buildSummaryWithManager(manager, changeSet.id)
}
