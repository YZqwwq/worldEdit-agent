import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type {
  MainAgentEvent,
  MainAgentUserMessagePayload,
  MainAgentTaskNotificationEvent
} from '@share/cache/AItype/states/taskLifecycleState'
import { logError } from '../../../../share/utils/error/error'
import { mainAgentDispatchService } from './queue/mainAgentDispatchQueueService'
import { mainAgentChatRuntimeService } from './mainAgentChatRuntimeService'
import { mainAgentEffectApplierService } from './orchestration/mainAgentEffectApplierService'
import { orchestrateMainAgentEvent } from './orchestration/mainAgentEventOrchestration'
import { mainAgentLifecycleControlService } from './lifecycle/mainAgentLifecycleControlService'
import { taskNotificationConsumerService } from './notification/taskNotificationConsumerService'
import { taskNotificationDispatchBridge } from './queue/taskNotificationDispatchBridge'
import { mainAgentTurnService } from './mainAgentTurnService'
import { taskNotificationService } from '../../task/taskNotificationService'
import { chatMessageService } from '../chat/chatMessageService'
import { getMainAgentPersistenceTextFromPersistedMessage } from '../messagecontent/mainAgentMessageContentService'

class MainAgentEntryService {
  constructor() {
    mainAgentDispatchService.configure({
      processEvent: async (event, runtime) => {
        return this.processEvent(event, runtime?.onChunk)
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
    content: MainAgentUserMessagePayload['content']
    onChunk?: (chunk: StreamChunk) => void
  }): Promise<void> {
    await mainAgentDispatchService.enqueueUserMessage(input)
  }

  async enqueuePersistedUserEvent(
    event: Extract<MainAgentEvent, { type: 'user_message' }>,
    onChunk?: (chunk: StreamChunk) => void
  ): Promise<void> {
    await mainAgentDispatchService.enqueuePersistedUserEvent(event, onChunk)
  }

  async enqueueTaskNotification(input: {
    taskId: number
    notificationId: number
  }): Promise<void> {
    await mainAgentDispatchService.enqueueTaskNotification(input)
  }

  private async processEvent(event: MainAgentEvent, onChunk?: (chunk: StreamChunk) => void) {
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
      getPersistedUserMessageText: async (messageId) => {
        const message = await chatMessageService.getMessageById(messageId)
        return getMainAgentPersistenceTextFromPersistedMessage(message)
      },
      controlUserMessage: (userEvent, runtimeOnChunk) =>
        mainAgentLifecycleControlService.controlUserMessage(userEvent, runtimeOnChunk),
      runUserMessage: (eventId, turnId, userMessageId, content, onChunk, taskLifecycle) =>
        mainAgentChatRuntimeService.runUserMessage(
          eventId,
          turnId,
          userMessageId,
          content,
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
    }, { onChunk })
  }

  private async consumeTaskNotificationEvent(
    event: MainAgentTaskNotificationEvent
  ) {
    return taskNotificationConsumerService.consume(event)
  }
}

export const mainAgentEntryService = new MainAgentEntryService()
