import { AppDataSource } from '../../database'
import { TaskExecutionRecord } from '../../../share/entity/database/TaskExecutionRecord'
import { TaskNotificationRecord } from '../../../share/entity/database/TaskNotificationRecord'
import { TaskRecord } from '../../../share/entity/database/TaskRecord'
import type {
  ActiveTaskSnapshot,
  TaskExecutionStatus,
  TaskLifecycleNotice,
  TaskNotificationType,
  TaskStatus
} from '@share/cache/AItype/states/taskLifecycleState'

type PublishExecutionEventInput = {
  taskId: number
  executionId: number
  type: TaskNotificationType
  summary: string
  payload?: unknown
  errorReport?: string
}

type ConsumedNotificationResult = {
  activeTask: ActiveTaskSnapshot
  notice: TaskLifecycleNotice
  notification: TaskNotificationRecord
  payload: Record<string, unknown>
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

const getExecutionStatusForNotification = (
  type: TaskNotificationType
): TaskExecutionStatus => {
  switch (type) {
    case 'subagent_completed':
      return 'reported_done'
    case 'subagent_needs_input':
      return 'awaiting_input'
    case 'subagent_failed':
      return 'failed'
  }
}

const getTaskStatusForPublishedNotification = (): TaskStatus => 'pending_main_ack'

const buildConsumedNotice = (
  task: TaskRecord,
  notification: TaskNotificationRecord,
  payload: Record<string, unknown>
): { nextStatus: TaskStatus; notice: TaskLifecycleNotice } => {
  const payloadMessage =
    typeof payload.message === 'string'
      ? payload.message.trim()
      : typeof payload.note === 'string'
        ? payload.note.trim()
        : typeof payload.summary === 'string'
          ? payload.summary.trim()
          : ''

  switch (notification.type) {
    case 'subagent_completed':
      return {
        nextStatus: 'awaiting_user_confirmation',
        notice: {
          type: 'task_waiting_confirmation',
          message:
            payloadMessage ||
            `子 agent 已完成任务「${task.title}」的本轮执行，请向用户确认是否结束任务。`
        }
      }
    case 'subagent_needs_input':
      return {
        nextStatus: 'awaiting_user_input',
        notice: {
          type: 'task_needs_input',
          message:
            payloadMessage ||
            `子 agent 在任务「${task.title}」中需要更多用户输入，请先向用户收集补充信息。`
        }
      }
    case 'subagent_failed':
      return {
        nextStatus: 'awaiting_user_input',
        notice: {
          type: 'task_failed',
          message:
            payloadMessage ||
            `子 agent 在任务「${task.title}」的本轮执行中失败，请向用户说明失败原因并决定是否重试或取消。`
        }
      }
  }
}

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

      execution.status = getExecutionStatusForNotification(input.type)
      execution.resultSummary = input.summary.trim()
      execution.reportPayloadJson = JSON.stringify(input.payload ?? {})
      if (input.errorReport?.trim()) {
        execution.errorReport = input.errorReport.trim()
      }
      if (!execution.startedAt) {
        execution.startedAt = new Date()
      }
      execution.finishedAt = new Date()

      task.status = getTaskStatusForPublishedNotification()

      const notification = notificationRepo.create({
        taskId: input.taskId,
        executionId: input.executionId,
        type: input.type,
        status: 'pending',
        payloadJson: JSON.stringify(input.payload ?? {})
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

  async consumePendingNotification(
    taskId: number,
    notificationId?: number
  ): Promise<ConsumedNotificationResult | null> {
    return AppDataSource.transaction(async (manager) => {
      const taskRepo = manager.getRepository(TaskRecord)
      const notificationRepo = manager.getRepository(TaskNotificationRecord)

      const task = await taskRepo.findOneBy({ id: taskId })
      if (!task) {
        throw new Error(`Task not found: ${taskId}`)
      }

      const notification =
        typeof notificationId === 'number'
          ? await notificationRepo.findOneBy({
              id: notificationId,
              taskId,
              status: 'pending'
            })
          : (
              await notificationRepo.find({
                where: { taskId, status: 'pending' },
                order: { createdAt: 'ASC' },
                take: 1
              })
            )[0]
      if (!notification) {
        return null
      }

      notification.status = 'consumed'
      notification.consumedAt = new Date()

      const payload = parseJsonObject(notification.payloadJson)
      const consumed = buildConsumedNotice(task, notification, payload)
      task.status = consumed.nextStatus

      await notificationRepo.save(notification)
      await taskRepo.save(task)

      return {
        activeTask: toSnapshot(task),
        notice: consumed.notice,
        notification,
        payload
      }
    })
  }

  async consumeNextPendingNotification(taskId: number): Promise<ConsumedNotificationResult | null> {
    return this.consumePendingNotification(taskId)
  }
}

export const taskNotificationService = new TaskNotificationService()
