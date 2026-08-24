import type { AgentStageStatus } from '../../../../share/cache/render/aiagent/aiContent'

export type AgentTurnActivityPhase =
  | 'thinking'
  | 'using_tools'
  | 'finalizing'
  | 'responding'
  | 'done'
  | 'error'
  | 'interrupted'

export type AgentTurnThoughtEntry = {
  kind: 'thought'
  id: string
  order: number
  text: string
  sequence: number
  followsToolResult: boolean
  createdAt: number
}

export type AgentTurnToolEntry = {
  kind: 'tool'
  id: string
  order: number
  label: string
  status: AgentStageStatus
  detail?: string
  createdAt: number
}

export type AgentTurnActivityEntry = AgentTurnThoughtEntry | AgentTurnToolEntry

export type AgentTurnActivity = {
  messageId: number
  phase: AgentTurnActivityPhase
  label: string
  expanded: boolean
  entries: AgentTurnActivityEntry[]
  startedAt: number
  completedAt?: number
}
