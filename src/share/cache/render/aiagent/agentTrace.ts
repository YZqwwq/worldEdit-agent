export type AgentTracePhase = 'enter' | 'state' | 'decision' | 'artifact' | 'exit' | 'error'

export type AgentTraceLevel = 'info' | 'warn' | 'error'

export type AgentTraceScope = 'run' | 'node' | 'loop' | 'tool' | 'recovery'

export type AgentTraceStatus =
  | 'started'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'skipped'

export interface AgentTraceRecord {
  id: string
  sessionId: string
  eventId: string
  turnId: number
  runId: string
  scope: AgentTraceScope
  node: string
  phase: AgentTracePhase
  status?: AgentTraceStatus
  modelStep?: number
  toolBatchId?: string
  toolCallId?: string
  actionId?: string
  changeSetId?: string
  receiptIds?: string[]
  title: string
  summary?: string
  data?: Record<string, unknown>
  timestamp: number
  durationMs?: number
  level: AgentTraceLevel
  sequence: number
}

export type AgentTraceRunStatus = 'running' | 'completed' | 'interrupted' | 'failed'

export interface AgentTraceRunSummary {
  runId: string
  sessionId: string
  eventId: string
  turnId: number
  status: AgentTraceRunStatus
  startedAt: number
  completedAt?: number
  durationMs?: number
  recordCount: number
  nodePath: string[]
  tools: string[]
  failureNode?: string
}

export interface AgentTraceRunSummaryQuery {
  limit?: number
  status?: AgentTraceRunStatus
  sessionId?: string
  eventId?: string
  turnId?: number
}

export interface AgentTraceQuery {
  runId?: string
  sessionId?: string
  eventId?: string
  turnId?: number
  cursor?: number
  limit?: number
  charBudget?: number
  node?: string
  phase?: AgentTracePhase
  level?: AgentTraceLevel
  scope?: AgentTraceScope
  modelStep?: number
  toolCallId?: string
  changeSetId?: string
}

export interface AgentTraceQueryResult {
  records: AgentTraceRecord[]
  nextCursor?: number
  totalMatching: number
  returnedChars: number
  truncated: boolean
}
