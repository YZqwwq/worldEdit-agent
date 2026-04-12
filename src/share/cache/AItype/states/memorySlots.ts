export type UserMoodState = 'calm' | 'positive' | 'impatient' | 'frustrated' | 'uncertain'
export type ConversationMode = 'casual' | 'work' | 'companion' | 'co_creation' | 'q_and_a'
export type InteractionState =
  | 'catching_up'
  | 'listening'
  | 'reflecting'
  | 'problem_solving'
  | 'brainstorming'

export interface ConversationStateSlot {
  conversation_mode?: ConversationMode
  interaction_state?: InteractionState
  updatedAt?: string
}

export interface UserMoodSlot {
  current_mood?: UserMoodState
  valence?: number
  confidence: number
  updatedAt?: string
  expiresAfterObservationId?: number
}

export interface MemorySlotSnapshot {
  conversation_state: ConversationStateSlot
  user_mood: UserMoodSlot
  lastObservationId: number
}
