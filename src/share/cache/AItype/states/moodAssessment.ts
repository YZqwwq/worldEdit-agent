export type StageMood = 'flat' | 'pleased' | 'excited' | 'tense' | 'frustrated' | 'fearful'
export type MoodHorizon = 'transient' | 'session'

export interface MoodParameterDelta {
  autonomy: number  // 自主性
  verbosity: number  // 冗长性
  risk: number  // 风险性
  formality: number  // 正式性
}

export interface MoodModulationProfile {
  relationalCloseness: number  // 关系亲近度
  expressiveWarmth: number  // 表达温暖度
  containment: number  // 包容度
  imaginativeOpenness: number  // 想象力开放度
  clarificationNeed: number  // 清晰度
}

export interface MoodAssessmentSources {
  userMood?: string  // 用户情绪
  conversationMode?: string  // 对话模式
  interactionState?: string  // 交互性
  signals: string[]  // 信号
}

export interface MoodAssessment {
  generatedAt: string  // 生成时间
  stageMood: StageMood  // 阶段情绪
  intensity: number  // 强度
  confidence: number  // 信心
  valence: number  // 积极性
  arousal: number  // 唤醒度
  horizon: MoodHorizon  // 时间范围
  behavioralNarrative: string  // 行为叙事
  delta: MoodParameterDelta  // 变化量
  modulation: MoodModulationProfile  // 调节
  sources: MoodAssessmentSources  // 来源
}
