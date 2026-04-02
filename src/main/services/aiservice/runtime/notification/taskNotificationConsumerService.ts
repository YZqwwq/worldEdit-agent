import type {
  MainAgentEventConsumptionResult,
  MainAgentTaskNotificationEvent
} from '@share/cache/AItype/states/taskLifecycleState'
import { toErrorMessage } from '../../../../../share/utils/error/error'
import { taskNotificationConsumeNode } from './nodes/taskNotificationConsumeNode'
import { taskNotificationDecisionNode } from './nodes/taskNotificationDecisionNode'
import { taskNotificationEffectNode } from './nodes/taskNotificationEffectNode'

class TaskNotificationConsumerService {
  async consume(event: MainAgentTaskNotificationEvent): Promise<MainAgentEventConsumptionResult> {
    const consumed = await taskNotificationConsumeNode.consume(event)
    if (consumed.kind === 'missing') {
      return {
        handled: false,
        consumer: 'task_notification_consumer',
        summary: 'task_notification_missing_or_already_consumed',
        effects: []
      }
    }

    try {
      const decision = taskNotificationDecisionNode.decide(consumed.taskEvent)
      return taskNotificationEffectNode.buildFromDecision({
        event,
        context: consumed.context,
        decision
      })
    } catch (error) {
      const reason = toErrorMessage(error)
      console.error('Task notification consumer failed during decision handling:', error)
      return taskNotificationEffectNode.buildFallback({
        event,
        context: consumed.context,
        reason
      })
    }
  }
}

export const taskNotificationConsumerService = new TaskNotificationConsumerService()
