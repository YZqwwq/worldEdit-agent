import { mainAgentDispatchService } from './mainAgentDispatchQueueService'
import { taskNotificationService } from '../../../task/taskNotificationService'
import { mainAgentEventLogService } from './mainAgentEventLogQueueService'
import { mainAgentTurnService } from '../mainAgentTurnService'
import { mainAgentTurnVersionService } from '../version/mainAgentTurnVersionService'
import { resolveMainAgentTurnRecovery } from '../version/turnRecoveryPolicy'
import type { MainAgentEvent } from '@share/cache/AItype/states/taskLifecycleState'
import { persistCancelledPausedTurn } from '../version/turnVersionPersistence'
import { AppDataSource } from '../../../../database'

const getConsumer = (eventType: 'user_message' | 'background_persona_stage') =>
  eventType === 'user_message' ? 'chat_runtime' : 'background_persona_stage_consumer'

const getRecoveryFailureSummary = (
  eventType: 'user_message' | 'background_persona_stage'
) => eventType === 'user_message'
  ? 'user_message_reconciled_failed_during_startup'
  : 'background_persona_stage_reconciled_failed_during_startup'

class MainAgentEventRecoveryService {
  async reconcileLegacyPausedTurn(): Promise<void> {
    const pausedEvents = await mainAgentEventLogService.listPausedEvents()
    if (pausedEvents.length > 1) {
      throw new Error('Multiple paused main agent turns violate the serial dispatch invariant.')
    }
    if (!pausedEvents[0]) return
    const cancelled = await persistCancelledPausedTurn(AppDataSource)
    if (!cancelled) {
      throw new Error('Legacy paused Event could not be reconciled with a paused Turn.')
    }
  }

  async reconcileTurnOwnedEvents(): Promise<void> {
    const processingEvents = await mainAgentEventLogService.listProcessingEvents()

    for (const event of processingEvents) {
      if (event.type !== 'user_message' && event.type !== 'background_persona_stage') {
        continue
      }

      const turn = await mainAgentTurnService.findByEventId(event.id)
      const decision = resolveMainAgentTurnRecovery({
        eventType: event.type,
        eventStatus: 'processing',
        turnStatus: turn?.status ?? null,
        headKind: turn ? await mainAgentTurnVersionService.getHeadKind(turn.id) : null
      })

      if (decision.action === 'reconcile_completed_event' && turn) {
        await mainAgentEventLogService.markCompleted(event.id, {
          consumer: getConsumer(event.type),
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

      if (decision.action === 'resume_ready_commit') {
        await mainAgentEventLogService.resetToQueued(event.id)
        mainAgentDispatchService.stageRecoveredEvent(event)
        continue
      }

      await this.failClosed(event, decision.reason)
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

  private async failClosed(
    event: Extract<MainAgentEvent, { type: 'user_message' | 'background_persona_stage' }>,
    errorMessage: string
  ): Promise<void> {
    await mainAgentTurnService.reconcileIncompleteTurnForFailedEvent({
      eventId: event.id,
      errorMessage
    })
    await mainAgentEventLogService.markFailed(event.id, {
      consumer: getConsumer(event.type),
      summary: getRecoveryFailureSummary(event.type),
      errorMessage
    })
  }
}

export const mainAgentEventRecoveryService = new MainAgentEventRecoveryService()
