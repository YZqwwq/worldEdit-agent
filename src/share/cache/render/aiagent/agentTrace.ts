export type AgentTracePhase = 'enter' | 'state' | 'decision' | 'artifact' | 'exit' | 'error'

export type AgentTraceLevel = 'info' | 'warn' | 'error'

export interface AgentTraceRecord {
  id: string
  runId: string
  turnId?: number
  parentId?: string
  node: string
  phase: AgentTracePhase
  title: string
  summary?: string
  data?: Record<string, unknown>
  timestamp: number
  durationMs?: number
  level: AgentTraceLevel
  sequence: number
}

export type AgentTraceRunStatus = 'running' | 'completed' | 'failed'

export interface AgentTraceRunSummary {
  runId: string
  turnId?: number
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
}

export interface AgentTraceQuery {
  runId: string
  cursor?: number
  limit?: number
  charBudget?: number
  node?: string
  phase?: AgentTracePhase
  level?: AgentTraceLevel
}

export interface AgentTraceQueryResult {
  records: AgentTraceRecord[]
  nextCursor?: number
  totalMatching: number
  returnedChars: number
  truncated: boolean
}
