import { AppDataSource } from '../../database'
import { TaskExecutionRecord } from '../../../share/entity/database/TaskExecutionRecord'
import { TaskNotificationRecord } from '../../../share/entity/database/TaskNotificationRecord'
import { TaskRecord } from '../../../share/entity/database/TaskRecord'
import type {
  ActiveTaskSnapshot,
  TaskLifecycleNotice,
  TaskNotificationType
} from '@share/cache/AItype/states/taskLifecycleState'
import {
  buildTaskNoticeFromSubAgentPayload,
  getExecutionStatusForSubAgentOutcome,
  parseSubAgentProtocolPayload,
  taskNotificationTypeToSubAgentOutcome,
  type SubAgentProtocolPayload
} from '@share/cache/AItype/states/taskCommunication'
import { assertTaskStatusTransition } from '@share/cache/AItype/states/taskLifecycleRules'

type PublishExecutionEventInput = {
  taskId: number
  executionId: number
  type: TaskNotificationType
  summary: string
  payload: SubAgentProtocolPayload
  errorReport?: string
}

type ConsumedNotificationResult = {
  activeTask: ActiveTaskSnapshot
  notice: TaskLifecycleNotice
  notification: TaskNotificationRecord
  payload: SubAgentProtocolPayload
  nextStatus: TaskRecord['status']
}

const toSnapshot = (task: TaskRecord): ActiveTaskSnapshot => ({
  id: task.id,
  title: task.title,
  goal: task.goal,
  summary: task.summary,
  status: task.status,
  executorKind: task.executorKind,
  progressNotes: task.progressNotes || undefined
})

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

const buildConsumedNotice = (
  task: TaskRecord,
  notification: TaskNotificationRecord,
  payload: SubAgentProtocolPayload
) =>
  buildTaskNoticeFromSubAgentPayload({
    taskTitle: task.title,
    outcome: taskNotificationTypeToSubAgentOutcome(notification.type),
    payload
  })

class TaskNotificationService {
  private get repo() {
    return AppDataSource.getRepository(TaskNotificationRecord)
  }

  async publishExecutionEvent(input: PublishExecutionEventInput): Promise<TaskNotificationRecord> {
    return AppDataSource.transaction(async (manager) => {
      const taskRepo = manager.getRepository(TaskRecord)
      const executionRepo = manager.getRepository(TaskExecutionRecord)
      const notificationRepo = manager.getRepository(TaskNotificationRecord)

      const [task, execution] = await Promise.all([
        taskRepo.findOneBy({ id: input.taskId }),
        executionRepo.findOneBy({ id: input.executionId })
      ])

      if (!task) {
        throw new Error(`Task not found: ${input.taskId}`)
      }
      if (!execution) {
        throw new Error(`Task execution not found: ${input.executionId}`)
      }

      execution.status = getExecutionStatusForSubAgentOutcome(
        taskNotificationTypeToSubAgentOutcome(input.type)
      )
      execution.resultSummary = input.summary.trim()
      execution.reportPayloadJson = JSON.stringify(input.payload)
      if (input.errorReport?.trim()) {
        execution.errorReport = input.errorReport.trim()
      }
      if (!execution.startedAt) {
        execution.startedAt = new Date()
      }
      execution.finishedAt = new Date()

      assertTaskStatusTransition(task.status, 'pending_main_ack')
      task.status = 'pending_main_ack'

      const notification = notificationRepo.create({
        taskId: input.taskId,
        executionId: input.executionId,
        type: input.type,
        status: 'pending',
        mainAgentEventId: null,
        payloadJson: JSON.stringify(input.payload)
      })

      await executionRepo.save(execution)
      await taskRepo.save(task)
      return notificationRepo.save(notification)
    })
  }

  async getNextPendingNotification(taskId: number): Promise<TaskNotificationRecord | null> {
    const rows = await this.repo.find({
      where: { taskId, status: 'pending' },
      order: { createdAt: 'ASC' },
      take: 1
    })

    return rows[0] ?? null
  }

  async getNotification(
    taskId: number,
    notificationId: number
  ): Promise<TaskNotificationRecord | null> {
    return this.repo.findOneBy({
      id: notificationId,
      taskId
    })
  }

  async beginMainAgentConsumption(
    taskId: number,
    notificationId: number,
    eventId: string
  ): Promise<ConsumedNotificationResult | null> {
    return AppDataSource.transaction(async (manager) => {
      const taskRepo = manager.getRepository(TaskRecord)
      const notificationRepo = manager.getRepository(TaskNotificationRecord)

      const task = await taskRepo.findOneBy({ id: taskId })
      if (!task) {
        throw new Error(`Task not found: ${taskId}`)
      }

      const notification = await notificationRepo.findOneBy({
        id: notificationId,
        taskId
      })
      if (!notification) {
        return null
      }

      if (notification.status === 'consumed') {
        if (notification.mainAgentEventId !== eventId) {
          return null
        }
      } else if (notification.status === 'processing') {
        if (notification.mainAgentEventId !== eventId) {
          return null
        }
      } else {
        notification.status = 'processing'
        notification.mainAgentEventId = eventId
        notification.processingStartedAt = new Date()
        await notificationRepo.save(notification)
      }

      const payload = parseSubAgentProtocolPayload(parseJsonObject(notification.payloadJson), {
        outcome: taskNotificationTypeToSubAgentOutcome(notification.type)
      })
      const consumed = buildConsumedNotice(task, notification, payload)

      return {
        activeTask: toSnapshot(task),
        notice: consumed.notice,
        notification,
        payload,
        nextStatus: consumed.nextStatus
      }
    })
  }

  async completeMainAgentConsumption(
    taskId: number,
    notificationId: number,
    eventId: string
  ): Promise<ConsumedNotificationResult | null> {
    return AppDataSource.transaction(async (manager) => {
      const taskRepo = manager.getRepository(TaskRecord)
      const notificationRepo = manager.getRepository(TaskNotificationRecord)

      const task = await taskRepo.findOneBy({ id: taskId })
      if (!task) {
        throw new Error(`Task not found: ${taskId}`)
      }

      const notification = await notificationRepo.findOneBy({
        id: notificationId,
        taskId
      })
      if (!notification) {
        return null
      }
      if (notification.mainAgentEventId !== eventId) {
        return null
      }

      const payload = parseSubAgentProtocolPayload(parseJsonObject(notification.payloadJson), {
        outcome: taskNotificationTypeToSubAgentOutcome(notification.type)
      })
      const consumed = buildConsumedNotice(task, notification, payload)

      if (notification.status !== 'consumed') {
        assertTaskStatusTransition(task.status, consumed.nextStatus)
        task.status = consumed.nextStatus
        if (consumed.nextStatus === 'cancelled') {
          task.pendingContextJson = '{}'
          task.closureSummary = payload.summary || task.closureSummary
          task.closedAt = new Date()
        }
        notification.status = 'consumed'
        notification.consumedAt = new Date()
        await taskRepo.save(task)
        await notificationRepo.save(notification)
      }

      return {
        activeTask: toSnapshot(task),
        notice: consumed.notice,
        notification,
        payload,
        nextStatus: consumed.nextStatus
      }
    })
  }

  async listNotificationsAwaitingMainCommit(): Promise<TaskNotificationRecord[]> {
    return this.repo.find({
      where: { status: 'processing' },
      order: { processingStartedAt: 'ASC', createdAt: 'ASC', id: 'ASC' }
    })
  }

  async resetMainAgentConsumptionToPending(
    taskId: number,
    notificationId: number
  ): Promise<TaskNotificationRecord | null> {
    const notification = await this.repo.findOneBy({
      id: notificationId,
      taskId
    })
    if (!notification) {
      return null
    }
    notification.status = 'pending'
    notification.mainAgentEventId = null
    notification.processingStartedAt = null
    notification.consumedAt = null
    return this.repo.save(notification)
  }
}

export const taskNotificationService = new TaskNotificationService()
