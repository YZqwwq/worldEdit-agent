export const MAIN_AGENT_EVENT_STATUS_VALUES = [
  'queued',
  'processing',
  'completed',
  'failed'
] as const

export type MainAgentEventStatus = (typeof MAIN_AGENT_EVENT_STATUS_VALUES)[number]
