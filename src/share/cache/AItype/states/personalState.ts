// 人格指标：数值引擎层，用于行为控制与平滑演化
// 用户希望与 Agent 如何协作。它不是 Self Core，也不代表人格价值。
export interface InteractionPreference {
  // 用户授权倾向：0(更常询问) -> 1(更常委托)
  autonomy_level: number
  // 回应展开程度：0(简短) -> 1(详细)
  verbosity_index: number
  // 表达正式度：0(自然口语) -> 1(正式)
  formality_score: number
}

// 供本轮行动策略使用的慢速操作倾向，不属于稳定人格。
export interface OperationalBaseline {
  risk_tolerance: number
}

// 编译后的兼容指标：只作为本轮策略和表达 Prompt 的输入，不作为人格存储层。
export interface PersonaMetrics extends InteractionPreference {
  risk_tolerance: number
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
  // 用户协作偏好：可适配，但不改变 Self Core
  interaction_preferences: InteractionPreference
  // 操作策略的慢速基线：不注入人格锚点
  operational_baseline: OperationalBaseline
  // 会话激素层：中期波动
  session_hormones: PersonaMetricDelta
  // 瞬时状态层：短期快变量
  transient_state: PersonaMetricDelta
  // 数值引擎层
  metrics: PersonaMetrics
  // 近期信号缓冲
  recent_interaction_buffer: PersonaBufferItem[]
  // 已处理到的 observation 游标
  last_observation_id: number
  // 演化轮次
  evolution_turn: number
}
