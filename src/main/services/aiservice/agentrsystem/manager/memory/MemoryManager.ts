import { existsSync, readFileSync } from 'fs'
import { SystemMessage } from '@langchain/core/messages'
import { AppDataSource } from '../../../../../database'
import { getQuickModel } from '../../modelwithtool/quick-base-model'
import { contentToText } from '../../../messageoutput/transformRespones'
import { type StateData, type MessageData, type MemorySnapshot } from '@share/cache/AItype/states/memoryState'
import { MemoryStateRecord } from '../../../../../../share/entity/database/MemoryStateRecord'
import { MemoryEntry } from '../../../../../../share/entity/database/MemoryEntry'
import { getHistoryStatePath, getShortTermPath, getHistoryRawPath } from '../../../../../config/pathConfig'

const MEMORY_STATE_ROW_ID = 1

const defaultState = (): StateData => ({
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
})

type LegacySnapshot = {
  state: StateData
  shortTerm: MessageData[]
  summary: string
}

export class MemoryManager {
  private state: StateData = defaultState()
  private shortTerm: MessageData[] = []
  private summary = ''
  private compressing = false
  private initialized = false
  private initPromise: Promise<void> | null = null
  private operationQueue: Promise<void> = Promise.resolve()

  private get stateRepo() {
    return AppDataSource.getRepository(MemoryStateRecord)
  }

  private get entryRepo() {
    return AppDataSource.getRepository(MemoryEntry)
  }

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.operationQueue.then(fn, fn)
    this.operationQueue = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return
    if (!this.initPromise) {
      this.initPromise = this.withLock(async () => {
        if (this.initialized) return
        await this.loadFromDatabase()
      })
    }
    await this.initPromise
  }

  private normalizeState(): void {
    if (this.state.compress_threshold == null) this.state.compress_threshold = 6
    if (this.state.compress_min_interval_ms == null) this.state.compress_min_interval_ms = 0
    if (this.state.short_term_limit == null) this.state.short_term_limit = 6
    if (!Array.isArray(this.state.anchors)) this.state.anchors = []
  }

  private parseAnchors(json: string): string[] {
    try {
      const parsed = JSON.parse(json)
      return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []
    } catch {
      return []
    }
  }

  private mapRowToState(row: MemoryStateRecord): StateData {
    return {
      session_id: row.sessionId || 'default',
      created_at: row.createdAtIso || new Date().toISOString(),
      counters: {
        total_turns: row.totalTurns || 0,
        window_turns: row.windowTurns || 0,
        since_last_compress: row.sinceLastCompress || 0
      },
      last_compress_time: row.lastCompressTime || '',
      compress_strategy: row.compressStrategy || 'time_based',
      api_status: row.apiStatus || 'healthy',
      anchors: this.parseAnchors(row.anchorsJson || '[]'),
      compress_threshold: row.compressThreshold ?? 6,
      compress_min_interval_ms: row.compressMinIntervalMs ?? 0,
      short_term_limit: row.shortTermLimit ?? 6
    }
  }

  private async saveState(): Promise<void> {
    let row = await this.stateRepo.findOneBy({ id: MEMORY_STATE_ROW_ID })
    if (!row) {
      row = this.stateRepo.create({ id: MEMORY_STATE_ROW_ID })
    }
    row.sessionId = this.state.session_id
    row.createdAtIso = this.state.created_at
    row.totalTurns = this.state.counters.total_turns
    row.windowTurns = this.state.counters.window_turns
    row.sinceLastCompress = this.state.counters.since_last_compress
    row.lastCompressTime = this.state.last_compress_time
    row.compressStrategy = this.state.compress_strategy
    row.apiStatus = this.state.api_status
    row.anchorsJson = JSON.stringify(this.state.anchors ?? [])
    row.compressThreshold = this.state.compress_threshold ?? 6
    row.compressMinIntervalMs = this.state.compress_min_interval_ms ?? 0
    row.shortTermLimit = this.state.short_term_limit ?? 6
    row.summary = this.summary
    await this.stateRepo.save(row)
  }

  private async saveShortTerm(): Promise<void> {
    await this.entryRepo.clear()
    if (!this.shortTerm.length) return
    const rows = this.shortTerm.map((msg) =>
      this.entryRepo.create({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        compressed: Boolean(msg.compressed),
        compressedAt: msg.compressed_at || ''
      })
    )
    await this.entryRepo.save(rows)
  }

  private loadLegacySnapshot(): LegacySnapshot {
    const state = defaultState()
    const shortTerm: MessageData[] = []
    let summary = ''

    try {
      const statePath = getHistoryStatePath()
      if (existsSync(statePath)) {
        const raw = readFileSync(statePath, 'utf-8')
        const parsed = JSON.parse(raw) as StateData
        if (parsed && parsed.counters) {
          Object.assign(state, parsed)
        }
      }
    } catch {
      // ignore legacy parse failures
    }

    try {
      const shortTermPath = getShortTermPath()
      if (existsSync(shortTermPath)) {
        const raw = readFileSync(shortTermPath, 'utf-8')
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (
              item &&
              typeof item === 'object' &&
              typeof (item as MessageData).role === 'string' &&
              typeof (item as MessageData).content === 'string' &&
              typeof (item as MessageData).timestamp === 'string'
            ) {
              shortTerm.push(item as MessageData)
            }
          }
        }
      }
    } catch {
      // ignore legacy parse failures
    }

    try {
      const rawPath = getHistoryRawPath()
      if (existsSync(rawPath)) {
        summary = readFileSync(rawPath, 'utf-8')
      }
    } catch {
      // ignore legacy parse failures
    }

    return { state, shortTerm, summary }
  }

  private async loadFromDatabase(): Promise<void> {
    const existingState = await this.stateRepo.findOneBy({ id: MEMORY_STATE_ROW_ID })
    if (existingState) {
      this.state = this.mapRowToState(existingState)
      this.summary = existingState.summary || ''
      const entries = await this.entryRepo.find({ order: { id: 'ASC' } })
      this.shortTerm = entries.map((entry) => ({
        role: entry.role,
        content: entry.content,
        timestamp: entry.timestamp,
        compressed: entry.compressed,
        compressed_at: entry.compressedAt || undefined
      }))
      this.normalizeState()
      this.initialized = true
      return
    }

    const legacy = this.loadLegacySnapshot()
    this.state = legacy.state
    this.shortTerm = legacy.shortTerm
    this.summary = legacy.summary
    this.normalizeState()
    await this.saveState()
    await this.saveShortTerm()
    this.initialized = true
  }

  // 判断是否可以使用 AI 压缩
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

  // 追加原始消息到内存摘要（压缩失败兜底）
  private appendRawMessages(messages: MessageData[]) {
    for (const msg of messages) {
      const rawEntry = `\n### RAW_FALLBACK [${msg.timestamp}] ${msg.role.toUpperCase()}\n${msg.content}\n`
      this.summary += rawEntry
    }
  }

  // 执行压缩
  private async performCompression(messages: MessageData[]) {
    const historyContent = this.summary
    const summaryInput = messages.map((m) => `${m.role}: ${m.content}`).join('\n')
    if (!summaryInput) return
    const prompt = this.buildSummaryPrompt(summaryInput, historyContent)
    const quickModel = await getQuickModel()
    const response = await quickModel.invoke([new SystemMessage(prompt)])
    const summary = contentToText(response.content)
    if (!summary) {
      throw new Error('Empty summary')
    }
    this.summary = summary
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
      await this.saveShortTerm()
      await this.saveState()
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
  public async getSnapshot(): Promise<MemorySnapshot> {
    await this.initialize()
    return this.withLock(async () => ({
      anchors: this.state.anchors ? [...this.state.anchors] : [],
      summary: this.summary,
      shortTerm: this.shortTerm.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        compressed: msg.compressed,
        compressed_at: msg.compressed_at
      }))
    }))
  }

  // 添加消息
  public async addMessage(role: 'user' | 'ai', content: string) {
    await this.initialize()
    await this.withLock(async () => {
      const msg: MessageData = {
        role,
        content,
        timestamp: new Date().toISOString()
      }

      // 简单去重：避免连续添加相同内容
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
        // 放入同一串行队列，避免与其它读写并发冲突
        void this.withLock(async () => {
          await this.mergeOverflow(overflow)
        })
      }

      await this.saveShortTerm()
      await this.saveState()
    })
  }

  // 重置存储
  public async resetStorage(): Promise<void> {
    await this.initialize()
    await this.withLock(async () => {
      this.shortTerm = []
      this.summary = ''
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
      await this.saveShortTerm()
      await this.saveState()
    })
  }

  public async replaceSummary(summary: string): Promise<void> {
    await this.initialize()
    await this.withLock(async () => {
      this.summary = summary
      await this.saveState()
    })
  }
}

export const memoryManager = new MemoryManager()
