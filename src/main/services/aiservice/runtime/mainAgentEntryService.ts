import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type {
  MainAgentEvent,
  MainAgentBackgroundPersonaStagePayload,
  MainAgentUserMessagePayload
} from '@share/cache/AItype/states/taskLifecycleState'
import { logError } from '../../../../share/utils/error/error'
import { mainAgentDispatchService } from './queue/mainAgentDispatchQueueService'
import { mainAgentChatRuntimeService } from './mainAgentChatRuntimeService'
import { mainAgentEffectApplierService } from './orchestration/mainAgentEffectApplierService'
import { orchestrateMainAgentEvent } from './orchestration/mainAgentEventOrchestration'
import { mainAgentLifecycleControlService } from './lifecycle/mainAgentLifecycleControlService'
import { taskNotificationConsumeNode } from './notification/nodes/taskNotificationConsumeNode'
import { taskNotificationDispatchBridge } from './queue/taskNotificationDispatchBridge'
import { mainAgentTurnService } from './mainAgentTurnService'
import { taskNotificationService } from '../../task/taskNotificationService'
import { mainAgentTurnVersionService } from './version/mainAgentTurnVersionService'

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

  async enqueueBackgroundPersonaStage(
    payload: MainAgentBackgroundPersonaStagePayload
  ): Promise<void> {
    await mainAgentDispatchService.enqueueBackgroundPersonaStage(payload)
  }

  private async processEvent(event: MainAgentEvent, onChunk?: (chunk: StreamChunk) => void) {
    return orchestrateMainAgentEvent(event, {
      createChatTurn: async ({ eventId, sessionId, userMessageId }) => {
        const turn = await mainAgentTurnService.createUserMessageTurn({
          eventId,
          sessionId,
          userMessageId
        })
        const resumeFromHead =
          turn.status === 'processing' &&
          (await mainAgentTurnVersionService.getHeadKind(turn.id)) === 'ready_to_commit'
        await mainAgentTurnService.markProcessing(turn.id)
        return { turnId: turn.id, resumeFromHead }
      },
      createBackgroundPersonaStageTurn: async ({ eventId, sessionId }) => {
        const turn = await mainAgentTurnService.createBackgroundPersonaStageTurn({
          eventId,
          sessionId
        })
        await mainAgentTurnService.markProcessing(turn.id)
        return { turnId: turn.id }
      },
      createTaskNotificationTurn: async ({ eventId, sessionId }) => {
        const turn = await mainAgentTurnService.createTaskNotificationTurn({
          eventId,
          sessionId
        })
        const resumeFromHead =
          turn.status === 'processing' &&
          (await mainAgentTurnVersionService.getHeadKind(turn.id)) === 'ready_to_commit'
        await mainAgentTurnService.markProcessing(turn.id)
        return { turnId: turn.id, resumeFromHead }
      },
      controlUserMessage: (userEvent) =>
        mainAgentLifecycleControlService.controlUserMessage(userEvent),
      runUserMessage: (
        eventId,
        turnId,
        userMessageId,
        content,
        workspaceContext,
        onChunk,
        taskLifecycle,
        resumeFromHead
      ) =>
        mainAgentChatRuntimeService.runUserMessage(
          eventId,
          turnId,
          userMessageId,
          content,
          workspaceContext,
          onChunk,
          taskLifecycle,
          resumeFromHead
        ),
      runBackgroundPersonaStage: (eventId, turnId, sessionId, payload) =>
        mainAgentChatRuntimeService.runBackgroundPersonaStage(
          eventId,
          turnId,
          sessionId,
          payload
        ),
      prepareTaskNotification: async (taskEvent) => {
        const consumed = await taskNotificationConsumeNode.consume(taskEvent)
        return consumed.kind === 'consumed' ? consumed.taskEvent : null
      },
      runTaskNotification: (eventId, turnId, sessionId, taskEvent, resumeFromHead) =>
        mainAgentChatRuntimeService.runTaskNotification(
          eventId,
          turnId,
          sessionId,
          taskEvent,
          resumeFromHead
        ),
      applyEffects: (result) => mainAgentEffectApplierService.apply(result),
      completeTaskNotificationConsumption: (taskEvent) =>
        taskNotificationService
          .completeMainAgentConsumption(
            taskEvent.payload.taskId,
            taskEvent.payload.notificationId,
            taskEvent.id
          )
          .then(() => undefined),
      logUserMessageError: (error) => logError('Error in stream:', error)
    }, { onChunk })
  }

}

export const mainAgentEntryService = new MainAgentEntryService()
