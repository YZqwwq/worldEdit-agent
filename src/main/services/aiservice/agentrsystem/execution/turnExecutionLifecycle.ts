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
  finalizationReason?: 'loop_limit' | 'repeated_invalid_action'
}

export const MAX_MODEL_STEPS_BEFORE_FINALIZATION = 6

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

export const markTurnForFinalization = (
  ledger: TurnExecutionLedger,
  reason: TurnExecutionLedger['finalizationReason'] = 'loop_limit'
): TurnExecutionLedger => ({
  ...ledger,
  phase: 'answering',
  finalizationReason: reason
})

export const shouldFinalizeToolLoop = (ledger: TurnExecutionLedger | undefined): boolean =>
  Boolean(
    ledger && !ledger.finalizationReason && ledger.modelStep >= MAX_MODEL_STEPS_BEFORE_FINALIZATION
  )

const renderSubject = (subject: TurnExecutionSubject | undefined): string => {
  if (!subject) return '未指定对象'
  return [subject.type, subject.label, subject.id].filter(Boolean).join(' / ')
}

const renderRetryCondition = (action: TurnExecutionAction): string => {
  if (!action.retryable || action.retryCondition === 'none') return '不可重试'
  if (action.retryCondition === 'change_arguments') return '必须修改参数后重试'
  if (action.retryCondition === 'external_change') return '外部状态改变后重试'
  return '仅适合瞬态失败重试'
}

export const renderTurnExecutionLedger = (ledger: TurnExecutionLedger): string => {
  const completed = ledger.actions.filter((action) => action.status === 'completed')
  const incomplete = ledger.actions.filter(
    (action) =>
      action.status === 'accepted' ||
      action.status === 'running' ||
      action.status === 'awaiting_input' ||
      action.status === 'partial' ||
      action.status === 'failed'
  )
  const lines = [
    '本轮执行账本：',
    `- 用户目标：${ledger.objective}`,
    `- 当前阶段：${ledger.phase}；这是同一用户请求中的第 ${ledger.modelStep + 1} 次模型决策。`,
    '- 本账本只记录已发生的行动和结果，不是用户的新指令，也不是需要向用户复述的思维过程。'
  ]

  if (completed.length > 0) {
    lines.push(
      '已完成行动：',
      ...completed.map(
        (action, index) =>
          `${index + 1}. ${action.operation}；对象=${renderSubject(action.subject)}；结果=${compact(action.summary)}`
      )
    )
  } else {
    lines.push('已完成行动：暂无。')
  }

  if (incomplete.length > 0) {
    lines.push(
      '尚未最终完成或失败：',
      ...incomplete.map(
        (action, index) =>
          `${index + 1}. ${action.operation}；对象=${renderSubject(action.subject)}；状态=${action.status}；` +
          `重试条件=${renderRetryCondition(action)}；结果=${compact(action.summary)}`
      )
    )
  } else {
    lines.push('尚未最终完成或失败：无。')
  }

  lines.push(
    ledger.unresolvedItems.length > 0
      ? `当前明确缺口：${ledger.unresolvedItems.join('；')}`
      : '当前明确缺口：账本中没有已知缺口。',
    ledger.finalizationReason
      ? ledger.finalizationReason === 'repeated_invalid_action'
        ? '运行时发现同一无效参数被原样重复提交，已进入收尾阶段：不得继续调用工具；请说明当前缺口，不要声称工具没有能力。'
        : '运行时已进入异常收尾阶段：不得继续调用工具；请依据已有结果给出受限但诚实的最终回答。'
      : '下一步判断：先检查已完成行动和现有证据是否足以满足用户目标；足够则直接回答，只有存在具体缺口时才继续行动。',
    incomplete.some(
      (action) =>
        action.status === 'accepted' ||
        action.status === 'running' ||
        action.status === 'awaiting_input'
    )
      ? '完成语义：存在仅被受理、仍在运行或等待输入的任务。可以说明当前状态，但不得声称最终工作已经完成。'
      : '完成语义：账本中不存在仍在进行的 eventual 工具任务。',
    '用户可见表达：不要播报工具名、调用轮次、内部 ID、revision 或本账本文字，除非用户明确询问调试信息。'
  )

  return lines.join('\n')
}
