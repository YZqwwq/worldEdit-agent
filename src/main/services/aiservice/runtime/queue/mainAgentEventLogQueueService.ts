import { AppDataSource } from '../../../../database'
import { MainAgentEventRecord } from '@share/entity/database/MainAgentEventRecord'
import type { MainAgentEventStatus } from '@share/cache/AItype/states/mainAgentEventState'
import type {
  MainAgentEvent,
  MainAgentEventConsumer,
  MainAgentTaskNotificationEvent,
  MainAgentUserMessageEvent
} from '@share/cache/AItype/states/taskLifecycleState'
import { assertMainAgentEventStatusTransition } from '@share/cache/AItype/states/mainAgentOrchestrationRules'

type PersistedUserPayload = {
  messageId: number
  text: string
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
    text: payload.text
  }
})

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
    const payloadRaw = parseJsonObject(row.payloadJson)
    if (
      typeof payloadRaw.taskId !== 'number' ||
      typeof payloadRaw.notificationId !== 'number'
    ) {
      return null
    }
    return toTaskNotificationEvent(row, {
      taskId: payloadRaw.taskId,
      notificationId: payloadRaw.notificationId
    })
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
      if (
        typeof payloadRaw.messageId !== 'number' ||
        typeof payloadRaw.text !== 'string'
      ) {
        return null
      }
      return toUserMessageEvent(row, {
        messageId: payloadRaw.messageId,
        text: payloadRaw.text
      })
    }

    if (
      typeof payloadRaw.taskId !== 'number' ||
      typeof payloadRaw.notificationId !== 'number'
    ) {
      return null
    }
    return toTaskNotificationEvent(row, {
      taskId: payloadRaw.taskId,
      notificationId: payloadRaw.notificationId
    })
  }

  async listQueuedUserEvents(): Promise<MainAgentUserMessageEvent[]> {
    const rows = await this.repo.find({
      where: { type: 'user_message', status: 'queued' },
      order: { createdAtMs: 'ASC', persistedAt: 'ASC' }
    })
    return rows.flatMap((row) => {
      const payloadRaw = parseJsonObject(row.payloadJson)
      if (
        typeof payloadRaw.messageId !== 'number' ||
        typeof payloadRaw.text !== 'string'
      ) {
        return []
      }
      return [
        toUserMessageEvent(row, {
          messageId: payloadRaw.messageId,
          text: payloadRaw.text
        })
      ]
    })
  }

  async listProcessingEvents(): Promise<MainAgentEvent[]> {
    const rows = await this.repo.find({
      where: { status: 'processing' },
      order: { startedAt: 'ASC', createdAtMs: 'ASC' }
    })
    const events: MainAgentEvent[] = []
    for (const row of rows) {
      const payloadRaw = parseJsonObject(row.payloadJson)
      if (row.type === 'user_message') {
        if (
          typeof payloadRaw.messageId !== 'number' ||
          typeof payloadRaw.text !== 'string'
        ) {
          continue
        }
        events.push(
          toUserMessageEvent(row, {
            messageId: payloadRaw.messageId,
            text: payloadRaw.text
          })
        )
        continue
      }
      if (
        typeof payloadRaw.taskId !== 'number' ||
        typeof payloadRaw.notificationId !== 'number'
      ) {
        continue
      }
      events.push(
        toTaskNotificationEvent(row, {
          taskId: payloadRaw.taskId,
          notificationId: payloadRaw.notificationId
        })
      )
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
      const payloadRaw = parseJsonObject(row.payloadJson)
      if (
        typeof payloadRaw.taskId !== 'number' ||
        typeof payloadRaw.notificationId !== 'number'
      ) {
        continue
      }
      events.push(
        toTaskNotificationEvent(row, {
          taskId: payloadRaw.taskId,
          notificationId: payloadRaw.notificationId
        })
      )
    }
    return events
  }
}

export const mainAgentEventLogService = new MainAgentEventLogService()
