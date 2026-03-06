import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs'
import { join } from 'path'
import { SystemMessage } from '@langchain/core/messages'
import { quickModel } from '../modelwithtool/quick-base-model'
import { contentToText } from '../../messageoutput/transformRespones'
import { type StateData, type MessageData, type MemorySnapshot } from '@share/cache/AItype/states/memoryState'

// 路径配置
const RESOURCE_PATH = join(
  process.cwd(),
  'src/main/prompt-resource/famila-daily/historyprompt/recent-history'
)
const STATE_FILE = join(RESOURCE_PATH, 'state.json')
const SHORT_TERM_FILE = join(RESOURCE_PATH, 'short_term.json')
const RAW_FILE = join(RESOURCE_PATH, 'history_raw.md')

export class MemoryManager {
  private state!: StateData // Add definite assignment assertion
  private shortTerm: MessageData[] = []
  private compressing = false

  constructor() {
    this.loadState()
    this.loadShortTerm()
  }

  // 加载状态文件
  private loadState() {
    try {
      if (existsSync(STATE_FILE)) {
        const data = readFileSync(STATE_FILE, 'utf-8')
        this.state = JSON.parse(data)
        this.normalizeState()
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
        anchors: [],
        compress_threshold: 6,
        compress_min_interval_ms: 0,
        short_term_limit: 6
      }
    }
  }

  // 保存状态文件
  private saveState() {
    try {
      const { anchors, ...rest } = this.state
      const data = anchors && anchors.length > 0 ? this.state : rest
      writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf-8')
    } catch (e) {
      console.error('Failed to save state:', e)
    }
  }

  // 加载短期记忆文件
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

  // 保存短期记忆文件
  private saveShortTerm() {
    try {
      writeFileSync(SHORT_TERM_FILE, JSON.stringify(this.shortTerm, null, 2), 'utf-8')
    } catch (e) {
      console.error('Failed to save short term memory:', e)
    }
  }

  // 归一化状态字段
  private normalizeState() {
    if (this.state.compress_threshold == null) this.state.compress_threshold = 6
    if (this.state.compress_min_interval_ms == null) this.state.compress_min_interval_ms = 0
    if (this.state.short_term_limit == null) this.state.short_term_limit = 6
  }

  // 判断是否可以使用AI压缩
  private canUseAi(now: number): boolean {
    const threshold = this.state.compress_threshold ?? 6
    if ((this.state.counters?.since_last_compress ?? 0) < threshold) return false
    if (this.state.compress_strategy === 'time_based') {
      const last = this.state.last_compress_time ? Date.parse(this.state.last_compress_time) : 0
      const minInterval = this.state.compress_min_interval_ms ?? 0
      if (last && minInterval > 0 && now - last < minInterval) return false
    }
    return true
  }

  // 构建摘要提示
  private buildSummaryPrompt(summaryInput: string, currentContent: string): string {
    return `
你是一个专业的对话历史归档员。你的任务是将新的对话内容合并到现有的历史档案中。

## 现有档案 (history_raw.md)
${currentContent || '(空)'}

## 最近对话记录 (需归档)
${summaryInput}

## 任务要求
1. 请更新并输出新的 Markdown 档案内容。
2. 保持结构清晰，建议包含 "当前上下文" 和 "关键对话摘要" 两个部分。
3. "当前上下文"：更新当前的任务状态、用户偏好、已知信息。
4. "关键对话摘要"：提炼有价值的对话点，忽略寒暄和无意义的对话。
5. 不要输出任何解释性文字，只输出 Markdown 内容。
`
  }
  // 追加原始消息到文件
  private appendRawMessages(messages: MessageData[]) {
    for (const msg of messages) {
      const rawEntry = `\n### RAW_FALLBACK [${msg.timestamp}] ${msg.role.toUpperCase()}\n${msg.content}\n`
      appendFileSync(RAW_FILE, rawEntry, 'utf-8')
    }
  }

  // 读取摘要文件内容
  private readSummary(): string {
    if (!existsSync(RAW_FILE)) return ''
    return readFileSync(RAW_FILE, 'utf-8')
  }
  // 执行压缩
  private async performCompression(messages: MessageData[]) {
    const historyContent = this.readSummary()
    const summaryInput = messages.map(m => `${m.role}: ${m.content}`).join('\n')
    if (!summaryInput) return
    const prompt = this.buildSummaryPrompt(summaryInput, historyContent)
    const response = await quickModel.invoke([new SystemMessage(prompt)])
    const summary = contentToText(response.content)
    if (!summary) {
      throw new Error('Empty summary')
    }
    writeFileSync(RAW_FILE, summary, 'utf-8')
  }

  // 合并消息
  private async mergeMessages(messages: MessageData[], allowAi: boolean) {
    if (messages.length === 0) return
    if (this.compressing) return
    this.compressing = true
    const nowIso = new Date().toISOString()
    try {
      if (!allowAi) {
        throw new Error('skip_ai')
      }
      await this.performCompression(messages)
      for (const msg of messages) {
        msg.compressed = true
        msg.compressed_at = nowIso
      }
      this.state.counters.since_last_compress = 0
      this.state.last_compress_time = nowIso
      this.state.api_status = 'healthy'
    } catch {
      this.appendRawMessages(messages)
      for (const msg of messages) {
        msg.compressed = true
        msg.compressed_at = nowIso
      }
      this.state.counters.since_last_compress = 0
      this.state.last_compress_time = nowIso
      this.state.api_status = allowAi ? 'down' : 'skipped'
    } finally {
      this.saveShortTerm()
      this.saveState()
      this.compressing = false
    }
  }

  // 合并溢出消息
  private async mergeOverflow(messages: MessageData[]) {
    const now = Date.now()
    const allowAi = this.canUseAi(now)
    await this.mergeMessages(messages, allowAi)
  }

  // 获取内存快照
  public getSnapshot(): MemorySnapshot {
    return {
      anchors: this.state.anchors ? [...this.state.anchors] : [],
      summary: this.readSummary(),
      shortTerm: this.shortTerm.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        compressed: msg.compressed,
        compressed_at: msg.compressed_at
      }))
    }
  }
  // 添加消息
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
    this.state.counters.since_last_compress++

    const limit = this.state.short_term_limit ?? 6
    if (this.shortTerm.length > limit) {
      const overflowCount = this.shortTerm.length - limit
      const overflow = this.shortTerm.splice(0, overflowCount)
      void this.mergeOverflow(overflow)
    }

    this.saveShortTerm()
    this.saveState()
  }
  // 重置存储
  public resetStorage(): void {
    this.shortTerm = []
    this.state = {
      session_id: 'sess_default',
      created_at: '',
      counters: { total_turns: 0, window_turns: 0, since_last_compress: 0 },
      last_compress_time: '',
      compress_strategy: 'time_based',
      api_status: 'healthy',
      anchors: [],
      compress_threshold: 6,
      compress_min_interval_ms: 0,
      short_term_limit: 6
    }
    this.saveShortTerm()
    this.saveState()
    writeFileSync(RAW_FILE, '', 'utf-8')
  }
}

export const memoryManager = new MemoryManager()
