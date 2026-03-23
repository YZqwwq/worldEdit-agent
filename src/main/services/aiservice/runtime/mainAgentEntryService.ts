import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type {
  MainAgentEvent,
  MainAgentEventConsumptionResult,
  MainAgentTaskNotificationEvent
} from '@share/cache/AItype/states/taskLifecycleState'
import { logError } from '../../../../share/utils/error/error'
import { mainAgentDispatchService } from '../../middlelayer/event-in-wait/mainAgentDispatchService'
import { mainAgentChatRuntimeService } from './mainAgentChatRuntimeService'
import { mainAgentEffectApplierService } from './mainAgentEffectApplierService'
import { processMainAgentEvent } from './mainAgentEventProcessor'
import { taskNotificationConsumerService } from './taskNotificationConsumerService'

class MainAgentEntryService {
  constructor() {
    mainAgentDispatchService.configure({
      processEvent: async (event) => {
        await this.processEvent(event)
      }
    })
  }

  async enqueueUserMessage(input: {
    messageId: number
    text: string
    onChunk?: (chunk: StreamChunk) => void
  }): Promise<void> {
    await mainAgentDispatchService.enqueueUserMessage(input)
  }

  async enqueueTaskNotification(input: {
    taskId: number
    notificationId: number
  }): Promise<void> {
    await mainAgentDispatchService.enqueueTaskNotification(input)
  }

  private async processEvent(event: MainAgentEvent): Promise<void> {
    const result = await processMainAgentEvent(event, {
      runUserMessage: (message, onChunk) =>
        mainAgentChatRuntimeService.runUserMessage(message, onChunk),
      consumeTaskNotification: (taskEvent) =>
        this.consumeTaskNotificationEvent(taskEvent),
      logUserMessageError: (error) => logError('Error in stream:', error)
    })
    await mainAgentEffectApplierService.apply(result)
  }

  private async consumeTaskNotificationEvent(
    event: MainAgentTaskNotificationEvent
  ): Promise<MainAgentEventConsumptionResult> {
    return taskNotificationConsumerService.consume(event)
  }
}

export const mainAgentEntryService = new MainAgentEntryService()
