import type {
  MainAgentEventConsumptionResult,
  MainAgentTaskEvent,
  MainAgentTaskNotificationEvent
} from '@share/cache/AItype/states/taskLifecycleState'
import { taskNotificationService } from '../../task/taskNotificationService'
import { taskTraceService } from '../../task/taskTraceService'
import { decideTaskNotification } from './taskNotificationDecisionHandler'

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

class TaskNotificationConsumerService {
  async consume(event: MainAgentTaskNotificationEvent): Promise<MainAgentEventConsumptionResult> {
    const effectContext = {
      eventId: event.id,
      sessionId: event.sessionId
    }
    const consumed = await taskNotificationService.consumePendingNotification(
      event.payload.taskId,
      event.payload.notificationId
    )
    if (!consumed) {
      return {
        handled: false,
        consumer: 'task_notification_consumer',
        summary: 'task_notification_missing_or_already_consumed',
        effects: []
      }
    }

    await taskTraceService.emit({
      taskId: event.payload.taskId,
      executionId: consumed.notification.executionId,
      actor: 'main_agent',
      stage: 'main_received_subagent',
      message: '主 agent 已收到子 agent 的通知，开始决定下一步动作。',
      payload: {
        notificationType: consumed.notification.type,
        taskStatus: consumed.activeTask.status
      }
    })

    const taskEvent: MainAgentTaskEvent = {
      source: 'task_queue',
      taskId: event.payload.taskId,
      notificationId: event.payload.notificationId,
      notificationType: consumed.notification.type,
      activeTask: consumed.activeTask,
      notice: consumed.notice,
      payload: consumed.payload
    }

    try {
      const decision = decideTaskNotification(taskEvent)
      const visibleMessage = decision.visibleMessage?.trim()
      const effects: MainAgentEventConsumptionResult['effects'] = []

      if (decision.action === 'ask_user' && visibleMessage) {
        effects.push(
          {
            ...effectContext,
            type: 'save_message',
            role: 'ai',
            content: visibleMessage
          },
          {
            ...effectContext,
            type: 'emit_trace',
            taskId: event.payload.taskId,
            executionId: consumed.notification.executionId,
            actor: 'main_agent',
            stage: 'main_response_user',
            message: '主 agent 决定向用户发送可见消息。',
            payload: {
              visibleMessage,
              reason: decision.reason
            }
          }
        )

        return {
          handled: true,
          consumer: 'task_notification_consumer',
          summary: 'task_notification_prompted_user',
          effects
        }
      }

      effects.push({
        ...effectContext,
        type: 'emit_trace',
        taskId: event.payload.taskId,
        executionId: consumed.notification.executionId,
        actor: 'main_agent',
        stage: 'main_response_silent',
        message: '主 agent 决定暂不向用户发送可见消息。',
        payload: {
          action: decision.action,
          reason: decision.reason
        }
      })

      return {
        handled: true,
        consumer: 'task_notification_consumer',
        summary: 'task_notification_handled_silently',
        effects
      }
    } catch (error) {
      const reason = toErrorMessage(error)
      console.error('Task notification consumer failed during decision handling:', error)

      const fallbackMessage =
        consumed.notice.message?.trim() || consumed.payload.message?.trim() || undefined
      const effects: MainAgentEventConsumptionResult['effects'] = []

      if (fallbackMessage) {
        effects.push(
          {
            ...effectContext,
            type: 'save_message',
            role: 'ai',
            content: fallbackMessage
          },
          {
            ...effectContext,
            type: 'emit_trace',
            taskId: event.payload.taskId,
            executionId: consumed.notification.executionId,
            actor: 'main_agent',
            stage: 'main_response_user',
            message: '主 agent 在处理任务通知时遇到异常，已回退为直接向用户发送通知。',
            payload: {
              fallback: true,
              reason
            }
          }
        )

        return {
          handled: true,
          consumer: 'task_notification_consumer',
          summary: 'task_notification_fallback_prompted_user',
          effects
        }
      }

      effects.push({
        ...effectContext,
        type: 'emit_trace',
        taskId: event.payload.taskId,
        executionId: consumed.notification.executionId,
        actor: 'main_agent',
        stage: 'main_response_silent',
        message: '主 agent 在处理任务通知时遇到异常，且没有可直接展示的消息。',
        payload: {
          fallback: true,
          reason
        }
      })

      return {
        handled: true,
        consumer: 'task_notification_consumer',
        summary: 'task_notification_fallback_silent',
        effects
      }
    }
  }
}

export const taskNotificationConsumerService = new TaskNotificationConsumerService()
