import { mainAgentDispatchService } from './mainAgentDispatchQueueService'
import { taskNotificationService } from '../../../task/taskNotificationService'
import { mainAgentEventLogService } from './mainAgentEventLogQueueService'
import { mainAgentTurnService } from '../mainAgentTurnService'
import { mainAgentTurnVersionService } from '../version/mainAgentTurnVersionService'

class MainAgentEventRecoveryService {
  async restorePausedTurn(): Promise<void> {
    const pausedEvents = await mainAgentEventLogService.listPausedEvents()
    if (pausedEvents.length > 1) {
      throw new Error('Multiple paused main agent turns violate the serial dispatch invariant.')
    }
    if (pausedEvents[0]) {
      mainAgentDispatchService.restorePausedEvent(pausedEvents[0])
    }
  }

  async reconcileTurnOwnedEvents(): Promise<void> {
    const processingEvents = await mainAgentEventLogService.listProcessingEvents()

    for (const event of processingEvents) {
      if (event.type !== 'user_message' && event.type !== 'background_persona_stage') {
        continue
      }

      const turn = await mainAgentTurnService.findByEventId(event.id)
      if (turn?.status === 'completed' || turn?.status === 'interrupted') {
        await mainAgentEventLogService.markCompleted(event.id, {
          consumer:
            event.type === 'user_message'
              ? 'chat_runtime'
              : 'background_persona_stage_consumer',
          summary:
            event.type === 'user_message'
              ? turn.status === 'completed'
                ? 'user_message_completed'
                : 'user_message_interrupted'
              : turn.status === 'completed'
                ? 'background_persona_stage_completed'
                : 'background_persona_stage_interrupted'
        })
        continue
      }

      if (
        event.type === 'user_message' &&
        turn?.status === 'processing' &&
        await mainAgentTurnVersionService.hasReadyToCommitHead(turn.id)
      ) {
        await mainAgentEventLogService.resetToQueued(event.id)
        mainAgentDispatchService.stageRecoveredEvent(event)
        continue
      }

      await mainAgentTurnService.reconcileIncompleteTurnForFailedEvent({
        eventId: event.id,
        errorMessage: 'Main agent event was interrupted before commit completed.'
      })
      await mainAgentEventLogService.markFailed(event.id, {
        consumer:
          event.type === 'user_message'
            ? 'chat_runtime'
            : 'background_persona_stage_consumer',
        summary:
          event.type === 'user_message'
            ? 'user_message_reconciled_failed_during_startup'
            : 'background_persona_stage_reconciled_failed_during_startup',
        errorMessage: 'Main agent event was interrupted before commit completed.'
      })
    }
  }

  async reconcileTaskNotificationEvents(): Promise<void> {
    const taskEvents = await mainAgentEventLogService.listTaskNotificationEventsByStatuses([
      'queued',
      'processing',
      'failed'
    ])

    for (const event of taskEvents) {
      const notification = await taskNotificationService.getNotification(
        event.payload.taskId,
        event.payload.notificationId
      )
      if (!notification) {
        continue
      }

      if (
        notification.status === 'consumed' &&
        notification.mainAgentEventId === event.id
      ) {
        await mainAgentEventLogService.markCompleted(event.id, {
          consumer: 'task_notification_consumer',
          summary: 'task_notification_committed_during_startup_recovery'
        })
        continue
      }

      if (notification.status === 'processing') {
        if (notification.mainAgentEventId !== event.id) {
          await taskNotificationService.resetMainAgentConsumptionToPending(
            notification.taskId,
            notification.id
          )
          continue
        }

        await mainAgentEventLogService.resetToQueued(event.id)
        mainAgentDispatchService.stageRecoveredEvent(event)
      }
    }
  }

  async enqueueQueuedEvents(): Promise<void> {
    const queuedEvents = await mainAgentEventLogService.listQueuedEvents()
    for (const event of queuedEvents) {
      mainAgentDispatchService.stageRecoveredEvent(event)
    }
  }
}

export const mainAgentEventRecoveryService = new MainAgentEventRecoveryService()
