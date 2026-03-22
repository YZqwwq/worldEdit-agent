import { randomUUID } from 'node:crypto'
import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type {
  MainAgentDispatchState,
  TaskDispatchSnapshot
} from '@share/cache/AItype/states/taskLifecycleState'

type UserInboxItem = {
  id: string
  source: 'user'
  createdAt: number
  payload: {
    messageId: number
    text: string
    onChunk?: (chunk: StreamChunk) => void
  }
}

type TaskQueueInboxItem = {
  id: string
  source: 'task_queue'
  createdAt: number
  payload: {
    taskId: number
    notificationId: number
  }
}

type MainAgentInboxItem = UserInboxItem | TaskQueueInboxItem

type DispatchHandlers = {
  processUserMessage?: (input: UserInboxItem['payload']) => Promise<void>
  processTaskNotification?: (input: TaskQueueInboxItem['payload']) => Promise<void>
}

type QueueEntry = {
  item: MainAgentInboxItem
  resolve: () => void
  reject: (error: unknown) => void
}

const createId = (): string => randomUUID()

class MainAgentDispatchService {
  private readonly queue: QueueEntry[] = []
  private readonly queuedTaskNotificationIds = new Set<number>()
  private processing = false
  private currentItem: MainAgentInboxItem | null = null
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

    const queuedUserCount = this.queue.filter((entry) => entry.item.source === 'user').length
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
    const queuedUserCount = this.queue.filter((entry) => entry.item.source === 'user').length
    const queuedTaskCount = this.queue.length - queuedUserCount

    return {
      state: this.getState(),
      queuedUserCount,
      queuedTaskCount,
      totalQueued: this.queue.length,
      currentSource: this.currentItem?.source,
      currentLabel: this.formatCurrentLabel(this.currentItem)
    }
  }

  async enqueueUserMessage(input: UserInboxItem['payload']): Promise<void> {
    return this.enqueue({
      id: createId(),
      source: 'user',
      createdAt: Date.now(),
      payload: input
    })
  }

  async enqueueTaskNotification(input: TaskQueueInboxItem['payload']): Promise<void> {
    if (this.queuedTaskNotificationIds.has(input.notificationId)) {
      return
    }

    return this.enqueue({
      id: createId(),
      source: 'task_queue',
      createdAt: Date.now(),
      payload: input
    }, { dedupeTaskNotificationId: input.notificationId })
  }

  reset(): void {
    while (this.queue.length > 0) {
      const entry = this.queue.shift()
      entry?.reject(new Error('Main agent dispatch queue has been reset.'))
    }
    this.queuedTaskNotificationIds.clear()
    this.processing = false
    this.currentItem = null
  }

  private async enqueue(
    item: MainAgentInboxItem,
    options?: { dedupeTaskNotificationId?: number }
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (typeof options?.dedupeTaskNotificationId === 'number') {
        this.queuedTaskNotificationIds.add(options.dedupeTaskNotificationId)
      }
      this.queue.push({ item, resolve, reject })
      void this.drain()
    })
  }

  private pickNext(): QueueEntry | undefined {
    const userIndex = this.queue.findIndex((entry) => entry.item.source === 'user')
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
          this.currentItem = entry.item
          await this.processInboxItem(entry.item)
          entry.resolve()
        } catch (error) {
          entry.reject(error)
        } finally {
          if (entry.item.source === 'task_queue') {
            this.queuedTaskNotificationIds.delete(entry.item.payload.notificationId)
          }
          this.currentItem = null
        }
      }
    } finally {
      this.processing = false
    }
  }

  private formatCurrentLabel(item: MainAgentInboxItem | null): string | undefined {
    if (!item) {
      return undefined
    }
    if (item.source === 'user') {
      return item.payload.text.trim().slice(0, 48) || '用户消息处理中'
    }
    return `任务 #${item.payload.taskId} / 通知 #${item.payload.notificationId}`
  }

  private async processInboxItem(item: MainAgentInboxItem): Promise<void> {
    if (item.source === 'user') {
      if (!this.handlers.processUserMessage) {
        throw new Error('MainAgentDispatchService is missing processUserMessage handler.')
      }
      await this.handlers.processUserMessage(item.payload)
      return
    }

    if (!this.handlers.processTaskNotification) {
      throw new Error('MainAgentDispatchService is missing processTaskNotification handler.')
    }
    await this.handlers.processTaskNotification(item.payload)
  }
}

export const mainAgentDispatchService = new MainAgentDispatchService()
