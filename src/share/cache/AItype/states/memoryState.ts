export interface StateData {
  session_id: string
  created_at: string
  counters: {
    total_turns: number
    window_turns: number
    since_last_compress: number
  }
  last_compress_time: string
  compress_strategy: string
  api_status: string
  anchors?: string[]
  compress_threshold?: number
  compress_min_interval_ms?: number
  short_term_limit?: number
}

export interface MessageData {
  role: string
  content: string
  timestamp: string
  compressed?: boolean
  compressed_at?: string
}

export interface MemorySnapshot {
  anchors: string[]
  summary: string
  shortTerm: MessageData[]
}
