import { randomUUID } from 'node:crypto'
import type { DataSource, EntityManager } from 'typeorm'
import { MainAgentToolEffectReceiptRecord } from '@share/entity/database/MainAgentToolEffectReceiptRecord'
import type {
  ToolEffectReceiptPayload,
  ToolEffectStatus,
  ToolEffectSubject
} from '@share/cache/AItype/states/toolEffect'
import {
  getToolEffectExecutionContext,
  type ToolEffectExecutionContext
} from './toolEffectExecutionContext'
import { ensureTurnChangeSetWithManager } from './toolChangeSetService'

export type CompletedToolEffect = {
  effectKey?: string
  operation: string
  subject: ToolEffectSubject
  beforeRevision?: number
  afterRevision?: number
  beforeRef?: string
  afterRef?: string
  summary: string
  evidenceRef?: string
  diffRef?: string
  resultRef?: string
  payload?: Record<string, unknown>
  compensatable?: boolean
}

export type PlannedToolEffect = {
  effectKey: string
  operation: string
  subject: ToolEffectSubject
  summary?: string
  payload?: Record<string, unknown>
  recoveryMode?: ToolEffectExecutionContext['recoveryMode']
}

export type SettledToolEffect = CompletedToolEffect & {
  effectKey: string
  status: Extract<ToolEffectStatus, 'completed' | 'failed' | 'aborted' | 'unknown'>
}

const parsePayload = (value: string): Record<string, unknown> | undefined => {
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

const toPayload = (record: MainAgentToolEffectReceiptRecord): ToolEffectReceiptPayload => ({
  id: record.id,
  changeSetId: record.changeSetId,
  eventId: record.eventId,
  turnId: record.turnId,
  toolCallId: record.toolCallId,
  effectKey: record.effectKey,
  toolName: record.toolName,
  recoveryMode: record.recoveryMode,
  operation: record.operation,
  subject: {
    type: record.subjectType,
    id: record.subjectId,
    label: record.subjectLabel ?? undefined
  },
  status: record.status,
  beforeRevision: record.beforeRevision ?? undefined,
  afterRevision: record.afterRevision ?? undefined,
  beforeRef: record.beforeRef ?? undefined,
  afterRef: record.afterRef ?? undefined,
  summary: record.summary,
  evidenceRef: record.evidenceRef ?? undefined,
  diffRef: record.diffRef ?? undefined,
  resultRef: record.resultRef ?? undefined,
  payload: parsePayload(record.payloadJson),
  compensatable: record.compensatable === 1,
  persistedAt: record.persistedAt.toISOString(),
  settledAt: record.settledAt?.toISOString()
})

const findLatestToolCallRecord = (
  manager: EntityManager,
  context: ToolEffectExecutionContext
): Promise<MainAgentToolEffectReceiptRecord | null> =>
  manager.getRepository(MainAgentToolEffectReceiptRecord).findOne({
    where: {
      eventId: context.eventId,
      turnId: context.turnId,
      toolCallId: context.toolCallId
    },
    order: { persistedAt: 'DESC' }
  })

const findToolCallRecordByEffectKey = (
  manager: EntityManager,
  context: ToolEffectExecutionContext,
  effectKey: string
): Promise<MainAgentToolEffectReceiptRecord | null> =>
  manager.getRepository(MainAgentToolEffectReceiptRecord).findOneBy({
    eventId: context.eventId,
    turnId: context.turnId,
    toolCallId: context.toolCallId,
    effectKey
  })

export const persistPlannedToolEffect = async (
  dataSource: DataSource,
  context: ToolEffectExecutionContext
): Promise<{ receipt: ToolEffectReceiptPayload; created: boolean }> =>
  dataSource.transaction(async (manager) => {
    await ensureTurnChangeSetWithManager(manager, context)
    const existing = await findLatestToolCallRecord(manager, context)
    if (existing) return { receipt: toPayload(existing), created: false }

    const record = manager.getRepository(MainAgentToolEffectReceiptRecord).create({
      id: randomUUID(),
      changeSetId: context.changeSetId,
      eventId: context.eventId,
      turnId: context.turnId,
      toolCallId: context.toolCallId,
      effectKey: 'primary',
      toolName: context.toolName,
      recoveryMode: context.recoveryMode,
      operation: context.toolName,
      subjectType: 'tool_call',
      subjectId: context.toolCallId,
      subjectLabel: null,
      status: 'planned',
      beforeRevision: null,
      afterRevision: null,
      beforeRef: null,
      afterRef: null,
      summary: `Planned side effect for ${context.toolName}`,
      evidenceRef: null,
      diffRef: null,
      resultRef: null,
      payloadJson: '{}',
      compensatable: 0,
      settledAt: null
    })
    return {
      receipt: toPayload(
        await manager.getRepository(MainAgentToolEffectReceiptRecord).save(record)
      ),
      created: true
    }
  })

const applyCompletedEffect = (
  record: MainAgentToolEffectReceiptRecord,
  effect: CompletedToolEffect
): void => {
  record.effectKey = effect.effectKey ?? 'primary'
  record.operation = effect.operation
  record.subjectType = effect.subject.type
  record.subjectId = effect.subject.id
  record.subjectLabel = effect.subject.label ?? null
  record.status = 'completed'
  record.beforeRevision = effect.beforeRevision ?? null
  record.afterRevision = effect.afterRevision ?? null
  record.beforeRef = effect.beforeRef ?? null
  record.afterRef = effect.afterRef ?? null
  record.summary = effect.summary
  record.evidenceRef = effect.evidenceRef ?? null
  record.diffRef = effect.diffRef ?? null
  record.resultRef = effect.resultRef ?? null
  record.payloadJson = JSON.stringify(effect.payload ?? {})
  record.compensatable = effect.compensatable ? 1 : 0
  record.settledAt = new Date()
}

export const persistCompletedToolEffects = async (
  manager: EntityManager,
  effects: CompletedToolEffect[]
): Promise<ToolEffectReceiptPayload[]> => {
  const context = getToolEffectExecutionContext()
  if (!context || effects.length === 0) return []

  await ensureTurnChangeSetWithManager(manager, context)
  const repository = manager.getRepository(MainAgentToolEffectReceiptRecord)
  const existingRecords = await repository.find({
    where: {
      eventId: context.eventId,
      turnId: context.turnId,
      toolCallId: context.toolCallId
    },
    order: { persistedAt: 'ASC' }
  })
  const unusedPlanned = existingRecords.find((record) => record.status === 'planned')
  const results: ToolEffectReceiptPayload[] = []

  for (const [index, effect] of effects.entries()) {
    const effectKey = effect.effectKey ?? (index === 0 ? 'primary' : `effect:${index}`)
    const existing = existingRecords.find((record) => record.effectKey === effectKey)
    const record =
      existing ??
      (index === 0 ? unusedPlanned : undefined) ??
      repository.create({
        id: randomUUID(),
        changeSetId: context.changeSetId,
        eventId: context.eventId,
        turnId: context.turnId,
        toolCallId: context.toolCallId,
        toolName: context.toolName,
        recoveryMode: context.recoveryMode,
        persistedAt: new Date()
      })
    applyCompletedEffect(record, { ...effect, effectKey })
    results.push(toPayload(await repository.save(record)))
  }
  return results
}

export const persistCompletedToolEffect = async (
  manager: EntityManager,
  effect: CompletedToolEffect
): Promise<ToolEffectReceiptPayload | null> =>
  (await persistCompletedToolEffects(manager, [effect]))[0] ?? null

/**
 * Registers one independently recoverable external action before it starts.
 * The first item reuses ToolNode's generic planned receipt so aggregation does
 * not gain an artificial extra "tool call" effect.
 */
export const planToolEffect = async (
  dataSource: DataSource,
  effect: PlannedToolEffect,
  explicitContext?: ToolEffectExecutionContext
): Promise<{ receipt: ToolEffectReceiptPayload; created: boolean } | null> => {
  const context = explicitContext ?? getToolEffectExecutionContext()
  if (!context) return null
  const effectKey = effect.effectKey.trim()
  if (!effectKey || effectKey === 'primary') {
    throw new Error('A planned child effect requires a non-primary effectKey.')
  }

  return dataSource.transaction(async (manager) => {
    await ensureTurnChangeSetWithManager(manager, context)
    const repository = manager.getRepository(MainAgentToolEffectReceiptRecord)
    const existing = await findToolCallRecordByEffectKey(manager, context, effectKey)
    if (existing) return { receipt: toPayload(existing), created: false }

    const genericPlanned = await repository.findOneBy({
      eventId: context.eventId,
      turnId: context.turnId,
      toolCallId: context.toolCallId,
      effectKey: 'primary',
      status: 'planned',
      subjectType: 'tool_call'
    })
    const record =
      genericPlanned ??
      repository.create({
        id: randomUUID(),
        changeSetId: context.changeSetId,
        eventId: context.eventId,
        turnId: context.turnId,
        toolCallId: context.toolCallId,
        toolName: context.toolName,
        persistedAt: new Date(),
        settledAt: null
      })
    record.effectKey = effectKey
    record.recoveryMode = effect.recoveryMode ?? context.recoveryMode
    record.operation = effect.operation
    record.subjectType = effect.subject.type
    record.subjectId = effect.subject.id
    record.subjectLabel = effect.subject.label ?? null
    record.status = 'planned'
    record.beforeRevision = null
    record.afterRevision = null
    record.beforeRef = null
    record.afterRef = null
    record.summary = effect.summary ?? `Planned ${effect.operation}`
    record.evidenceRef = null
    record.diffRef = null
    record.resultRef = null
    record.payloadJson = JSON.stringify(effect.payload ?? {})
    record.compensatable = 0
    return { receipt: toPayload(await repository.save(record)), created: true }
  })
}

export const settleToolEffect = async (
  dataSource: DataSource,
  effect: SettledToolEffect,
  explicitContext?: ToolEffectExecutionContext
): Promise<ToolEffectReceiptPayload | null> => {
  const context = explicitContext ?? getToolEffectExecutionContext()
  if (!context) return null
  return dataSource.transaction(async (manager) => {
    const record = await findToolCallRecordByEffectKey(manager, context, effect.effectKey)
    if (!record || (record.status !== 'planned' && record.status !== 'unknown')) {
      return record ? toPayload(record) : null
    }
    if (effect.status === 'completed') {
      applyCompletedEffect(record, effect)
    } else {
      record.status = effect.status
      record.operation = effect.operation
      record.subjectType = effect.subject.type
      record.subjectId = effect.subject.id
      record.subjectLabel = effect.subject.label ?? null
      record.beforeRevision = effect.beforeRevision ?? null
      record.afterRevision = effect.afterRevision ?? null
      record.beforeRef = effect.beforeRef ?? null
      record.afterRef = effect.afterRef ?? null
      record.summary = effect.summary
      record.evidenceRef = effect.evidenceRef ?? null
      record.diffRef = effect.diffRef ?? null
      record.resultRef = effect.resultRef ?? null
      record.payloadJson = JSON.stringify(effect.payload ?? {})
      record.compensatable = effect.compensatable ? 1 : 0
      record.settledAt = new Date()
    }
    return toPayload(await manager.getRepository(MainAgentToolEffectReceiptRecord).save(record))
  })
}

export const settlePlannedToolEffect = async (
  dataSource: DataSource,
  context: ToolEffectExecutionContext,
  input: {
    effectKey?: string
    status: Extract<ToolEffectStatus, 'completed' | 'failed' | 'aborted' | 'unknown'>
    operation?: string
    subject?: ToolEffectSubject
    summary: string
    evidenceRef?: string
    payload?: Record<string, unknown>
  }
): Promise<ToolEffectReceiptPayload | null> =>
  dataSource.transaction(async (manager) => {
    const record = await findToolCallRecordByEffectKey(
      manager,
      context,
      input.effectKey ?? 'primary'
    )
    if (!record) return null
    if (record.status === 'completed') return toPayload(record)
    if (record.status !== 'planned') return toPayload(record)

    record.status = input.status
    record.operation = input.operation ?? record.operation
    if (input.subject) {
      record.subjectType = input.subject.type
      record.subjectId = input.subject.id
      record.subjectLabel = input.subject.label ?? null
    }
    record.summary = input.summary
    record.evidenceRef = input.evidenceRef ?? null
    record.payloadJson = JSON.stringify(input.payload ?? {})
    record.settledAt = new Date()
    return toPayload(await manager.getRepository(MainAgentToolEffectReceiptRecord).save(record))
  })

export const settleOpenToolEffectsForCall = async (
  dataSource: DataSource,
  context: ToolEffectExecutionContext,
  input: {
    status: Extract<ToolEffectStatus, 'failed' | 'aborted' | 'unknown'>
    summary: string
  }
): Promise<ToolEffectReceiptPayload[]> =>
  dataSource.transaction(async (manager) => {
    const repository = manager.getRepository(MainAgentToolEffectReceiptRecord)
    const records = await repository.find({
      where: {
        eventId: context.eventId,
        turnId: context.turnId,
        toolCallId: context.toolCallId,
        status: 'planned'
      }
    })
    const settledAt = new Date()
    for (const record of records) {
      record.status = input.status
      record.summary = input.summary
      record.settledAt = settledAt
    }
    return (await repository.save(records)).map(toPayload)
  })

export const reconcileOrphanedPlannedToolEffects = async (
  dataSource: DataSource
): Promise<{ failed: number; unknown: number }> =>
  dataSource.transaction(async (manager) => {
    const repository = manager.getRepository(MainAgentToolEffectReceiptRecord)
    const settledAt = new Date()
    const failedResult = await repository
      .createQueryBuilder()
      .update()
      .set({
        status: 'failed',
        summary:
          'The atomic business transaction did not commit before the process ended; no side effect was published.',
        settledAt
      })
      .where('status = :status', { status: 'planned' })
      .andWhere('recoveryMode = :recoveryMode', {
        recoveryMode: 'same_database_transaction'
      })
      .execute()
    const unknownResult = await repository
      .createQueryBuilder()
      .update()
      .set({
        status: 'unknown',
        summary: 'Process ended before the side effect outcome was durably confirmed.',
        settledAt
      })
      .where('status = :status', { status: 'planned' })
      .execute()
    return {
      failed: failedResult.affected ?? 0,
      unknown: unknownResult.affected ?? 0
    }
  })

export const hasUnknownToolEffectsForEvent = async (
  dataSource: DataSource,
  eventId: string
): Promise<boolean> =>
  (await dataSource.getRepository(MainAgentToolEffectReceiptRecord).countBy({
    eventId,
    status: 'unknown'
  })) > 0

export const findCompletedToolEffectByCallId = async (
  dataSource: DataSource,
  input: { eventId: string; turnId: number; toolCallId: string }
): Promise<ToolEffectReceiptPayload | null> => {
  const record = await dataSource.getRepository(MainAgentToolEffectReceiptRecord).findOne({
    where: {
      eventId: input.eventId,
      turnId: input.turnId,
      toolCallId: input.toolCallId,
      status: 'completed'
    },
    order: { persistedAt: 'DESC' }
  })
  return record ? toPayload(record) : null
}

export const findToolEffectByCallId = async (
  dataSource: DataSource,
  input: { eventId: string; turnId: number; toolCallId: string }
): Promise<ToolEffectReceiptPayload | null> => {
  const record = await dataSource.getRepository(MainAgentToolEffectReceiptRecord).findOne({
    where: input,
    order: { persistedAt: 'DESC' }
  })
  return record ? toPayload(record) : null
}

export const listToolEffectsByCallId = async (
  dataSource: DataSource,
  input: { eventId: string; turnId: number; toolCallId: string }
): Promise<ToolEffectReceiptPayload[]> => {
  const records = await dataSource.getRepository(MainAgentToolEffectReceiptRecord).find({
    where: input,
    order: { persistedAt: 'ASC', id: 'ASC' }
  })
  return records.map(toPayload)
}
