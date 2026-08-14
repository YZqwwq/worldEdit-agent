import type { MainAgentEventStatus } from '@share/cache/AItype/states/mainAgentEventState'
import type { MainAgentTurnStatus } from '@share/cache/AItype/states/mainAgentTurnState'
import type { MainAgentEventType } from '@share/cache/AItype/states/taskLifecycleState'
import type { MainAgentTurnVersionKind } from '@share/entity/database/MainAgentTurnVersionRecord'

export type MainAgentTurnRecoveryAction =
  | 'resume_ready_commit'
  | 'reconcile_completed_event'
  | 'fail_closed'
  | 'none'

export type MainAgentTurnRecoveryDecision = {
  action: MainAgentTurnRecoveryAction
  reason: string
}

export type MainAgentTurnRecoveryState = {
  eventType: MainAgentEventType
  eventStatus: MainAgentEventStatus
  turnStatus: MainAgentTurnStatus | null
  headKind: MainAgentTurnVersionKind | null
  hasUnknownToolEffects?: boolean
}

/**
 * Converts durable Event/Turn/HEAD state into the only startup action that is
 * safe to perform. A normal checkpoint deliberately stays fail-closed until
 * tool actions have a durable planned/receipt/unknown protocol.
 */
export const resolveMainAgentTurnRecovery = (
  state: MainAgentTurnRecoveryState
): MainAgentTurnRecoveryDecision => {
  if (state.eventStatus === 'processing') {
    if (
      (state.turnStatus === 'completed' || state.turnStatus === 'interrupted') &&
      state.headKind === 'final'
    ) {
      return {
        action: 'reconcile_completed_event',
        reason: 'The Turn and Final Version committed before the Event status was reconciled.'
      }
    }
    if (state.hasUnknownToolEffects) {
      return {
        action: 'fail_closed',
        reason:
          'A planned tool side effect has an unknown outcome after process restart; it must not be replayed automatically.'
      }
    }
    if (
      state.eventType === 'user_message' &&
      state.turnStatus === 'processing' &&
      state.headKind === 'ready_to_commit'
    ) {
      return {
        action: 'resume_ready_commit',
        reason: 'The authoritative result is ready and only the Final commit remains.'
      }
    }
    return {
      action: 'fail_closed',
      reason:
        state.headKind === 'checkpoint'
          ? 'A running checkpoint may contain an external tool action with unknown outcome.'
          : 'The processing Event has no safely resumable durable state.'
    }
  }

  return {
    action: 'none',
    reason: 'The Event is not owned by startup Turn recovery.'
  }
}
