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
import { interactionObservationService } from '../agentrsystem/manager/personal/interactionObservationService'

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
        taskNotificationService
          .completeMainAgentConsumption(
            taskEvent.payload.taskId,
            taskEvent.payload.notificationId,
            taskEvent.id
          )
          .then(async (result) => {
            if (!result) {
              return
            }

            const pendingContext =
              result.payload.pendingContext &&
              typeof result.payload.pendingContext === 'object' &&
              !Array.isArray(result.payload.pendingContext)
                ? result.payload.pendingContext
                : {}

            const entityNames = [
              typeof pendingContext.targetCharacterName === 'string'
                ? pendingContext.targetCharacterName
                : null
            ].filter((item): item is string => Boolean(item))

            const worldNames = [
              typeof pendingContext.targetWorldName === 'string'
                ? pendingContext.targetWorldName
                : null
            ].filter((item): item is string => Boolean(item))

            const observationType =
              taskEvent.type === 'task_notification' && result.notification.type === 'subagent_completed'
                ? 'task_completed'
                : taskEvent.type === 'task_notification' &&
                    result.notification.type === 'subagent_needs_input'
                  ? 'task_needs_input'
                  : taskEvent.type === 'task_notification' &&
                      result.notification.type === 'subagent_cancelled'
                    ? 'task_cancelled'
                    : 'task_failed'

            await interactionObservationService.record({
              type: observationType,
              source: 'task_queue',
              summary: result.notice.message.slice(0, 160),
              payload: {
                taskId: result.activeTask.id,
                taskTitle: result.activeTask.title,
                taskStatus: result.activeTask.status,
                notificationId: result.notification.id,
                message: result.notice.message,
                summary: result.payload.summary,
                entityNames,
                worldNames
              }
            })
          }),
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
