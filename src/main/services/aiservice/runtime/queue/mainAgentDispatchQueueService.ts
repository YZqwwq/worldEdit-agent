import { randomUUID } from 'node:crypto'
import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type {
  MainAgentEvent,
  MainAgentEventConsumptionResult,
  MainAgentDispatchState,
  MainAgentTaskNotificationPayload,
  TaskDispatchSnapshot
} from '@share/cache/AItype/states/taskLifecycleState'
import type { MainAgentMessageContentPart } from '@share/cache/AItype/states/mainAgentMessageContent'
import { parseMainAgentContentForPersistence } from '../../messagecontent/mainAgentMessageContentService'
import { mainAgentEventLogService } from './mainAgentEventLogQueueService'

type DispatchHandlers = {
  processEvent?: (
    event: MainAgentEvent,
    runtime?: { onChunk?: (chunk: StreamChunk) => void }
  ) => Promise<MainAgentEventConsumptionResult>
}

type QueueEntry = {
  event: MainAgentEvent
  resolve: () => void
  reject: (error: unknown) => void
}

const createId = (): string => randomUUID()
const DEFAULT_SESSION_ID = 'default'
const MAX_CONSECUTIVE_USER_EVENTS = 3

class MainAgentDispatchService {
  private readonly queue: QueueEntry[] = []
  private readonly queuedEventIds = new Set<string>()
  private readonly queuedTaskNotificationIds = new Set<number>()
  private readonly eventStreamSubscribers = new Map<string, Set<(chunk: StreamChunk) => void>>()
  private processing = false
  private currentEvent: MainAgentEvent | null = null
  private consecutiveUserEventsProcessed = 0
  private handlers: DispatchHandlers = {}

  configure(handlers: DispatchHandlers): void {
    this.handlers = {
      ...this.handlers,
      ...handlers
    }
  }

  getState(): MainAgentDispatchState {
    if (this.processing) {
      return 'processing'
    }

    const queuedUserCount = this.queue.filter((entry) => entry.event.source === 'user').length
    const queuedTaskCount = this.queue.length - queuedUserCount

    if (queuedUserCount > 0 && queuedTaskCount > 0) {
      return 'active'
    }
    if (queuedUserCount > 0) {
      return 'user-active'
    }
    if (queuedTaskCount > 0) {
      return 'tasklist-active'
    }
    return 'idle'
  }

  getSnapshot(): TaskDispatchSnapshot {
    const queuedUserCount = this.queue.filter((entry) => entry.event.source === 'user').length
    const queuedTaskCount = this.queue.length - queuedUserCount

    return {
      state: this.getState(),
      queuedUserCount,
      queuedTaskCount,
      totalQueued: this.queue.length,
      currentSource: this.currentEvent?.source,
      currentEventType: this.currentEvent?.type,
      currentLabel: this.formatCurrentLabel(this.currentEvent)
    }
  }

  async enqueueUserMessage(input: {
    messageId: number
    content: MainAgentMessageContentPart[]
    onChunk?: (chunk: StreamChunk) => void
  }): Promise<void> {
    const event = await mainAgentEventLogService.createUserMessageEvent({
      id: createId(),
      sessionId: DEFAULT_SESSION_ID,
      priority: 'interactive',
      createdAt: Date.now(),
      payload: {
        messageId: input.messageId,
        content: input.content
      }
    })
    return this.enqueueLoadedEvent(event, {
      onChunk: input.onChunk
    })
  }

  async enqueueTaskNotification(input: MainAgentTaskNotificationPayload): Promise<void> {
    if (this.queuedTaskNotificationIds.has(input.notificationId)) {
      return
    }

    const dedupeKey = `task_notification:${input.notificationId}`
    const existing = await mainAgentEventLogService.getActiveTaskNotificationEventByDedupeKey(dedupeKey)
    if (existing) {
      return this.enqueueLoadedEvent(existing, {
        dedupeTaskNotificationId: input.notificationId
      })
    }

    const event = await mainAgentEventLogService.createTaskNotificationEvent({
      id: createId(),
      sessionId: DEFAULT_SESSION_ID,
      priority: 'background',
      createdAt: Date.now(),
      dedupeKey,
      payload: input
    })

    return this.enqueueLoadedEvent(event, {
      dedupeTaskNotificationId: input.notificationId
    })
  }

  async enqueueRecoveredEvent(event: MainAgentEvent): Promise<void> {
    return this.enqueueLoadedEvent(event)
  }

  async enqueuePersistedUserEvent(
    event: MainAgentEvent,
    onChunk?: (chunk: StreamChunk) => void
  ): Promise<void> {
    return this.enqueueLoadedEvent(event, { onChunk })
  }

  reset(): void {
    while (this.queue.length > 0) {
      const entry = this.queue.shift()
      entry?.reject(new Error('Main agent dispatch queue has been reset.'))
    }
    this.queuedEventIds.clear()
    this.queuedTaskNotificationIds.clear()
    this.eventStreamSubscribers.clear()
    this.processing = false
    this.currentEvent = null
    this.consecutiveUserEventsProcessed = 0
  }

  private addStreamSubscriber(eventId: string, onChunk?: (chunk: StreamChunk) => void): void {
    if (!onChunk) {
      return
    }
    const existing = this.eventStreamSubscribers.get(eventId)
    if (existing) {
      existing.add(onChunk)
      return
    }
    this.eventStreamSubscribers.set(eventId, new Set([onChunk]))
  }

  private dispatchChunk(eventId: string, chunk: StreamChunk): void {
    const subscribers = this.eventStreamSubscribers.get(eventId)
    if (!subscribers || subscribers.size === 0) {
      return
    }
    for (const subscriber of subscribers) {
      subscriber(chunk)
    }
  }

  private async enqueueLoadedEvent(
    event: MainAgentEvent,
    options?: {
      dedupeTaskNotificationId?: number
      onChunk?: (chunk: StreamChunk) => void
    }
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.addStreamSubscriber(event.id, options?.onChunk)
      if (this.queuedEventIds.has(event.id)) {
        resolve()
        return
      }
      this.queuedEventIds.add(event.id)
      if (typeof options?.dedupeTaskNotificationId === 'number') {
        this.queuedTaskNotificationIds.add(options.dedupeTaskNotificationId)
      }
      this.queue.push({ event, resolve, reject })
      void this.drain()
    })
  }

  private pickNext(): QueueEntry | undefined {
    const hasTaskEvent = this.queue.some((entry) => entry.event.source === 'task_queue')
    const shouldForceTaskEvent =
      hasTaskEvent && this.consecutiveUserEventsProcessed >= MAX_CONSECUTIVE_USER_EVENTS

    if (!shouldForceTaskEvent) {
      const userIndex = this.queue.findIndex((entry) => entry.event.source === 'user')
      if (userIndex >= 0) {
        return this.queue.splice(userIndex, 1)[0]
      }
    }

    const taskIndex = this.queue.findIndex((entry) => entry.event.source === 'task_queue')
    if (taskIndex >= 0) {
      return this.queue.splice(taskIndex, 1)[0]
    }

    const userIndex = this.queue.findIndex((entry) => entry.event.source === 'user')
    if (userIndex >= 0) {
      return this.queue.splice(userIndex, 1)[0]
    }

    return this.queue.shift()
  }

  private async drain(): Promise<void> {
    if (this.processing) {
      return
    }

    this.processing = true
    try {
      while (this.queue.length > 0) {
        const entry = this.pickNext()
        if (!entry) {
          break
        }

        try {
          this.currentEvent = entry.event
          await mainAgentEventLogService.markProcessing(entry.event.id)
          const result = await this.processEvent(entry.event, {
            onChunk: (chunk) => this.dispatchChunk(entry.event.id, chunk)
          })
          await mainAgentEventLogService.markCompleted(entry.event.id, {
            consumer: result.consumer,
            summary: result.summary
          })
          this.trackProcessedEvent(entry.event)
          entry.resolve()
        } catch (error) {
          await mainAgentEventLogService.markFailed(entry.event.id, {
            errorMessage: error instanceof Error ? error.message : String(error)
          })
          entry.reject(error)
        } finally {
          this.queuedEventIds.delete(entry.event.id)
          this.eventStreamSubscribers.delete(entry.event.id)
          if (entry.event.source === 'task_queue') {
            this.queuedTaskNotificationIds.delete(entry.event.payload.notificationId)
          }
          this.currentEvent = null
        }
      }
    } finally {
      this.processing = false
    }
  }

  private trackProcessedEvent(event: MainAgentEvent): void {
    if (event.source === 'user') {
      this.consecutiveUserEventsProcessed += 1
      return
    }
    this.consecutiveUserEventsProcessed = 0
  }

  private formatCurrentLabel(event: MainAgentEvent | null): string | undefined {
    if (!event) {
      return undefined
    }
    if (event.source === 'user') {
      return parseMainAgentContentForPersistence(event.payload.content).trim().slice(0, 48) || '用户消息处理中'
    }
    return `任务 #${event.payload.taskId} / 通知 #${event.payload.notificationId}`
  }

  private async processEvent(
    event: MainAgentEvent,
    runtime?: { onChunk?: (chunk: StreamChunk) => void }
  ): Promise<MainAgentEventConsumptionResult> {
    if (!this.handlers.processEvent) {
      throw new Error('MainAgentDispatchService is missing processEvent handler.')
    }
    return this.handlers.processEvent(event, runtime)
  }
}

export const mainAgentDispatchService = new MainAgentDispatchService()
