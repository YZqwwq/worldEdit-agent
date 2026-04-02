import type {
  MainAgentEventConsumptionResult,
  MainAgentTaskDecision,
  MainAgentTaskNotificationEvent
} from '@share/cache/AItype/states/taskLifecycleState'
import type { ConsumedTaskNotificationContext } from './taskNotificationConsumeNode'

const createEffectContext = (event: MainAgentTaskNotificationEvent) => ({
  eventId: event.id,
  sessionId: event.sessionId
})

class TaskNotificationEffectNode {
  buildFromDecision(input: {
    event: MainAgentTaskNotificationEvent
    context: ConsumedTaskNotificationContext
    decision: MainAgentTaskDecision
  }): MainAgentEventConsumptionResult {
    const effectContext = createEffectContext(input.event)
    const visibleMessage = input.decision.visibleMessage?.trim()
    const effects: MainAgentEventConsumptionResult['effects'] = [
      {
        ...effectContext,
        type: 'emit_trace',
        taskId: input.event.payload.taskId,
        executionId: input.context.notification.executionId,
        actor: 'main_agent',
        stage: 'main_received_subagent',
        message: '主 agent 已收到子 agent 的通知，开始决定下一步动作。',
        dedupeKey: `${input.event.id}:main_received_subagent:main_agent`,
        payload: {
          notificationType: input.context.notification.type,
          taskStatus: input.context.activeTask.status
        }
      }
    ]

    if (input.decision.action === 'ask_user' && visibleMessage) {
      effects.push(
        {
          ...effectContext,
          type: 'save_message',
          role: 'ai',
          content: visibleMessage,
          eventIdRef: input.event.id,
          consumer: 'task_notification_consumer'
        },
        {
          ...effectContext,
          type: 'emit_trace',
          taskId: input.event.payload.taskId,
          executionId: input.context.notification.executionId,
          actor: 'main_agent',
          stage: 'main_response_user',
          message: '主 agent 决定向用户发送可见消息。',
          dedupeKey: `${input.event.id}:main_response_user:main_agent`,
          payload: {
            visibleMessage,
            reason: input.decision.reason
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
      taskId: input.event.payload.taskId,
      executionId: input.context.notification.executionId,
      actor: 'main_agent',
      stage: 'main_response_silent',
      message: '主 agent 决定暂不向用户发送可见消息。',
      dedupeKey: `${input.event.id}:main_response_silent:main_agent`,
      payload: {
        action: input.decision.action,
        reason: input.decision.reason
      }
    })

    return {
      handled: true,
      consumer: 'task_notification_consumer',
      summary: 'task_notification_handled_silently',
      effects
    }
  }

  buildFallback(input: {
    event: MainAgentTaskNotificationEvent
    context: ConsumedTaskNotificationContext
    reason: string
  }): MainAgentEventConsumptionResult {
    const effectContext = createEffectContext(input.event)
    const fallbackMessage =
      input.context.notice.message?.trim() || input.context.payload.message?.trim() || undefined
    const effects: MainAgentEventConsumptionResult['effects'] = [
      {
        ...effectContext,
        type: 'emit_trace',
        taskId: input.event.payload.taskId,
        executionId: input.context.notification.executionId,
        actor: 'main_agent',
        stage: 'main_received_subagent',
        message: '主 agent 已收到子 agent 的通知，开始决定下一步动作。',
        dedupeKey: `${input.event.id}:main_received_subagent:main_agent`,
        payload: {
          notificationType: input.context.notification.type,
          taskStatus: input.context.activeTask.status
        }
      }
    ]

    if (fallbackMessage) {
      effects.push(
        {
          ...effectContext,
          type: 'save_message',
          role: 'ai',
          content: fallbackMessage,
          eventIdRef: input.event.id,
          consumer: 'task_notification_consumer'
        },
        {
          ...effectContext,
          type: 'emit_trace',
          taskId: input.event.payload.taskId,
          executionId: input.context.notification.executionId,
          actor: 'main_agent',
          stage: 'main_response_user',
          message: '主 agent 在处理任务通知时遇到异常，已回退为直接向用户发送通知。',
          dedupeKey: `${input.event.id}:main_response_user:main_agent`,
          payload: {
            fallback: true,
            reason: input.reason
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
      taskId: input.event.payload.taskId,
      executionId: input.context.notification.executionId,
      actor: 'main_agent',
      stage: 'main_response_silent',
      message: '主 agent 在处理任务通知时遇到异常，且没有可直接展示的消息。',
      dedupeKey: `${input.event.id}:main_response_silent:main_agent`,
      payload: {
        fallback: true,
        reason: input.reason
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

export const taskNotificationEffectNode = new TaskNotificationEffectNode()
