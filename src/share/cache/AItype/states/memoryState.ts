// 记忆状态：用于短期窗口、压缩策略与锚点管理
export interface StateData {
  // 会话标识
  session_id: string
  // 创建时间（ISO）
  created_at: string
  // 计数器集合
  counters: {
    // 总轮次
    total_turns: number
    // 窗口内轮次
    window_turns: number
    // 距离上次压缩的轮次
    since_last_compress: number
  }
  // 最近一次压缩时间（ISO）
  last_compress_time: string
  // 压缩策略标识（例如 time_based）
  compress_strategy: string
  // API 健康状态（healthy/down/skipped）
  api_status: string
  // 锚点：必须注入的系统提示
  anchors?: string[]
  // 触发压缩的轮次阈值
  compress_threshold?: number
  // 最小压缩间隔（毫秒）
  compress_min_interval_ms?: number
  // 短期窗口大小
  short_term_limit?: number
}

// 消息条目：用于短期记忆与压缩归档
export interface MessageData {
  // 角色（user/ai）
  role: string
  // 内容
  content: string
  // 时间戳（ISO）
  timestamp: string
  // 是否已压缩
  compressed?: boolean
  // 压缩时间（ISO）
  compressed_at?: string
}

// 记忆快照：用于注入上下文
export interface MemorySnapshot {
  // 锚点集合
  anchors: string[]
  // 压缩摘要文本
  summary: string
  // 短期窗口消息
  shortTerm: MessageData[]
}
