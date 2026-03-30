import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type { SubAgentProtocolPayload } from './taskCommunication'
import type { TaskExecutionInspectionSection } from './taskExecutionInspection'

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
  | 'subagent_cancelled'

export type TaskNotificationStatus = 'pending' | 'consumed'

export type TaskTraceActor = 'subagent' | 'main_agent' | 'user' | 'system'

export type MainAgentInboxSource = 'user' | 'task_queue'
export type MainAgentEventType = 'user_message' | 'task_notification'
export type MainAgentEventPriority = 'interactive' | 'background'
export type MainAgentEventConsumer =
  | 'chat_runtime'
  | 'task_notification_consumer'
  | 'lifecycle_control'

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
  | 'task_cancel_requested'
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
  input?: TaskExecutionInspectionSection
  output?: TaskExecutionInspectionSection
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
  currentEventType?: MainAgentEventType
  currentLabel?: string
}

export interface MainAgentUserMessagePayload {
  messageId: number
  text: string
  onChunk?: (chunk: StreamChunk) => void
}

export interface MainAgentTaskNotificationPayload {
  taskId: number
  notificationId: number
}

export interface MainAgentEventBase {
  id: string
  type: MainAgentEventType
  source: MainAgentInboxSource
  sessionId: string
  priority: MainAgentEventPriority
  createdAt: number
  dedupeKey?: string
}

export interface MainAgentUserMessageEvent extends MainAgentEventBase {
  type: 'user_message'
  source: 'user'
  payload: MainAgentUserMessagePayload
}

export interface MainAgentTaskNotificationEvent extends MainAgentEventBase {
  type: 'task_notification'
  source: 'task_queue'
  payload: MainAgentTaskNotificationPayload
}

export type MainAgentEvent =
  | MainAgentUserMessageEvent
  | MainAgentTaskNotificationEvent

export interface MainAgentEffectBase {
  eventId: string
  sessionId: string
}

export interface MainAgentSaveMessageEffect extends MainAgentEffectBase {
  type: 'save_message'
  role: 'user' | 'ai'
  content: string
  turnId?: number
  messageStatus?: 'draft' | 'committed' | 'interrupted' | 'reverted'
  eventIdRef?: string
  consumer?: string
}

export interface MainAgentUpdateChatTurnEffect extends MainAgentEffectBase {
  type: 'update_chat_turn'
  turnId: number
  status: 'processing' | 'completed' | 'interrupted' | 'failed'
  errorMessage?: string
}

export interface MainAgentSyncMemoryMessagesEffect extends MainAgentEffectBase {
  type: 'sync_memory_messages'
  messages: Array<{
    role: 'user' | 'ai'
    content: string
  }>
}

export interface MainAgentEmitTraceEffect extends MainAgentEffectBase {
  type: 'emit_trace'
  taskId: number
  executionId?: number
  actor: TaskTraceActor
  stage: TaskTraceStage
  message: string
  payload?: Record<string, unknown>
}

export interface MainAgentStreamDoneEffect extends MainAgentEffectBase {
  type: 'stream_done'
  onChunk?: (chunk: StreamChunk) => void
  fullText: string
}

export interface MainAgentStreamErrorEffect extends MainAgentEffectBase {
  type: 'stream_error'
  onChunk?: (chunk: StreamChunk) => void
  message: string
}

export type MainAgentEffect =
  | MainAgentSaveMessageEffect
  | MainAgentUpdateChatTurnEffect
  | MainAgentSyncMemoryMessagesEffect
  | MainAgentEmitTraceEffect
  | MainAgentStreamDoneEffect
  | MainAgentStreamErrorEffect

export interface MainAgentEventConsumptionResult {
  handled: boolean
  consumer: MainAgentEventConsumer
  summary: string
  effects: MainAgentEffect[]
}

export interface MainAgentTaskEvent {
  source: 'task_queue'
  taskId: number
  notificationId: number
  notificationType: TaskNotificationType
  activeTask: ActiveTaskSnapshot
  notice: TaskLifecycleNotice
  payload: SubAgentProtocolPayload
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
