import { MessagesState } from '../../state/messageState'
import { taskService } from '../../../../task/taskService'
import { taskNotificationService } from '../../../../task/taskNotificationService'
import { emitGraphThought } from '../../../../log/graphlog'

export async function taskNotificationNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const activeTask = await taskService.getActiveTaskSnapshot()

  if (!activeTask) {
    return {}
  }

  const consumed = await taskNotificationService.consumeNextPendingNotification(activeTask.id)
  if (!consumed) {
    return {
      taskLifecycle: {
        ...(state.taskLifecycle ?? {}),
        activeTask
      }
    }
  }

  emitGraphThought('taskNotificationNode', {
    stage: 'consume_pending_notification',
    taskId: consumed.activeTask.id,
    executionId: consumed.notification.executionId,
    notificationType: consumed.notification.type,
    notice: {
      type: consumed.notice.type,
      message: consumed.notice.message
    }
  })

  return {
    taskLifecycle: {
      ...(state.taskLifecycle ?? {}),
      activeTask: consumed.activeTask,
      notice: consumed.notice
    }
  }
}
