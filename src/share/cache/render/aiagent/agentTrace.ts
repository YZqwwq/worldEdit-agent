export type AgentTracePhase =
  | 'enter'
  | 'state'
  | 'decision'
  | 'artifact'
  | 'exit'
  | 'error'

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
}
