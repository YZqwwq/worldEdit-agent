import type { MainAgentEventStatus } from './mainAgentEventState'
import type { MainAgentTurnStatus } from './mainAgentTurnState'
import type {
  MainAgentEventType,
  TaskNotificationStatus
} from './taskLifecycleState'

type TransitionMap<TStatus extends string> = Record<TStatus, readonly TStatus[]>

export type MainAgentCommitOwner = 'turn' | 'notification'
export type MainAgentRecoveryStrategy = 'compensate_fail' | 'replay'

export interface MainAgentFlowRule {
  eventType: MainAgentEventType
  owner: MainAgentCommitOwner
  startWhen: string
  commitWhen: string
  recoveryStrategy: MainAgentRecoveryStrategy
}

export const MAIN_AGENT_FLOW_RULES: Record<MainAgentEventType, MainAgentFlowRule> = {
  user_message: {
    eventType: 'user_message',
    owner: 'turn',
    startWhen: 'event queued -> processing and turn queued -> processing',
    commitWhen: 'turn completed or interrupted',
    recoveryStrategy: 'compensate_fail'
  },
  task_notification: {
    eventType: 'task_notification',
    owner: 'notification',
    startWhen: 'notification pending -> processing with mainAgentEventId bound',
    commitWhen: 'notification processing -> consumed after effect apply succeeds',
    recoveryStrategy: 'replay'
  },
  background_persona_stage: {
    eventType: 'background_persona_stage',
    owner: 'turn',
    startWhen: 'event queued -> processing and background turn queued -> processing',
    commitWhen: 'background stage turn completed or interrupted',
    recoveryStrategy: 'compensate_fail'
  }
}

export const MAIN_AGENT_EVENT_TRANSITIONS: TransitionMap<MainAgentEventStatus> = {
  queued: ['processing', 'failed'],
  processing: ['completed', 'failed', 'queued'],
  completed: [],
  failed: ['queued']
}

export const MAIN_AGENT_TURN_TRANSITIONS: TransitionMap<MainAgentTurnStatus> = {
  queued: ['processing', 'failed'],
  processing: ['completed', 'interrupted', 'failed'],
  completed: ['reverted'],
  interrupted: ['reverted'],
  failed: [],
  reverted: []
}

export const TASK_NOTIFICATION_TRANSITIONS: TransitionMap<TaskNotificationStatus> = {
  pending: ['processing'],
  processing: ['pending', 'consumed'],
  consumed: []
}

export const COMMITTED_MAIN_AGENT_TURN_STATUSES = [
  'completed',
  'interrupted'
] as const

export const TERMINAL_MAIN_AGENT_TURN_STATUSES = [
  'completed',
  'interrupted',
  'failed',
  'reverted'
] as const

export const ACTIVE_TASK_NOTIFICATION_STATUSES = ['pending', 'processing'] as const

const canTransition = <TStatus extends string>(
  map: TransitionMap<TStatus>,
  from: TStatus,
  to: TStatus
): boolean => {
  if (from === to) {
    return true
  }
  return map[from].includes(to)
}

const assertTransition = <TStatus extends string>(
  label: string,
  map: TransitionMap<TStatus>,
  from: TStatus,
  to: TStatus
): void => {
  if (canTransition(map, from, to)) {
    return
  }
  throw new Error(`Invalid ${label} transition: ${from} -> ${to}`)
}

export const canTransitionMainAgentEventStatus = (
  from: MainAgentEventStatus,
  to: MainAgentEventStatus
): boolean => canTransition(MAIN_AGENT_EVENT_TRANSITIONS, from, to)

export const assertMainAgentEventStatusTransition = (
  from: MainAgentEventStatus,
  to: MainAgentEventStatus
): void => assertTransition('main agent event status', MAIN_AGENT_EVENT_TRANSITIONS, from, to)

export const canTransitionMainAgentTurnStatus = (
  from: MainAgentTurnStatus,
  to: MainAgentTurnStatus
): boolean => canTransition(MAIN_AGENT_TURN_TRANSITIONS, from, to)

export const assertMainAgentTurnStatusTransition = (
  from: MainAgentTurnStatus,
  to: MainAgentTurnStatus
): void => assertTransition('main agent turn status', MAIN_AGENT_TURN_TRANSITIONS, from, to)

export const canTransitionTaskNotificationStatus = (
  from: TaskNotificationStatus,
  to: TaskNotificationStatus
): boolean => canTransition(TASK_NOTIFICATION_TRANSITIONS, from, to)

export const assertTaskNotificationStatusTransition = (
  from: TaskNotificationStatus,
  to: TaskNotificationStatus
): void =>
  assertTransition('task notification status', TASK_NOTIFICATION_TRANSITIONS, from, to)

export const isCommittedMainAgentTurnStatus = (
  status: MainAgentTurnStatus
): status is (typeof COMMITTED_MAIN_AGENT_TURN_STATUSES)[number] =>
  COMMITTED_MAIN_AGENT_TURN_STATUSES.includes(
    status as (typeof COMMITTED_MAIN_AGENT_TURN_STATUSES)[number]
  )

export const isTerminalMainAgentTurnStatus = (
  status: MainAgentTurnStatus
): status is (typeof TERMINAL_MAIN_AGENT_TURN_STATUSES)[number] =>
  TERMINAL_MAIN_AGENT_TURN_STATUSES.includes(
    status as (typeof TERMINAL_MAIN_AGENT_TURN_STATUSES)[number]
  )
