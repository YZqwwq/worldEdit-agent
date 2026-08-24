import type { AgentToolCompletionState, AgentToolReceipt } from '../../ai-utils/core/agentTool'

export type TurnExecutionPhase = 'understanding' | 'acting' | 'answering'
export type TurnExecutionActionStatus =
  | 'planned'
  | 'running'
  | 'accepted'
  | 'awaiting_input'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled'

export type TurnExecutionRetryCondition =
  | 'none'
  | 'change_arguments'
  | 'transient'
  | 'external_change'

export type TurnExecutionSubject = {
  type: string
  id?: string
  label?: string
}

export type TurnExecutionAction = {
  actionId: string
  toolCallId: string
  toolName: string
  operation: string
  subject?: TurnExecutionSubject
  status: TurnExecutionActionStatus
  summary: string
  retryable: boolean
  retryCondition: TurnExecutionRetryCondition
  invocationFingerprint: string
  evidenceRefs: string[]
  startedAt: string
  completedAt?: string
}

export type TurnExecutionLedger = {
  objective: string
  phase: TurnExecutionPhase
  modelStep: number
  actions: TurnExecutionAction[]
  unresolvedItems: string[]
}

const compact = (value: string, max = 260): string => {
  const normalized = String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

const stringifyId = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)])
  )
}

export const createTurnInvocationFingerprint = (toolName: string, args: unknown): string => {
  try {
    return `${toolName}:${JSON.stringify(canonicalize(args ?? {}))}`
  } catch {
    return `${toolName}:${String(args ?? '')}`
  }
}

export const inferTurnExecutionSubject = (
  args: unknown,
  receipt?: AgentToolReceipt | null
): TurnExecutionSubject | undefined => {
  if (receipt?.subject) {
    return receipt.subject
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) return undefined

  const record = args as Record<string, unknown>
  const candidates: Array<[string, unknown]> = [
    ['document', record.documentId],
    ['entity', record.entityId ?? record.characterId],
    ['world', record.worldId],
    ['task', record.taskId ?? record.backgroundTaskId]
  ]
  const matched = candidates.find(([, value]) => stringifyId(value))
  if (matched) {
    return {
      type: matched[0],
      id: stringifyId(matched[1])
    }
  }

  const toolsetIds = Array.isArray(record.toolsetIds)
    ? record.toolsetIds.filter((item): item is string => typeof item === 'string' && Boolean(item))
    : []
  if (toolsetIds.length > 0) {
    return {
      type: 'toolset',
      label: toolsetIds.join(', ')
    }
  }
  return undefined
}

const actionKey = (action: TurnExecutionAction): string =>
  [action.operation, action.subject?.type, action.subject?.id, action.subject?.label]
    .filter(Boolean)
    .join(':')

export const deriveTurnUnresolvedItems = (actions: TurnExecutionAction[]): string[] => {
  const latestByAction = new Map<string, TurnExecutionAction>()
  for (const action of actions) {
    latestByAction.set(actionKey(action) || action.actionId, action)
  }
  return [...latestByAction.values()]
    .filter(
      (action) =>
        action.status === 'accepted' ||
        action.status === 'running' ||
        action.status === 'awaiting_input' ||
        action.status === 'partial' ||
        action.status === 'failed'
    )
    .map((action) => compact(action.summary))
}

export const createTurnExecutionLedger = (objective: string): TurnExecutionLedger => ({
  objective: compact(objective, 500) || '处理当前用户请求',
  phase: 'understanding',
  modelStep: 0,
  actions: [],
  unresolvedItems: []
})

export const appendTurnExecutionAction = (
  ledger: TurnExecutionLedger,
  action: TurnExecutionAction
): TurnExecutionLedger => {
  const actions = [...ledger.actions, action]
  return {
    ...ledger,
    phase: 'acting',
    actions,
    unresolvedItems: deriveTurnUnresolvedItems(actions)
  }
}

export const createTurnExecutionAction = (input: {
  actionId: string
  toolCallId: string
  toolName: string
  args?: unknown
  ok: boolean
  summary: string
  receipt?: AgentToolReceipt | null
  evidenceRefs?: string[]
  startedAt: string
  completedAt?: string
  fallbackRetryable?: boolean
  retryCondition?: TurnExecutionRetryCondition
  status?: TurnExecutionActionStatus
  completionState?: AgentToolCompletionState
}): TurnExecutionAction => {
  const receiptStatus =
    input.receipt?.completion === 'complete'
      ? 'completed'
      : input.receipt?.completion === 'partial'
        ? 'partial'
        : input.receipt?.completion === 'failed'
          ? 'failed'
          : undefined
  const retryable = input.receipt?.retryable ?? input.fallbackRetryable ?? !input.ok
  const completionStatus: TurnExecutionActionStatus | undefined =
    input.completionState === 'accepted'
      ? 'accepted'
      : input.completionState === 'running'
        ? 'running'
        : input.completionState === 'awaiting_input'
          ? 'awaiting_input'
          : input.completionState === 'completed'
            ? 'completed'
            : input.completionState === 'failed'
              ? 'failed'
              : undefined
  return {
    actionId: input.actionId,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    operation: input.receipt?.operation || input.receipt?.kind || input.toolName,
    subject: inferTurnExecutionSubject(input.args, input.receipt),
    status:
      input.status ?? completionStatus ?? receiptStatus ?? (input.ok ? 'completed' : 'failed'),
    summary: compact(input.receipt?.summary || input.summary),
    retryable,
    retryCondition: input.retryCondition ?? (retryable ? 'transient' : 'none'),
    invocationFingerprint: createTurnInvocationFingerprint(input.toolName, input.args),
    evidenceRefs: [input.receipt?.evidenceRef, ...(input.evidenceRefs ?? [])].filter(
      (item): item is string => typeof item === 'string' && Boolean(item.trim())
    ),
    startedAt: input.startedAt,
    completedAt: input.completedAt ?? new Date().toISOString()
  }
}

export const findBlockedUnchangedInvocation = (
  ledger: TurnExecutionLedger,
  toolName: string,
  args: unknown
): TurnExecutionAction | undefined => {
  const fingerprint = createTurnInvocationFingerprint(toolName, args)
  return [...ledger.actions]
    .reverse()
    .find(
      (action) =>
        action.invocationFingerprint === fingerprint &&
        action.status === 'failed' &&
        (!action.retryable || action.retryCondition === 'change_arguments')
    )
}

export const advanceTurnExecutionModelStep = (
  ledger: TurnExecutionLedger,
  hasToolCalls: boolean
): TurnExecutionLedger => ({
  ...ledger,
  modelStep: ledger.modelStep + 1,
  phase: hasToolCalls ? 'acting' : 'answering'
})
