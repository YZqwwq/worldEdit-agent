export type ToolEffectStatus = 'planned' | 'completed' | 'failed' | 'aborted' | 'unknown'
export type ToolEffectRecoveryMode = 'same_database_transaction' | 'best_effort'
export type ToolChangeSetScopeType = 'turn' | 'task'
export type ToolChangeSetLifecycle = 'open' | 'sealed'
export type ToolChangeSetOutcome =
  | 'empty'
  | 'in_progress'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'unknown'

export type ToolEffectSubject = {
  type: string
  id: string
  label?: string
}

export type ToolEffectReceiptPayload = {
  id: string
  changeSetId: string
  eventId: string
  turnId: number
  toolCallId: string
  effectKey: string
  toolName: string
  recoveryMode: ToolEffectRecoveryMode
  operation: string
  subject: ToolEffectSubject
  status: ToolEffectStatus
  beforeRevision?: number
  afterRevision?: number
  beforeRef?: string
  afterRef?: string
  summary: string
  evidenceRef?: string
  diffRef?: string
  resultRef?: string
  payload?: Record<string, unknown>
  compensatable: boolean
  persistedAt: string
  settledAt?: string
}

export type ToolChangeSetSummary = {
  id: string
  scopeType: ToolChangeSetScopeType
  scopeId: string
  eventId: string
  turnId: number
  sessionId: string
  lifecycle: ToolChangeSetLifecycle
  outcome: ToolChangeSetOutcome
  title?: string
  effectCount: number
  counts: Record<ToolEffectStatus, number>
  subjectTypes: string[]
  summaries: string[]
  createdAt: string
  sealedAt?: string
}
