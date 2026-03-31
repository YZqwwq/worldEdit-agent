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
import { mainAgentLifecycleControlService } from './mainAgentLifecycleControlService'
import { taskNotificationConsumerService } from './taskNotificationConsumerService'
import { taskNotificationDispatchBridge } from '../../task/taskNotificationDispatchBridge'
import { mainAgentTurnService } from './mainAgentTurnService'
import { taskNotificationService } from '../../task/taskNotificationService'

class MainAgentEntryService {
  constructor() {
    mainAgentDispatchService.configure({
      processEvent: async (event) => {
        return this.processEvent(event)
      }
    })
    taskNotificationDispatchBridge.configure({
      enqueueTaskNotification: async (input) => {
        await this.enqueueTaskNotification(input)
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

  private async processEvent(event: MainAgentEvent): Promise<MainAgentEventConsumptionResult> {
    const result = await processMainAgentEvent(event, {
      createChatTurn: async ({ eventId, sessionId, userMessageId }) => {
        const turn = await mainAgentTurnService.createUserMessageTurn({
          eventId,
          sessionId,
          userMessageId
        })
        await mainAgentTurnService.markProcessing(turn.id)
        return { turnId: turn.id }
      },
      controlUserMessage: (userEvent) => mainAgentLifecycleControlService.controlUserMessage(userEvent),
      runUserMessage: (eventId, turnId, message, onChunk, taskLifecycle) =>
        mainAgentChatRuntimeService.runUserMessage(
          eventId,
          turnId,
          message,
          onChunk,
          taskLifecycle
        ),
      consumeTaskNotification: (taskEvent) =>
        this.consumeTaskNotificationEvent(taskEvent),
      logUserMessageError: (error) => logError('Error in stream:', error)
    })
    await mainAgentEffectApplierService.apply(result)
    if (event.type === 'task_notification') {
      await taskNotificationService.completeMainAgentConsumption(
        event.payload.taskId,
        event.payload.notificationId,
        event.id
      )
    }
    return result
  }

  private async consumeTaskNotificationEvent(
    event: MainAgentTaskNotificationEvent
  ): Promise<MainAgentEventConsumptionResult> {
    return taskNotificationConsumerService.consume(event)
  }
}

export const mainAgentEntryService = new MainAgentEntryService()
