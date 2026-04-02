import type {
  MainAgentEffect,
  MainAgentEventConsumptionResult
} from '@share/cache/AItype/states/taskLifecycleState'
import { contentToParts } from '../../messageoutput/transformRespones'
import { chatMessageService } from '../../chat/chatMessageService'
import { taskTraceService } from '../../../task/taskTraceService'
import { mainAgentTurnService } from '../mainAgentTurnService'
import { memoryManager } from '../../agentrsystem/manager/memory/MemoryManager'

class MainAgentEffectApplierService {
  async apply(result: MainAgentEventConsumptionResult): Promise<void> {
    for (const effect of result.effects) {
      await this.applyEffect(effect)
    }
  }

  private async applyEffect(effect: MainAgentEffect): Promise<void> {
    switch (effect.type) {
      case 'save_message':
        {
          const saved = await chatMessageService.saveMessage(effect.role, effect.content, {
            sessionId: effect.sessionId,
            turnId: effect.turnId,
            status: effect.messageStatus,
            eventId: effect.eventIdRef,
            consumer: effect.consumer
          })
          if (saved && effect.role === 'ai' && typeof effect.turnId === 'number') {
            await mainAgentTurnService.attachAiMessage(effect.turnId, saved.id)
          }
        }
        return
      case 'update_chat_turn':
        switch (effect.status) {
          case 'processing':
            await mainAgentTurnService.markProcessing(effect.turnId)
            return
          case 'completed':
            await mainAgentTurnService.markCompleted(effect.turnId)
            return
          case 'interrupted':
            await mainAgentTurnService.markInterrupted(effect.turnId)
            return
          case 'failed':
            await mainAgentTurnService.markFailed(effect.turnId, effect.errorMessage || '')
            return
        }
      case 'emit_trace':
        await taskTraceService.emit({
          taskId: effect.taskId,
          executionId: effect.executionId,
          actor: effect.actor,
          stage: effect.stage,
          message: effect.message,
          dedupeKey: effect.dedupeKey,
          payload: {
            ...(effect.payload ?? {}),
            mainAgentEvent: {
              eventId: effect.eventId,
              sessionId: effect.sessionId
            }
          }
        })
        return
      case 'sync_memory_messages':
        for (const message of effect.messages) {
          if (!message.content.trim()) {
            continue
          }
          await memoryManager.addMessage(message.role, message.content)
        }
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
