import type { MoodAssessment, UserMoodState } from './moodAssessment'

export type { UserMoodState } from './moodAssessment'

export interface UserMoodSlot {
  current_mood?: UserMoodState // 当前情绪
  valence?: number // 积极性
  confidence: number // 对agent的信心
  updatedAt?: string // 更新时间
  expiresAfterObservationId?: number // 过期时间
}

// AiMoodSlot: AI 侧阶段情绪，是 Agent 运行中的动态状态。
// 它由 personaNode 每轮覆盖写入，用于延续本轮/近轮表达调制，不属于长期记忆。
export interface AiMoodSlot {
  current?: MoodAssessment
  updatedAt?: string
}

export interface MemorySlotSnapshot {
  user_mood: UserMoodSlot // 用户情绪
  ai_mood: AiMoodSlot // AI 侧阶段情绪：Agent 运行态，每轮由 personaNode 覆盖
  lastObservationId: number // 最后一次观察ID
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
