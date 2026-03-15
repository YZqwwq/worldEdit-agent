export type TaskStatus =
  | 'active'
  | 'running'
  | 'awaiting_user_confirmation'
  | 'done'
  | 'cancelled'

export type TaskExecutionStatus = 'queued' | 'running' | 'reported_done' | 'failed'

export type TaskLifecycleDecisionType =
  | 'none'
  | 'create_task'
  | 'continue_task'
  | 'confirm_close_task'

export type TaskNoticeType =
  | 'task_started'
  | 'task_waiting_confirmation'
  | 'task_cancelled'
  | 'task_registration_blocked'

export type TaskExecutorKind =
  | 'general_task_worker'
  | 'code_worker'
  | 'doc_worker'
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

export interface ExperienceRecallItem {
  id: number
  title: string
  problemPattern: string
  executionStrategy: string
  verificationStrategy: string
  outcome: string
  pitfalls: string
  relevanceScore?: number
}

export interface TaskLifecycleState {
  activeTask?: ActiveTaskSnapshot
  decision?: TaskLifecycleDecision
  notice?: TaskLifecycleNotice
  capability?: TaskCapabilityState
  recalledExperiences?: ExperienceRecallItem[]
}
