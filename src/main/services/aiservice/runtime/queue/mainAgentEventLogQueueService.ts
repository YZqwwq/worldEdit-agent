import { AppDataSource } from '../../../../database'
import { MainAgentEventRecord } from '@share/entity/database/MainAgentEventRecord'
import type { MainAgentEventStatus } from '@share/cache/AItype/states/mainAgentEventState'
import type {
  MainAgentBackgroundPersonaStageEvent,
  MainAgentBackgroundPersonaStagePayload,
  MainAgentEvent,
  MainAgentEventConsumer,
  MainAgentTaskNotificationEvent,
  MainAgentUserMessageEvent
} from '@share/cache/AItype/states/taskLifecycleState'
import { assertMainAgentEventStatusTransition } from '@share/cache/AItype/states/mainAgentOrchestrationRules'
import {
  buildMainAgentMessageContent,
  normalizeMainAgentMessageContent,
  type MainAgentMessageContentPart
} from '@share/cache/AItype/states/mainAgentMessageContent'

type PersistedUserPayload = {
  messageId: number
  content: MainAgentMessageContentPart[]
}

type PersistedTaskPayload = {
  taskId: number
  notificationId: number
}

type CompletionInput = {
  consumer?: MainAgentEventConsumer
  summary?: string
}

const parseJsonObject = (input: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(input)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // ignore malformed persisted payloads
  }
  return {}
}

const toUserMessageEvent = (
  row: MainAgentEventRecord,
  payload: PersistedUserPayload
): MainAgentUserMessageEvent => ({
  id: row.id,
  type: 'user_message',
  source: 'user',
  sessionId: row.sessionId,
  priority: row.priority,
  createdAt: row.createdAtMs,
  dedupeKey: row.dedupeKey || undefined,
  payload: {
    messageId: payload.messageId,
    content: payload.content
  }
})

const normalizePersistedUserPayload = (
  payloadRaw: Record<string, unknown>
): PersistedUserPayload | null => {
  if (typeof payloadRaw.messageId !== 'number') {
    return null
  }

  const content = normalizeMainAgentMessageContent(payloadRaw.content)
  if (content.length > 0) {
    return {
      messageId: payloadRaw.messageId,
      content
    }
  }

  if (typeof payloadRaw.text !== 'string') {
    return null
  }

  return {
    messageId: payloadRaw.messageId,
    content: buildMainAgentMessageContent({
      text: payloadRaw.text
    })
  }
}

const toTaskNotificationEvent = (
  row: MainAgentEventRecord,
  payload: PersistedTaskPayload
): MainAgentTaskNotificationEvent => ({
  id: row.id,
  type: 'task_notification',
  source: 'task_queue',
  sessionId: row.sessionId,
  priority: row.priority,
  createdAt: row.createdAtMs,
  dedupeKey: row.dedupeKey || undefined,
  payload: {
    taskId: payload.taskId,
    notificationId: payload.notificationId
  }
})

const normalizeTaskNotificationPayload = (
  payloadRaw: Record<string, unknown>
): PersistedTaskPayload | null => {
  if (
    typeof payloadRaw.taskId !== 'number' ||
    typeof payloadRaw.notificationId !== 'number'
  ) {
    return null
  }
  return {
    taskId: payloadRaw.taskId,
    notificationId: payloadRaw.notificationId
  }
}

const toBackgroundPersonaStageEvent = (
  row: MainAgentEventRecord,
  payload: MainAgentBackgroundPersonaStagePayload
): MainAgentBackgroundPersonaStageEvent => ({
  id: row.id,
  type: 'background_persona_stage',
  source: 'background_persona',
  sessionId: row.sessionId,
  priority: row.priority,
  createdAt: row.createdAtMs,
  dedupeKey: row.dedupeKey || undefined,
  payload
})

const normalizeBackgroundPersonaStagePayload = (
  payloadRaw: Record<string, unknown>
): MainAgentBackgroundPersonaStagePayload | null => {
  const backgroundTaskId =
    typeof payloadRaw.backgroundTaskId === 'string' ? payloadRaw.backgroundTaskId.trim() : ''
  const stageId = typeof payloadRaw.stageId === 'string' ? payloadRaw.stageId.trim() : ''
  const stageKind = typeof payloadRaw.stageKind === 'string' ? payloadRaw.stageKind.trim() : ''
  const title = typeof payloadRaw.title === 'string' ? payloadRaw.title.trim() : ''
  const resumePointer =
    typeof payloadRaw.resumePointer === 'string' ? payloadRaw.resumePointer.trim() : ''
  const instruction =
    typeof payloadRaw.instruction === 'string' ? payloadRaw.instruction.trim() : ''

  if (!backgroundTaskId || !stageId || !stageKind || !title || !resumePointer || !instruction) {
    return null
  }

  const input =
    payloadRaw.input && typeof payloadRaw.input === 'object' && !Array.isArray(payloadRaw.input)
      ? (payloadRaw.input as Record<string, unknown>)
      : {}
  const context =
    payloadRaw.context && typeof payloadRaw.context === 'object' && !Array.isArray(payloadRaw.context)
      ? (payloadRaw.context as Record<string, unknown>)
      : undefined
  const expectedResult =
    typeof payloadRaw.expectedResult === 'string' && payloadRaw.expectedResult.trim()
      ? payloadRaw.expectedResult.trim()
      : undefined

  return {
    backgroundTaskId,
    stageId,
    stageKind,
    title,
    resumePointer,
    instruction,
    input,
    expectedResult,
    context
  }
}

class MainAgentEventLogService {
  private get repo() {
    return AppDataSource.getRepository(MainAgentEventRecord)
  }

  async createUserMessageEvent(input: {
    id: string
    sessionId: string
    priority: MainAgentUserMessageEvent['priority']
    createdAt: number
    payload: PersistedUserPayload
  }): Promise<MainAgentUserMessageEvent> {
    const row = this.repo.create({
      id: input.id,
      type: 'user_message',
      source: 'user',
      sessionId: input.sessionId,
      priority: input.priority,
      createdAtMs: input.createdAt,
      dedupeKey: null,
      payloadJson: JSON.stringify(input.payload),
      status: 'queued',
      consumer: null,
      summary: '',
      errorMessage: '',
      startedAt: null,
      finishedAt: null
    })
    await this.repo.save(row)
    return toUserMessageEvent(row, input.payload)
  }

  async getActiveTaskNotificationEventByDedupeKey(
    dedupeKey: string
  ): Promise<MainAgentTaskNotificationEvent | null> {
    const row = await this.repo.findOne({
      where: [
        { dedupeKey, status: 'queued' },
        { dedupeKey, status: 'processing' }
      ],
      order: { persistedAt: 'DESC' }
    })
    if (!row || row.type !== 'task_notification') {
      return null
    }
    const payload = normalizeTaskNotificationPayload(parseJsonObject(row.payloadJson))
    return payload ? toTaskNotificationEvent(row, payload) : null
  }

  async createTaskNotificationEvent(input: {
    id: string
    sessionId: string
    priority: MainAgentTaskNotificationEvent['priority']
    createdAt: number
    dedupeKey: string
    payload: PersistedTaskPayload
  }): Promise<MainAgentTaskNotificationEvent> {
    const row = this.repo.create({
      id: input.id,
      type: 'task_notification',
      source: 'task_queue',
      sessionId: input.sessionId,
      priority: input.priority,
      createdAtMs: input.createdAt,
      dedupeKey: input.dedupeKey,
      payloadJson: JSON.stringify(input.payload),
      status: 'queued',
      consumer: null,
      summary: '',
      errorMessage: '',
      startedAt: null,
      finishedAt: null
    })
    await this.repo.save(row)
    return toTaskNotificationEvent(row, input.payload)
  }

  async getActiveBackgroundPersonaStageEventByDedupeKey(
    dedupeKey: string
  ): Promise<MainAgentBackgroundPersonaStageEvent | null> {
    const row = await this.repo.findOne({
      where: [
        { dedupeKey, status: 'queued' },
        { dedupeKey, status: 'processing' }
      ],
      order: { persistedAt: 'DESC' }
    })
    if (!row || row.type !== 'background_persona_stage') {
      return null
    }
    const payload = normalizeBackgroundPersonaStagePayload(parseJsonObject(row.payloadJson))
    return payload ? toBackgroundPersonaStageEvent(row, payload) : null
  }

  async createBackgroundPersonaStageEvent(input: {
    id: string
    sessionId: string
    priority: MainAgentBackgroundPersonaStageEvent['priority']
    createdAt: number
    dedupeKey: string
    payload: MainAgentBackgroundPersonaStagePayload
  }): Promise<MainAgentBackgroundPersonaStageEvent> {
    const row = this.repo.create({
      id: input.id,
      type: 'background_persona_stage',
      source: 'background_persona',
      sessionId: input.sessionId,
      priority: input.priority,
      createdAtMs: input.createdAt,
      dedupeKey: input.dedupeKey,
      payloadJson: JSON.stringify(input.payload),
      status: 'queued',
      consumer: null,
      summary: '',
      errorMessage: '',
      startedAt: null,
      finishedAt: null
    })
    await this.repo.save(row)
    return toBackgroundPersonaStageEvent(row, input.payload)
  }

  async markProcessing(eventId: string): Promise<void> {
    const row = await this.repo.findOneBy({ id: eventId })
    if (!row) return
    assertMainAgentEventStatusTransition(row.status, 'processing')
    row.status = 'processing'
    row.startedAt = row.startedAt ?? new Date()
    row.finishedAt = null
    await this.repo.save(row)
  }

  async markCompleted(eventId: string, input?: CompletionInput): Promise<void> {
    const row = await this.repo.findOneBy({ id: eventId })
    if (!row) return
    assertMainAgentEventStatusTransition(row.status, 'completed')
    row.status = 'completed'
    row.consumer = input?.consumer ?? row.consumer
    row.summary = input?.summary?.trim() || row.summary
    row.errorMessage = ''
    row.finishedAt = new Date()
    await this.repo.save(row)
  }

  async markFailed(
    eventId: string,
    input: { errorMessage: string; consumer?: MainAgentEventConsumer; summary?: string }
  ): Promise<void> {
    const row = await this.repo.findOneBy({ id: eventId })
    if (!row) return
    assertMainAgentEventStatusTransition(row.status, 'failed')
    row.status = 'failed'
    row.consumer = input.consumer ?? row.consumer
    row.summary = input.summary?.trim() || row.summary
    row.errorMessage = input.errorMessage.trim()
    row.finishedAt = new Date()
    await this.repo.save(row)
  }

  async resetToQueued(eventId: string): Promise<void> {
    const row = await this.repo.findOneBy({ id: eventId })
    if (!row) return
    assertMainAgentEventStatusTransition(row.status, 'queued')
    row.status = 'queued'
    row.finishedAt = null
    await this.repo.save(row)
  }

  async getEventById(eventId: string): Promise<MainAgentEvent | null> {
    const row = await this.repo.findOneBy({ id: eventId })
    if (!row) {
      return null
    }

    const payloadRaw = parseJsonObject(row.payloadJson)
    if (row.type === 'user_message') {
      const payload = normalizePersistedUserPayload(payloadRaw)
      return payload ? toUserMessageEvent(row, payload) : null
    }
    if (row.type === 'task_notification') {
      const payload = normalizeTaskNotificationPayload(payloadRaw)
      return payload ? toTaskNotificationEvent(row, payload) : null
    }
    if (row.type === 'background_persona_stage') {
      const payload = normalizeBackgroundPersonaStagePayload(payloadRaw)
      return payload ? toBackgroundPersonaStageEvent(row, payload) : null
    }
    return null
  }

  async listQueuedEvents(): Promise<MainAgentEvent[]> {
    const rows = await this.repo.find({
      where: { status: 'queued' },
      order: { createdAtMs: 'ASC', persistedAt: 'ASC' }
    })

    const events: MainAgentEvent[] = []
    for (const row of rows) {
      const event = await this.getEventById(row.id)
      if (event) {
        events.push(event)
      }
    }
    return events
  }

  async listProcessingEvents(): Promise<MainAgentEvent[]> {
    const rows = await this.repo.find({
      where: { status: 'processing' },
      order: { startedAt: 'ASC', createdAtMs: 'ASC' }
    })

    const events: MainAgentEvent[] = []
    for (const row of rows) {
      const event = await this.getEventById(row.id)
      if (event) {
        events.push(event)
      }
    }
    return events
  }

  async clearAll(): Promise<void> {
    await this.repo.clear()
  }

  async listByStatus(status: MainAgentEventStatus): Promise<MainAgentEventRecord[]> {
    return this.repo.find({
      where: { status },
      order: { createdAtMs: 'ASC', persistedAt: 'ASC' }
    })
  }

  async listTaskNotificationEventsByStatuses(
    statuses: MainAgentEventStatus[]
  ): Promise<MainAgentTaskNotificationEvent[]> {
    if (statuses.length === 0) {
      return []
    }

    const rows = await this.repo.find({
      where: statuses.map((status) => ({ status, type: 'task_notification' })),
      order: { createdAtMs: 'ASC', persistedAt: 'ASC' }
    })

    const events: MainAgentTaskNotificationEvent[] = []
    for (const row of rows) {
      const payload = normalizeTaskNotificationPayload(parseJsonObject(row.payloadJson))
      if (payload) {
        events.push(toTaskNotificationEvent(row, payload))
      }
    }
    return events
  }
}

export const mainAgentEventLogService = new MainAgentEventLogService()
