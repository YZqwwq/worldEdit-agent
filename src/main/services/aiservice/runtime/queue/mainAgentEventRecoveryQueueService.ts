import { mainAgentDispatchService } from './mainAgentDispatchQueueService'
import { taskNotificationService } from '../../../task/taskNotificationService'
import { mainAgentEventLogService } from './mainAgentEventLogQueueService'
import { mainAgentTurnService } from '../mainAgentTurnService'

class MainAgentEventRecoveryService {
  async reconcileUserMessageEvents(): Promise<void> {
    const processingEvents = await mainAgentEventLogService.listProcessingEvents()

    for (const event of processingEvents) {
      if (event.type !== 'user_message') {
        continue
      }

      const turn = await mainAgentTurnService.findByEventId(event.id)
      if (turn?.status === 'completed' || turn?.status === 'interrupted') {
        await mainAgentEventLogService.markCompleted(event.id, {
          consumer: 'chat_runtime',
          summary: turn.status === 'completed' ? 'user_message_completed' : 'user_message_interrupted'
        })
        continue
      }

      await mainAgentTurnService.reconcileIncompleteTurnForFailedEvent({
        eventId: event.id,
        errorMessage: 'Main agent user_message event was interrupted before commit completed.'
      })
      await mainAgentEventLogService.markFailed(event.id, {
        consumer: 'chat_runtime',
        summary: 'user_message_reconciled_failed_during_startup',
        errorMessage: 'Main agent user_message event was interrupted before commit completed.'
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
        await mainAgentDispatchService.enqueueRecoveredEvent(event)
      }
    }
  }

  async enqueueQueuedUserEvents(): Promise<void> {
    const queuedEvents = await mainAgentEventLogService.listQueuedUserEvents()
    for (const event of queuedEvents) {
      await mainAgentDispatchService.enqueueRecoveredEvent(event)
    }
  }
}

export const mainAgentEventRecoveryService = new MainAgentEventRecoveryService()
