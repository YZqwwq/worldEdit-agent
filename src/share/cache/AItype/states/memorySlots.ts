import type { WorldEntityType } from '../../worldbuilding/worldbuilding'

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

export type WorldFocusStatus = 'none' | 'candidate' | 'resolved' | 'ambiguous'

export interface WorldFocusSlot {
  worldId?: string
  worldName?: string
  focusType?: WorldEntityType
  entityId?: string
  entityName?: string
  confidence: number
  status: WorldFocusStatus
  updatedAt?: string
}

export interface MemorySlotSnapshot {
  conversation_state: ConversationStateSlot // 对话状态
  user_mood: UserMoodSlot // 用户情绪
  world_focus: WorldFocusSlot // 当前世界观聚焦对象
  lastObservationId: number // 最后一次观察ID
}

export const describeConversationMode = (value?: ConversationMode): string => {
  switch (value) {
    case 'daily_life':
      return '日常交流'
    case 'practical_support':
      return '现实协助'
    case 'worldbuilding':
      return '世界共创'
    case 'knowledge_query':
      return '知识探讨'
    case 'relational_intimacy':
      return '关系靠近'
    default:
      return '未识别'
  }
}

export const describeInteractionState = (value?: InteractionState): string => {
  switch (value) {
    case 'casual_chat':
      return '闲聊'
    case 'emotional_sharing':
      return '情绪倾诉'
    case 'working':
      return '任务推进'
    case 'teasing':
      return '打趣调侃'
    case 'deep_talk':
      return '深度谈话'
    default:
      return '未识别'
  }
}

export const describeUserMoodState = (value?: UserMoodState): string => {
  switch (value) {
    case 'calm':
      return '平静'
    case 'positive':
      return '积极'
    case 'impatient':
      return '急切'
    case 'frustrated':
      return '受挫'
    case 'uncertain':
      return '犹疑'
    default:
      return '未识别'
  }
}

export const describeWorldFocusType = (value?: WorldEntityType): string => {
  switch (value) {
    case 'character':
      return '人物'
    case 'race':
      return '种族'
    case 'faction':
      return '势力'
    case 'nation':
      return '国家'
    case 'city':
      return '城市'
    case 'region':
      return '地区'
    case 'map':
      return '地图'
    case 'map_location':
      return '地图地点'
    case 'event':
      return '事件'
    case 'item':
      return '物品'
    case 'rule':
      return '规则'
    case 'custom':
      return '自定义对象'
    default:
      return '未聚焦'
  }
}
