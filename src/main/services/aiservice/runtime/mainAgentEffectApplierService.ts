import type {
  MainAgentEffect,
  MainAgentEventConsumptionResult
} from '@share/cache/AItype/states/taskLifecycleState'
import { contentToParts } from '../messageoutput/transformRespones'
import { chatMessageService } from '../chat/chatMessageService'
import { taskTraceService } from '../../task/taskTraceService'

class MainAgentEffectApplierService {
  async apply(result: MainAgentEventConsumptionResult): Promise<void> {
    for (const effect of result.effects) {
      await this.applyEffect(effect)
    }
  }

  private async applyEffect(effect: MainAgentEffect): Promise<void> {
    switch (effect.type) {
      case 'save_message':
        await chatMessageService.saveMessage(effect.role, effect.content, {
          sessionId: effect.sessionId
        })
        return
      case 'emit_trace':
        await taskTraceService.emit({
          taskId: effect.taskId,
          executionId: effect.executionId,
          actor: effect.actor,
          stage: effect.stage,
          message: effect.message,
          payload: {
            ...(effect.payload ?? {}),
            mainAgentEvent: {
              eventId: effect.eventId,
              sessionId: effect.sessionId
            }
          }
        })
        return
      case 'stream_done':
        effect.onChunk?.({
          type: 'done',
          fullContent: contentToParts(effect.fullText)
        })
        return
      case 'stream_error':
        effect.onChunk?.({
          type: 'stream_error',
          message: effect.message
        })
        return
    }
  }
}

export const mainAgentEffectApplierService = new MainAgentEffectApplierService()
