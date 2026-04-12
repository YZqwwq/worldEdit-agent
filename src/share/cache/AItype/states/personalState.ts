// 人格指标：数值引擎层，用于行为控制与平滑演化
export interface PersonaMetrics {
  // 自主性：0(完全询问) -> 1(完全自主)
  autonomy_level: number
  // 冗长度：0(只给代码/结论) -> 1(详细长文)
  verbosity_index: number
  // 风险偏好：0(保守) -> 1(高风险探索)
  risk_tolerance: number
  // 正式度：0(随意简短) -> 1(礼貌正式)
  formality_score: number
}

export interface PersonaMetricDelta {
  autonomy_level: number
  verbosity_index: number
  risk_tolerance: number
  formality_score: number
}

// 近期信号：对用户反馈的结构化记录
export interface PersonaBufferItem {
  // 发生轮次
  turn: number
  // 用户信号标签
  user_signal: string
  // 对指标的影响描述（可被演化逻辑解析）
  impact: string
}

// 人格状态：数值引擎 + 语义表现 + 近期信号
export interface PersonaState {
  // 人格/会话标识
  persona_id: string
  // 最近更新时间（ISO）
  last_updated: string
  // 稳定偏好层：长期慢变量
  stable_preferences: PersonaMetrics
  // 会话激素层：中期波动
  session_hormones: PersonaMetricDelta
  // 瞬时状态层：短期快变量
  transient_state: PersonaMetricDelta
  // 数值引擎层
  metrics: PersonaMetrics
  // 语义表现层：用于直接注入 Prompt
  current_behavioral_narrative: string
  // 近期信号缓冲
  recent_interaction_buffer: PersonaBufferItem[]
  // 已处理到的 observation 游标
  last_observation_id: number
  // 演化轮次
  evolution_turn: number
}
