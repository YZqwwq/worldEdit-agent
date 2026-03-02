import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs'
import { join } from 'path'
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'

// 路径配置
const RESOURCE_PATH = join(
  process.cwd(),
  'src/main/prompt-resource/famila-daily/historyprompt/recent-history'
)
const STATE_FILE = join(RESOURCE_PATH, 'state.json')
const SHORT_TERM_FILE = join(RESOURCE_PATH, 'short_term.json')
const RAW_FILE = join(RESOURCE_PATH, 'history_raw.md')

interface StateData {
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
}

interface MessageData {
  role: string
  content: string
  timestamp: string
}

export class MemoryManager {
  private state!: StateData // Add definite assignment assertion
  private shortTerm: MessageData[] = []

  constructor() {
    this.loadState()
    this.loadShortTerm()
  }

  private loadState() {
    try {
      if (existsSync(STATE_FILE)) {
        const data = readFileSync(STATE_FILE, 'utf-8')
        this.state = JSON.parse(data)
      } else {
        throw new Error('State file not found')
      }
    } catch (e) {
      console.error('Failed to load state:', e)
      // Fallback
      this.state = {
        session_id: 'default',
        created_at: new Date().toISOString(),
        counters: { total_turns: 0, window_turns: 0, since_last_compress: 0 },
        last_compress_time: '',
        compress_strategy: 'time_based',
        api_status: 'healthy',
        anchors: []
      }
    }
  }

  private saveState() {
    try {
      const { anchors, ...rest } = this.state
      const data = anchors && anchors.length > 0 ? this.state : rest
      writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf-8')
    } catch (e) {
      console.error('Failed to save state:', e)
    }
  }

  private loadShortTerm() {
    try {
      if (existsSync(SHORT_TERM_FILE)) {
        const data = readFileSync(SHORT_TERM_FILE, 'utf-8')
        this.shortTerm = JSON.parse(data)
      } else {
        this.shortTerm = []
      }
    } catch (e) {
      this.shortTerm = []
    }
  }

  private saveShortTerm() {
    try {
      writeFileSync(SHORT_TERM_FILE, JSON.stringify(this.shortTerm, null, 2), 'utf-8')
    } catch (e) {
      console.error('Failed to save short term memory:', e)
    }
  }

  public getContext(): BaseMessage[] {
    const messages: BaseMessage[] = []

    // Add Anchors (System Prompt)
    if (this.state.anchors && this.state.anchors.length > 0) {
      const anchorText = this.state.anchors.join('\n')
      // 锚点通常作为 SystemMessage
      messages.push(new SystemMessage(anchorText))
    }

    // Add Short Term History
    for (const msg of this.shortTerm) {
      if (msg.role === 'user') {
        messages.push(new HumanMessage(msg.content))
      } else if (msg.role === 'ai') {
        messages.push(new AIMessage(msg.content))
      }
    }

    return messages
  }

  public async addMessage(role: 'user' | 'ai', content: string) {
    const msg: MessageData = {
      role,
      content,
      timestamp: new Date().toISOString()
    }

    // 简单的去重逻辑：避免连续添加相同内容的消息
    const lastMsg = this.shortTerm[this.shortTerm.length - 1]
    if (lastMsg && lastMsg.role === role && lastMsg.content === content) {
      return
    }

    this.shortTerm.push(msg)
    this.state.counters.window_turns = this.shortTerm.length
    this.state.counters.total_turns++

    // 滑动窗口检查 ( > 20 条)
    if (this.shortTerm.length > 20) {
      const popped = this.shortTerm.shift()
      if (popped) {
        await this.archiveMessage(popped)
      }
    }

    this.saveShortTerm()
    this.saveState()
  }

  public resetStorage(): void {
    this.shortTerm = []
    this.state = {
      session_id: 'sess_default',
      created_at: '',
      counters: { total_turns: 0, window_turns: 0, since_last_compress: 0 },
      last_compress_time: '',
      compress_strategy: 'time_based',
      api_status: 'healthy',
      anchors: []
    }
    this.saveShortTerm()
    this.saveState()
    writeFileSync(RAW_FILE, '', 'utf-8')
  }

  private async archiveMessage(msg: MessageData) {
    // 降级策略：尝试压缩或直接追加
    // 为了 MVP，直接追加 RAW，并在之后尝试压缩
    const rawEntry = `\n### [${msg.timestamp}] ${msg.role.toUpperCase()}\n${msg.content}\n`

    try {
      // 追加到 history_raw.md
      appendFileSync(RAW_FILE, rawEntry, 'utf-8')

      // 更新 compress counter
      this.state.counters.since_last_compress++
      this.state.last_compress_time = new Date().toISOString()

      // 这里可以扩展 API 调用进行摘要
      // 但为了满足“降级写入策略”和“MVP”，我们先保证 RAW 写入成功
    } catch (e) {
      console.error('Failed to archive message:', e)
    }
  }
}

export const memoryManager = new MemoryManager()
