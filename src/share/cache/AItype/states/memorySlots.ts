export type UserMoodState = 'calm' | 'positive' | 'impatient' | 'frustrated' | 'uncertain'

// ConversationMode: 会话级框架。描述这段对话主要落在哪种关系/任务场域。
export const CONVERSATION_MODES = [
  'daily_life',
  'practical_support',
  'worldbuilding',
  'knowledge_query',
  'relational_intimacy'
] as const
export type ConversationMode = (typeof CONVERSATION_MODES)[number]

// InteractionState: 回合级姿态。描述用户此刻更希望我们以怎样的方式接住这轮对话。
export const INTERACTION_STATES = [
  'casual_chat',
  'emotional_sharing',
  'working',
  'teasing',
  'deep_talk'
] as const
export type InteractionState = (typeof INTERACTION_STATES)[number]

export const isConversationMode = (value: unknown): value is ConversationMode =>
  typeof value === 'string' && CONVERSATION_MODES.includes(value as ConversationMode)

export const isInteractionState = (value: unknown): value is InteractionState =>
  typeof value === 'string' && INTERACTION_STATES.includes(value as InteractionState)

export interface ConversationStateSlot {
  conversation_mode?: ConversationMode // 对话模式
  interaction_state?: InteractionState // 当前关系性交谈状态
  updatedAt?: string // 更新时间
}

export interface UserMoodSlot {
  current_mood?: UserMoodState // 当前情绪
  valence?: number // 积极性
  confidence: number // 对agent的信心
  updatedAt?: string // 更新时间
  expiresAfterObservationId?: number // 过期时间
}

export interface MemorySlotSnapshot {
  conversation_state: ConversationStateSlot // 对话状态
  user_mood: UserMoodSlot // 用户情绪
  lastObservationId: number // 最后一次观察ID
}
