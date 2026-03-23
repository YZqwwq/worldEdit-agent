import { randomUUID } from 'node:crypto'
import type {
  MainAgentEventConsumptionResult,
  MainAgentTaskEvent,
  MainAgentTaskNotificationEvent
} from '@share/cache/AItype/states/taskLifecycleState'
import { agent } from '../agentrsystem/agentReactSystem'
import { runWithGraphLogContext } from '../../log/graphlog'
import { taskNotificationService } from '../../task/taskNotificationService'
import { taskTraceService } from '../../task/taskTraceService'

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

    const runId = randomUUID()
    const result = await runWithGraphLogContext(runId, async () =>
      agent.invoke({
        messages: [],
        taskEvent,
        taskLifecycle: {
          activeTask: consumed.activeTask,
          notice: consumed.notice
        }
      })
    )

    const decision = result.taskEventDecision
    const visibleMessage = decision?.visibleMessage?.trim()
    const effects: MainAgentEventConsumptionResult['effects'] = []

    if (decision?.action === 'ask_user' && visibleMessage) {
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
        action: decision?.action ?? 'none',
        reason: decision?.reason ?? 'No explicit decision was returned.'
      }
    })

    return {
      handled: true,
      consumer: 'task_notification_consumer',
      summary: 'task_notification_handled_silently',
      effects
    }
  }
}

export const taskNotificationConsumerService = new TaskNotificationConsumerService()
