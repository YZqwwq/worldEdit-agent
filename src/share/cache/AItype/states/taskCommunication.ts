import type {
  TaskExecutionStatus,
  TaskLifecycleNotice,
  TaskNotificationType,
  TaskStatus
} from './taskLifecycleState'

export const SUBAGENT_PROTOCOL_VERSION = 'subagent/v1' as const

export type SubAgentOutcome = 'completed' | 'needs_input' | 'failed' | 'cancelled'

export type SubAgentProtocolPayload = {
  protocolVersion: typeof SUBAGENT_PROTOCOL_VERSION
  outcome: SubAgentOutcome
  summary: string
  message: string
  pendingContext?: Record<string, unknown>
  errorMessage?: string
  details?: Record<string, unknown>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const normalizeText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

export const buildSubAgentProtocolPayload = (input: {
  outcome: SubAgentOutcome
  summary: string
  message: string
  pendingContext?: Record<string, unknown>
  errorMessage?: string
  details?: Record<string, unknown>
}): SubAgentProtocolPayload => ({
  protocolVersion: SUBAGENT_PROTOCOL_VERSION,
  outcome: input.outcome,
  summary: input.summary.trim(),
  message: input.message.trim(),
  pendingContext: isRecord(input.pendingContext) ? input.pendingContext : undefined,
  errorMessage: normalizeText(input.errorMessage) || undefined,
  details: isRecord(input.details) ? input.details : undefined
})

export const parseSubAgentProtocolPayload = (
  input: unknown,
  fallback?: {
    outcome?: SubAgentOutcome
    summary?: string
    message?: string
  }
): SubAgentProtocolPayload => {
  if (!isRecord(input)) {
    return buildSubAgentProtocolPayload({
      outcome: fallback?.outcome ?? 'failed',
      summary: fallback?.summary ?? '',
      message: fallback?.message ?? ''
    })
  }

  const outcomeRaw = normalizeText(input.outcome)
  const outcome: SubAgentOutcome =
    outcomeRaw === 'completed' ||
    outcomeRaw === 'needs_input' ||
    outcomeRaw === 'failed' ||
    outcomeRaw === 'cancelled'
      ? outcomeRaw
      : (fallback?.outcome ?? 'failed')

  return buildSubAgentProtocolPayload({
    outcome,
    summary: normalizeText(input.summary) || fallback?.summary || '',
    message:
      normalizeText(input.message) ||
      normalizeText(input.note) ||
      fallback?.message ||
      '',
    pendingContext: isRecord(input.pendingContext) ? input.pendingContext : undefined,
    errorMessage:
      normalizeText(input.errorMessage) ||
      normalizeText(input.error) ||
      undefined,
    details: isRecord(input.details) ? input.details : undefined
  })
}

export const subAgentOutcomeToNotificationType = (
  outcome: SubAgentOutcome
): TaskNotificationType => {
  switch (outcome) {
    case 'completed':
      return 'subagent_completed'
    case 'needs_input':
      return 'subagent_needs_input'
    case 'failed':
      return 'subagent_failed'
    case 'cancelled':
      return 'subagent_cancelled'
  }
}

export const taskNotificationTypeToSubAgentOutcome = (
  type: TaskNotificationType
): SubAgentOutcome => {
  switch (type) {
    case 'subagent_completed':
      return 'completed'
    case 'subagent_needs_input':
      return 'needs_input'
    case 'subagent_failed':
      return 'failed'
    case 'subagent_cancelled':
      return 'cancelled'
  }
}

export const getExecutionStatusForSubAgentOutcome = (
  outcome: SubAgentOutcome
): TaskExecutionStatus => {
  switch (outcome) {
    case 'completed':
      return 'reported_done'
    case 'needs_input':
      return 'awaiting_input'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
  }
}

export const buildTaskNoticeFromSubAgentPayload = (input: {
  taskTitle: string
  outcome: SubAgentOutcome
  payload: SubAgentProtocolPayload
}): { nextStatus: TaskStatus; notice: TaskLifecycleNotice } => {
  switch (input.outcome) {
    case 'completed':
      return {
        nextStatus: 'awaiting_user_confirmation',
        notice: {
          type: 'task_waiting_confirmation',
          message:
            input.payload.message ||
            `子 agent 已完成任务「${input.taskTitle}」的本轮执行，请向用户确认是否结束任务。`
        }
      }
    case 'needs_input':
      return {
        nextStatus: 'awaiting_user_input',
        notice: {
          type: 'task_needs_input',
          message:
            input.payload.message ||
            `子 agent 在任务「${input.taskTitle}」中需要更多用户输入，请先向用户收集补充信息。`
        }
      }
    case 'failed':
      return {
        nextStatus: 'cancelled',
        notice: {
          type: 'task_failed',
          message:
            input.payload.message ||
            input.payload.errorMessage ||
            `子 agent 在任务「${input.taskTitle}」的本轮执行中失败，请向用户说明失败原因并决定是否重试或取消。`
        }
      }
    case 'cancelled':
      return {
        nextStatus: 'awaiting_user_confirmation',
        notice: {
          type: 'task_cancel_requested',
          message:
            input.payload.message ||
            `任务「${input.taskTitle}」的子 agent 已停止本轮执行。请由主 agent 向用户确认是否关闭任务。`
        }
      }
  }
}
