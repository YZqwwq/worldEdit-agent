import { randomUUID } from 'node:crypto'
import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type {
  MainAgentBackgroundPersonaStagePayload,
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

const getBackgroundStageDedupeKey = (payload: MainAgentBackgroundPersonaStagePayload): string =>
  `background_persona_stage:${payload.backgroundTaskId}:${payload.stageId}`

class MainAgentDispatchService {
  private readonly queue: QueueEntry[] = []
  private readonly queuedEventIds = new Set<string>()
  private readonly queuedTaskNotificationIds = new Set<number>()
  private readonly queuedBackgroundStageKeys = new Set<string>()
  private readonly eventStreamSubscribers = new Map<string, Set<(chunk: StreamChunk) => void>>()
  private processing = false
  private currentEvent: MainAgentEvent | null = null
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

    const counts = this.getQueuedCounts()
    const activeQueues = [
      counts.queuedUserCount,
      counts.queuedTaskNotificationCount,
      counts.queuedBackgroundCount
    ].filter((count) => count > 0).length

    if (activeQueues > 1) {
      return 'mixed-active'
    }
    if (counts.queuedUserCount > 0) {
      return 'user-active'
    }
    if (counts.queuedTaskNotificationCount > 0) {
      return 'task-active'
    }
    if (counts.queuedBackgroundCount > 0) {
      return 'background-active'
    }
    return 'idle'
  }

  getSnapshot(): TaskDispatchSnapshot {
    const counts = this.getQueuedCounts()

    return {
      state: this.getState(),
      ...counts,
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
      priority: 'deferred',
      createdAt: Date.now(),
      dedupeKey,
      payload: input
    })

    return this.enqueueLoadedEvent(event, {
      dedupeTaskNotificationId: input.notificationId
    })
  }

  async enqueueBackgroundPersonaStage(
    payload: MainAgentBackgroundPersonaStagePayload
  ): Promise<void> {
    const dedupeKey = getBackgroundStageDedupeKey(payload)
    if (this.queuedBackgroundStageKeys.has(dedupeKey)) {
      return
    }

    const existing = await mainAgentEventLogService.getActiveBackgroundPersonaStageEventByDedupeKey(dedupeKey)
    if (existing) {
      return this.enqueueLoadedEvent(existing, {
        dedupeBackgroundStageKey: dedupeKey
      })
    }

    const event = await mainAgentEventLogService.createBackgroundPersonaStageEvent({
      id: createId(),
      sessionId: DEFAULT_SESSION_ID,
      priority: 'idle',
      createdAt: Date.now(),
      dedupeKey,
      payload
    })

    return this.enqueueLoadedEvent(event, {
      dedupeBackgroundStageKey: dedupeKey
    })
  }

  async enqueueRecoveredEvent(event: MainAgentEvent): Promise<void> {
    return this.enqueueLoadedEvent(event, this.getDedupeOptionsForEvent(event))
  }

  async enqueuePersistedUserEvent(
    event: Extract<MainAgentEvent, { type: 'user_message' }>,
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
    this.queuedBackgroundStageKeys.clear()
    this.eventStreamSubscribers.clear()
    this.processing = false
    this.currentEvent = null
  }

  private getQueuedCounts(): Pick<
    TaskDispatchSnapshot,
    'queuedUserCount' | 'queuedTaskNotificationCount' | 'queuedBackgroundCount'
  > {
    return {
      queuedUserCount: this.queue.filter((entry) => entry.event.source === 'user').length,
      queuedTaskNotificationCount: this.queue.filter((entry) => entry.event.source === 'task_queue').length,
      queuedBackgroundCount: this.queue.filter((entry) => entry.event.source === 'background_persona').length
    }
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
      dedupeBackgroundStageKey?: string
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
      if (options?.dedupeBackgroundStageKey) {
        this.queuedBackgroundStageKeys.add(options.dedupeBackgroundStageKey)
      }
      this.queue.push({ event, resolve, reject })
      void this.drain()
    })
  }

  private pickNext(): QueueEntry | undefined {
    const userIndex = this.queue.findIndex((entry) => entry.event.source === 'user')
    if (userIndex >= 0) {
      return this.queue.splice(userIndex, 1)[0]
    }

    const taskIndex = this.queue.findIndex((entry) => entry.event.source === 'task_queue')
    if (taskIndex >= 0) {
      return this.queue.splice(taskIndex, 1)[0]
    }

    const backgroundIndex = this.queue.findIndex(
      (entry) => entry.event.source === 'background_persona'
    )
    if (backgroundIndex >= 0) {
      return this.queue.splice(backgroundIndex, 1)[0]
    }

    return undefined
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
          entry.resolve()
        } catch (error) {
          await mainAgentEventLogService.markFailed(entry.event.id, {
            errorMessage: error instanceof Error ? error.message : String(error)
          })
          entry.reject(error)
        } finally {
          this.clearQueuedEventDedupe(entry.event)
          this.currentEvent = null
        }
      }
    } finally {
      this.processing = false
    }
  }

  private getDedupeOptionsForEvent(event: MainAgentEvent): {
    dedupeTaskNotificationId?: number
    dedupeBackgroundStageKey?: string
  } {
    if (event.source === 'task_queue') {
      return {
        dedupeTaskNotificationId: event.payload.notificationId
      }
    }
    if (event.source === 'background_persona') {
      return {
        dedupeBackgroundStageKey: event.dedupeKey || getBackgroundStageDedupeKey(event.payload)
      }
    }
    return {}
  }

  private clearQueuedEventDedupe(event: MainAgentEvent): void {
    this.queuedEventIds.delete(event.id)
    this.eventStreamSubscribers.delete(event.id)
    if (event.source === 'task_queue') {
      this.queuedTaskNotificationIds.delete(event.payload.notificationId)
      return
    }
    if (event.source === 'background_persona') {
      this.queuedBackgroundStageKeys.delete(event.dedupeKey || getBackgroundStageDedupeKey(event.payload))
    }
  }

  private formatCurrentLabel(event: MainAgentEvent | null): string | undefined {
    if (!event) {
      return undefined
    }
    if (event.source === 'user') {
      return parseMainAgentContentForPersistence(event.payload.content).trim().slice(0, 48) || '用户消息处理中'
    }
    if (event.source === 'task_queue') {
      return `任务 #${event.payload.taskId} / 通知 #${event.payload.notificationId}`
    }
    return `后台任务 ${event.payload.title} / 阶段 ${event.payload.stageId}`
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
