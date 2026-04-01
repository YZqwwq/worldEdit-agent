import type {
  TaskExecutionStatus,
  TaskLifecycleNotice,
  TaskNotificationType,
  TaskStatus
} from './taskLifecycleState'

export const SUBAGENT_PROTOCOL_VERSION = 'subagent/v1' as const

export type SubAgentOutcome = 'completed' | 'needs_input' | 'failed' | 'cancelled'

export type SubAgentAppliedTool = {
  name: string
  status: 'ok' | 'error'
}

export type SubAgentCompletedDetails = {
  kind: 'completed'
  changedScopes?: string[]
  appliedTools?: SubAgentAppliedTool[]
  internalWarning?: string
  suggestedFollowUp?: string
}

export type SubAgentNeedsInputDetails = {
  kind: 'needs_input'
  phase?: string
  missingFields?: string[]
  suggestedPrompt?: string
  appliedTools?: SubAgentAppliedTool[]
}

export type SubAgentFailedDetails = {
  kind: 'failed'
  errorType?:
    | 'validation'
    | 'not_found'
    | 'tool_error'
    | 'model_error'
    | 'runtime_error'
    | 'unknown'
  retryable?: boolean
  internalWarning?: string
  appliedTools?: SubAgentAppliedTool[]
}

export type SubAgentCancelledDetails = {
  kind: 'cancelled'
  reason?: string
}

export type SubAgentProtocolDetails =
  | SubAgentCompletedDetails
  | SubAgentNeedsInputDetails
  | SubAgentFailedDetails
  | SubAgentCancelledDetails

export type SubAgentProtocolPayload = {
  protocolVersion: typeof SUBAGENT_PROTOCOL_VERSION
  outcome: SubAgentOutcome
  summary: string
  message: string
  pendingContext?: Record<string, unknown>
  errorMessage?: string
  details?: SubAgentProtocolDetails
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const normalizeText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const normalizeStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined
  }
  const normalized = value
    .map((item) => normalizeText(item))
    .filter((item) => item.length > 0)
  return normalized.length > 0 ? normalized : undefined
}

const normalizeAppliedTools = (value: unknown): SubAgentAppliedTool[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined
  }
  const normalized = value.flatMap((item) => {
    if (!isRecord(item)) {
      return []
    }
    const name = normalizeText(item.name)
    const statusRaw = normalizeText(item.status)
    const status = statusRaw === 'error' ? 'error' : statusRaw === 'ok' ? 'ok' : ''
    if (!name || !status) {
      return []
    }
    return [{ name, status } satisfies SubAgentAppliedTool]
  })
  return normalized.length > 0 ? normalized : undefined
}

const normalizeBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined

const normalizeFailedErrorType = (
  value: unknown
): SubAgentFailedDetails['errorType'] => {
  const errorType = normalizeText(value)
  switch (errorType) {
    case 'validation':
    case 'not_found':
    case 'tool_error':
    case 'model_error':
    case 'runtime_error':
    case 'unknown':
      return errorType
    default:
      return undefined
  }
}

const normalizeDetailsByOutcome = (
  outcome: SubAgentOutcome,
  details: unknown
): SubAgentProtocolDetails | undefined => {
  const raw = isRecord(details) ? details : {}

  switch (outcome) {
    case 'completed': {
      const normalized: SubAgentCompletedDetails = {
        kind: 'completed',
        changedScopes: normalizeStringArray(raw.changedScopes),
        appliedTools: normalizeAppliedTools(raw.appliedTools),
        internalWarning: normalizeText(raw.internalWarning) || undefined,
        suggestedFollowUp: normalizeText(raw.suggestedFollowUp) || undefined
      }
      return normalized.changedScopes ||
        normalized.appliedTools ||
        normalized.internalWarning ||
        normalized.suggestedFollowUp
        ? normalized
        : undefined
    }
    case 'needs_input': {
      const normalized: SubAgentNeedsInputDetails = {
        kind: 'needs_input',
        phase: normalizeText(raw.phase) || undefined,
        missingFields: normalizeStringArray(raw.missingFields),
        suggestedPrompt: normalizeText(raw.suggestedPrompt) || undefined,
        appliedTools: normalizeAppliedTools(raw.appliedTools)
      }
      return normalized.phase ||
        normalized.missingFields ||
        normalized.suggestedPrompt ||
        normalized.appliedTools
        ? normalized
        : undefined
    }
    case 'failed': {
      const normalized: SubAgentFailedDetails = {
        kind: 'failed',
        errorType: normalizeFailedErrorType(raw.errorType),
        retryable: normalizeBoolean(raw.retryable),
        internalWarning: normalizeText(raw.internalWarning) || undefined,
        appliedTools: normalizeAppliedTools(raw.appliedTools)
      }
      return normalized.errorType ||
        typeof normalized.retryable === 'boolean' ||
        normalized.internalWarning ||
        normalized.appliedTools
        ? normalized
        : undefined
    }
    case 'cancelled': {
      const normalized: SubAgentCancelledDetails = {
        kind: 'cancelled',
        reason: normalizeText(raw.reason) || undefined
      }
      return normalized.reason ? normalized : undefined
    }
  }
}

export const buildSubAgentProtocolPayload = (input: {
  outcome: SubAgentOutcome
  summary: string
  message: string
  pendingContext?: Record<string, unknown>
  errorMessage?: string
  details?: SubAgentProtocolDetails
}): SubAgentProtocolPayload => ({
  protocolVersion: SUBAGENT_PROTOCOL_VERSION,
  outcome: input.outcome,
  summary: input.summary.trim(),
  message: input.message.trim(),
  pendingContext: isRecord(input.pendingContext) ? input.pendingContext : undefined,
  errorMessage: normalizeText(input.errorMessage) || undefined,
  details: normalizeDetailsByOutcome(input.outcome, input.details)
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
    message: normalizeText(input.message) || fallback?.message || '',
    pendingContext: isRecord(input.pendingContext) ? input.pendingContext : undefined,
    errorMessage: normalizeText(input.errorMessage) || undefined,
    details: normalizeDetailsByOutcome(outcome, input.details)
  })
}

const buildCanonicalNoticeMessage = (input: {
  taskTitle: string
  outcome: SubAgentOutcome
  payload: SubAgentProtocolPayload
}): string | undefined => {
  const details = input.payload.details
  if (!details) {
    return input.payload.message || input.payload.errorMessage || undefined
  }

  switch (details.kind) {
    case 'completed':
      return (
        `任务「${input.taskTitle}」的子 agent 已完成本轮执行。` +
        (details.suggestedFollowUp?.trim()
          ? ` ${details.suggestedFollowUp.trim()}`
          : ' 请与用户确认是否结束任务，或继续给出下一步修改要求。')
      )
    case 'needs_input':
      return (
        details.suggestedPrompt?.trim() ||
        (details.missingFields?.length
          ? `要继续任务「${input.taskTitle}」，还需要补充这些信息：${details.missingFields.join('、')}。`
          : `任务「${input.taskTitle}」还需要更多信息才能继续。`)
      )
    case 'failed':
      return (
        `任务「${input.taskTitle}」的子 agent 本轮执行失败。` +
        (details.errorType ? ` 错误类型：${details.errorType}。` : ' ') +
        (typeof details.retryable === 'boolean'
          ? details.retryable
            ? '该问题可以考虑重试。'
            : '当前不建议自动重试，请先向用户说明情况。'
          : '请先向用户说明情况，再决定是否重试。')
      )
    case 'cancelled':
      return (
        `任务「${input.taskTitle}」的子 agent 已停止本轮执行。` +
        (details.reason?.trim() ? ` 原因：${details.reason.trim()}。` : ' ') +
        '请由主 agent 与用户确认是否关闭任务。'
      )
  }
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
            buildCanonicalNoticeMessage(input) ||
            `子 agent 已完成任务「${input.taskTitle}」的本轮执行，请向用户确认是否结束任务。`
        }
      }
    case 'needs_input':
      return {
        nextStatus: 'awaiting_user_input',
        notice: {
          type: 'task_needs_input',
          message:
            buildCanonicalNoticeMessage(input) ||
            `子 agent 在任务「${input.taskTitle}」中需要更多用户输入，请先向用户收集补充信息。`
        }
      }
    case 'failed':
      return {
        nextStatus: 'cancelled',
        notice: {
          type: 'task_failed',
          message:
            buildCanonicalNoticeMessage(input) ||
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
            buildCanonicalNoticeMessage(input) ||
            `任务「${input.taskTitle}」的子 agent 已停止本轮执行。请由主 agent 向用户确认是否关闭任务。`
        }
      }
  }
}
