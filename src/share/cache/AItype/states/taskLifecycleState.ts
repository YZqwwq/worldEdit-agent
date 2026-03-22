export type TaskStatus =
  | 'active'
  | 'running'
  | 'pending_main_ack'
  | 'awaiting_user_input'
  | 'awaiting_user_confirmation'
  | 'done'
  | 'cancelled'

export type TaskExecutionStatus =
  | 'queued'
  | 'dispatching'
  | 'running'
  | 'awaiting_input'
  | 'reported_done'
  | 'failed'
  | 'cancelled'

export type TaskNotificationType =
  | 'subagent_completed'
  | 'subagent_failed'
  | 'subagent_needs_input'

export type TaskNotificationStatus = 'pending' | 'consumed'

export type TaskTraceActor = 'subagent' | 'main_agent' | 'user' | 'system'

export type MainAgentInboxSource = 'user' | 'task_queue'

export type MainAgentDispatchState =
  | 'idle'
  | 'user-active'
  | 'tasklist-active'
  | 'active'
  | 'processing'

export type TaskTraceStage =
  | 'subagent_activated'
  | 'subagent_notify_main'
  | 'main_received_subagent'
  | 'main_response_silent'
  | 'main_response_user'
  | 'user_replied_to_task'

export type TaskLifecycleDecisionType =
  | 'none'
  | 'create_task'
  | 'continue_task'
  | 'confirm_close_task'

export type TaskNoticeType =
  | 'task_started'
  | 'task_waiting_confirmation'
  | 'task_needs_input'
  | 'task_failed'
  | 'task_cancelled'
  | 'task_registration_blocked'

export type TaskExecutorKind =
  | 'general_task_worker'
  | 'code_worker'
  | 'doc_worker'
  | 'character_editor'
  | 'tool_builder'
  | 'architecture_analyst'
  | 'general_research'

export interface ActiveTaskSnapshot {
  id: number
  title: string
  goal: string
  summary: string
  status: TaskStatus
  executorKind: TaskExecutorKind
  progressNotes?: string
}

export interface TaskExecutionSnapshot {
  id: number
  taskId: number
  runNumber: number
  executorKind: TaskExecutorKind
  status: TaskExecutionStatus
  resultSummary: string
  errorReport?: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
}

export interface TaskMonitorSnapshot {
  activeTask?: ActiveTaskSnapshot
  executions: TaskExecutionSnapshot[]
  traces: TaskTraceSnapshot[]
  dispatch: TaskDispatchSnapshot
}

export interface TaskTraceSnapshot {
  id: number
  taskId: number
  executionId?: number
  actor: TaskTraceActor
  stage: TaskTraceStage
  message: string
  createdAt: string
}

export interface TaskDispatchSnapshot {
  state: MainAgentDispatchState
  queuedUserCount: number
  queuedTaskCount: number
  totalQueued: number
  currentSource?: MainAgentInboxSource
  currentLabel?: string
}

export interface MainAgentTaskEvent {
  source: 'task_queue'
  taskId: number
  notificationId: number
  notificationType: TaskNotificationType
  activeTask: ActiveTaskSnapshot
  notice: TaskLifecycleNotice
  payload: Record<string, unknown>
}

export type MainAgentTaskDecisionAction = 'none' | 'ask_user' | 'resume_subagent'

export interface MainAgentTaskDecision {
  action: MainAgentTaskDecisionAction
  reason: string
  visibleMessage?: string
}

export interface TaskLifecycleDecision {
  type: TaskLifecycleDecisionType
  confidence: number
  reason: string
}

export interface TaskLifecycleNotice {
  type: TaskNoticeType
  message: string
}

export interface TaskCapabilityState {
  executorKind: TaskExecutorKind
  requiredToolName: string
  available: boolean
  message: string
}

export interface TaskLifecycleState {
  activeTask?: ActiveTaskSnapshot
  decision?: TaskLifecycleDecision
  notice?: TaskLifecycleNotice
  capability?: TaskCapabilityState
}
