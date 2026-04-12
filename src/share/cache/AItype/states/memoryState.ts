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
    // 距离上次归档的轮次
    since_last_archive: number
  }
  // 最近一次归档时间（ISO）
  last_archive_time: string
  // 归档策略标识
  archive_strategy: string
  // API 健康状态（healthy/down/skipped）
  api_status: string
  // 锚点：必须注入的系统提示
  anchors?: string[]
  // 触发归档的轮次阈值
  archive_threshold?: number
  // 两次归档之间的最小间隔（毫秒）
  archive_min_interval_ms?: number
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
  // 全局消息序号
  sequence?: number
  // 是否已压缩
  compressed?: boolean
  // 压缩时间（ISO）
  compressed_at?: string
}

export interface MemoryLongTermSnapshot {
  memorySummary: string
  userProfile: string
  updatedAt: string
}

export type MemoryStageStatus = 'completed' | 'fallback'

export interface MemoryStageSnapshot {
  id: number
  stageIndex: number
  status: MemoryStageStatus
  triggerKind: string
  messageCount: number
  startSequence: number
  endSequence: number
  startedAt: string
  endedAt: string
  summary: string
  moodLabel?: string
}

export interface MemoryArchiveStatus {
  bufferMessageCount: number
  lastStageIndex: number
  lastArchivedAt: string
  apiStatus: string
}

// 记忆快照：用于注入上下文
export interface MemorySnapshot {
  // 锚点集合
  anchors: string[]
  // 短期窗口消息
  shortTerm: MessageData[]
  // 长期稳定记忆
  longTerm: MemoryLongTermSnapshot
  // 最近阶段记忆
  recentStages: MemoryStageSnapshot[]
  // 归档状态
  archiveStatus: MemoryArchiveStatus
}
