export const MAIN_AGENT_MESSAGE_STATUS_VALUES = [
  'draft',
  'committed',
  'interrupted',
  'reverted'
] as const

export type MainAgentMessageStatus = (typeof MAIN_AGENT_MESSAGE_STATUS_VALUES)[number]

export const VISIBLE_MAIN_AGENT_MESSAGE_STATUSES = [
  'committed',
  'interrupted'
] as const

export const MAIN_AGENT_TURN_STATUS_VALUES = [
  'queued',
  'processing',
  'completed',
  'interrupted',
  'failed',
  'reverted'
] as const

export type MainAgentTurnStatus = (typeof MAIN_AGENT_TURN_STATUS_VALUES)[number]

export const MAIN_AGENT_TURN_RUNTIME_STATUS_VALUES = [
  'processing',
  'completed',
  'interrupted',
  'failed'
] as const

export type MainAgentTurnRuntimeStatus =
  (typeof MAIN_AGENT_TURN_RUNTIME_STATUS_VALUES)[number]

export const REVERTIBLE_MAIN_AGENT_TURN_STATUSES = [
  'completed',
  'interrupted'
] as const

export type MainAgentTurnConsumer = 'chat_runtime'

export interface MainAgentTurnSnapshot {
  id: number
  eventId: string
  sessionId: string
  consumer: MainAgentTurnConsumer
  status: MainAgentTurnStatus
  reversible: boolean
  userMessageId?: number
  aiMessageId?: number
  userPreview?: string
  aiPreview?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  interruptedAt?: string
  revertedAt?: string
  errorMessage?: string
}
