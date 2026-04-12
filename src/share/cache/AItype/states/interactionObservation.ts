export type InteractionObservationType =
  | 'user_message'
  | 'user_interrupt'
  | 'user_revert'
  | 'task_completed'
  | 'task_failed'
  | 'task_needs_input'
  | 'task_cancelled'

export type InteractionObservationSource = 'user' | 'main_agent' | 'task_queue' | 'system'

export interface InteractionObservationSnapshot {
  id: number
  type: InteractionObservationType
  source: InteractionObservationSource
  summary?: string
  payload: Record<string, unknown>
  createdAt: string
}
