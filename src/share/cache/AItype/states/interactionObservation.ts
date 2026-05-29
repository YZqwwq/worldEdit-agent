export type InteractionObservationType =
  | 'user_message'
  | 'user_interrupt'
  | 'user_revert'
  | 'task_completed'
  | 'task_failed'
  | 'task_needs_input'
  | 'task_cancelled'
  | 'background_persona_stage_completed'
  | 'background_persona_stage_failed'

export type InteractionObservationSource =
  | 'user'
  | 'main_agent'
  | 'task_queue'
  | 'background_persona'
  | 'system'

export interface InteractionObservationSnapshot {
  id: number
  type: InteractionObservationType
  source: InteractionObservationSource
  summary?: string
  payload: Record<string, unknown>
  createdAt: string
}
