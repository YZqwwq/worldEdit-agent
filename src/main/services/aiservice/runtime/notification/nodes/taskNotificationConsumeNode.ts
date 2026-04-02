import type {
  MainAgentTaskEvent,
  MainAgentTaskNotificationEvent
} from '@share/cache/AItype/states/taskLifecycleState'
import { taskNotificationService } from '../../../../task/taskNotificationService'

type BeginConsumptionResult = Awaited<
  ReturnType<typeof taskNotificationService.beginMainAgentConsumption>
>

export type ConsumedTaskNotificationContext = NonNullable<BeginConsumptionResult>

export type TaskNotificationConsumeResult =
  | { kind: 'missing' }
  | {
      kind: 'consumed'
      context: ConsumedTaskNotificationContext
      taskEvent: MainAgentTaskEvent
    }

class TaskNotificationConsumeNode {
  async consume(
    event: MainAgentTaskNotificationEvent
  ): Promise<TaskNotificationConsumeResult> {
    const context = await taskNotificationService.beginMainAgentConsumption(
      event.payload.taskId,
      event.payload.notificationId,
      event.id
    )

    if (!context) {
      return { kind: 'missing' }
    }

    return {
      kind: 'consumed',
      context,
      taskEvent: {
        source: 'task_queue',
        taskId: event.payload.taskId,
        notificationId: event.payload.notificationId,
        notificationType: context.notification.type,
        activeTask: context.activeTask,
        notice: context.notice,
        payload: context.payload
      }
    }
  }
}

export const taskNotificationConsumeNode = new TaskNotificationConsumeNode()
