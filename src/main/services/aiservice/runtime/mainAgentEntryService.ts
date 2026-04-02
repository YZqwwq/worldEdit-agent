import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type {
  MainAgentEvent,
  MainAgentTaskNotificationEvent
} from '@share/cache/AItype/states/taskLifecycleState'
import { logError } from '../../../../share/utils/error/error'
import { mainAgentDispatchService } from './queue/mainAgentDispatchQueueService'
import { mainAgentChatRuntimeService } from './mainAgentChatRuntimeService'
import { mainAgentEffectApplierService } from './mainAgentEffectApplierService'
import { orchestrateMainAgentEvent } from './mainAgentEventOrchestration'
import { mainAgentLifecycleControlService } from './mainAgentLifecycleControlService'
import { taskNotificationConsumerService } from './taskNotificationConsumerService'
import { taskNotificationDispatchBridge } from './queue/taskNotificationDispatchBridge'
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

  private async processEvent(event: MainAgentEvent) {
    return orchestrateMainAgentEvent(event, {
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
      applyEffects: (result) => mainAgentEffectApplierService.apply(result),
      completeTaskNotificationConsumption: (taskEvent) =>
        taskNotificationService.completeMainAgentConsumption(
          taskEvent.payload.taskId,
          taskEvent.payload.notificationId,
          taskEvent.id
        ).then(() => undefined),
      logUserMessageError: (error) => logError('Error in stream:', error)
    })
  }

  private async consumeTaskNotificationEvent(
    event: MainAgentTaskNotificationEvent
  ) {
    return taskNotificationConsumerService.consume(event)
  }
}

export const mainAgentEntryService = new MainAgentEntryService()
