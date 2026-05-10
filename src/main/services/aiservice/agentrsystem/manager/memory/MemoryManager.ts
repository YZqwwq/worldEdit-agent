import type { EntityManager } from 'typeorm'
import { AppDataSource } from '../../../../../database'
import {
  type StateData,
  type MessageData,
  type MemorySnapshot,
  type MemoryLongTermSnapshot,
  type MemoryStageSnapshot
} from '@share/cache/AItype/states/memoryState'
import { MemoryStateRecord } from '../../../../../../share/entity/database/MemoryStateRecord'
import { MemoryEntry } from '../../../../../../share/entity/database/MemoryEntry'
import { memorySlotService } from './memorySlotService'
import { memoryStageService } from './memoryStageService'
import { summarizeMemoryStage } from './memoryArchiveService'
import {
  createDefaultLongTermMemory,
  mergeStageIntoLongTermMemory,
  parseLongTermMemory
} from './longTermMemoryService'

const MEMORY_STATE_ROW_ID = 1
const SHORT_TERM_RECENT_TWO_ROUNDS_LIMIT = 4

const defaultState = (): StateData => ({
  session_id: 'default',
  created_at: new Date().toISOString(),
  counters: { total_turns: 0, window_turns: 0, since_last_archive: 0 },
  last_archive_time: '',
  archive_strategy: 'stage_based',
  api_status: 'healthy',
  anchors: [],
  archive_threshold: 6,
  archive_min_interval_ms: 0,
  short_term_limit: SHORT_TERM_RECENT_TWO_ROUNDS_LIMIT
})

export type MemoryCheckpoint = {
  state: StateData
  shortTerm: MessageData[]
  longTerm: MemoryLongTermSnapshot
  archiveBuffer: MessageData[]
  lastStageIndex: number
  lastArchivedAt: string
}

export class MemoryManager {
  private state: StateData = defaultState()
  private shortTerm: MessageData[] = []
  private longTerm: MemoryLongTermSnapshot = createDefaultLongTermMemory()
  private archiveBuffer: MessageData[] = []
  private lastStageIndex = 0
  private lastArchivedAt = ''
  private initialized = false
  private initPromise: Promise<void> | null = null
  private operationQueue: Promise<void> = Promise.resolve()

  private get stateRepo() {
    return AppDataSource.getRepository(MemoryStateRecord)
  }

  private get entryRepo() {
    return AppDataSource.getRepository(MemoryEntry)
  }

  private async saveStateWithManager(manager: EntityManager): Promise<void> {
    const stateRepo = manager.getRepository(MemoryStateRecord)
    let row = await stateRepo.findOneBy({ id: MEMORY_STATE_ROW_ID })
    if (!row) {
      row = stateRepo.create({ id: MEMORY_STATE_ROW_ID })
    }
    row.sessionId = this.state.session_id
    row.createdAtIso = this.state.created_at
    row.totalTurns = this.state.counters.total_turns
    row.windowTurns = this.state.counters.window_turns
    row.sinceLastArchive = this.state.counters.since_last_archive
    row.lastArchiveTime = this.state.last_archive_time
    row.archiveStrategy = this.state.archive_strategy
    row.apiStatus = this.state.api_status
    row.anchorsJson = JSON.stringify(this.state.anchors ?? [])
    row.archiveThreshold = this.state.archive_threshold ?? 6
    row.archiveMinIntervalMs = this.state.archive_min_interval_ms ?? 0
    row.shortTermLimit = this.state.short_term_limit ?? SHORT_TERM_RECENT_TWO_ROUNDS_LIMIT
    row.longTermJson = JSON.stringify(this.longTerm)
    row.archiveBufferJson = JSON.stringify(this.archiveBuffer)
    row.lastStageIndex = this.lastStageIndex
    row.lastArchivedAtIso = this.lastArchivedAt
    await stateRepo.save(row)
  }

  private async saveShortTermWithManager(manager: EntityManager): Promise<void> {
    const entryRepo = manager.getRepository(MemoryEntry)
    await entryRepo.clear()
    if (!this.shortTerm.length) return
    const rows = this.shortTerm.map((msg) =>
      entryRepo.create({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        sequence: msg.sequence ?? 0,
        compressed: Boolean(msg.compressed),
        compressedAt: msg.compressed_at || ''
      })
    )
    await entryRepo.save(rows)
  }

  private async persistMemoryState(input?: {
    stageToCreate?: Parameters<typeof memoryStageService.create>[0]
    deleteStagesAfterIndex?: number
  }): Promise<MemoryStageSnapshot | null> {
    return AppDataSource.transaction(async (manager) => {
      if (typeof input?.deleteStagesAfterIndex === 'number') {
        await memoryStageService.deleteAfterStageIndex(
          this.state.session_id,
          input.deleteStagesAfterIndex,
          manager
        )
      }

      let createdStage: MemoryStageSnapshot | null = null
      if (input?.stageToCreate) {
        createdStage = await memoryStageService.create(input.stageToCreate, manager)
      }

      await this.saveShortTermWithManager(manager)
      await this.saveStateWithManager(manager)
      return createdStage
    })
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
    if (this.state.archive_threshold == null) this.state.archive_threshold = 6
    if (this.state.archive_min_interval_ms == null) this.state.archive_min_interval_ms = 0
    if (this.state.short_term_limit == null) {
      this.state.short_term_limit = SHORT_TERM_RECENT_TWO_ROUNDS_LIMIT
    }
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
        since_last_archive: row.sinceLastArchive || 0
      },
      last_archive_time: row.lastArchiveTime || '',
      archive_strategy: row.archiveStrategy || 'stage_based',
      api_status: row.apiStatus || 'healthy',
      anchors: this.parseAnchors(row.anchorsJson || '[]'),
      archive_threshold: row.archiveThreshold ?? 6,
      archive_min_interval_ms: row.archiveMinIntervalMs ?? 0,
      short_term_limit: row.shortTermLimit ?? SHORT_TERM_RECENT_TWO_ROUNDS_LIMIT
    }
  }

  private async loadFromDatabase(): Promise<void> {
    const existingState = await this.stateRepo.findOneBy({ id: MEMORY_STATE_ROW_ID })
    if (existingState) {
      this.state = this.mapRowToState(existingState)
      this.longTerm = this.hydrateLongTerm(existingState)
      this.archiveBuffer = this.parseMessageList(existingState.archiveBufferJson || '[]')
      this.lastStageIndex = existingState.lastStageIndex || 0
      this.lastArchivedAt = existingState.lastArchivedAtIso || ''
      const entries = await this.entryRepo.find({ order: { id: 'ASC' } })
      this.shortTerm = entries.map((entry) => ({
        role: entry.role,
        content: entry.content,
        timestamp: entry.timestamp,
        sequence: entry.sequence || undefined,
        compressed: entry.compressed,
        compressed_at: entry.compressedAt || undefined
      }))
      this.normalizeState()
      this.initialized = true
      return
    }

    this.state = defaultState()
    this.shortTerm = []
    this.longTerm = createDefaultLongTermMemory()
    this.archiveBuffer = []
    this.lastStageIndex = 0
    this.lastArchivedAt = ''
    this.normalizeState()
    await this.persistMemoryState()
    this.initialized = true
  }

  private parseMessageList(input: string): MessageData[] {
    try {
      const parsed = JSON.parse(input)
      return Array.isArray(parsed)
        ? parsed
            .filter((item) => item && typeof item === "object")
            .map((item) => ({
              role: typeof item.role === 'string' ? item.role : 'user',
              content: typeof item.content === 'string' ? item.content : '',
              timestamp: typeof item.timestamp === 'string' ? item.timestamp : new Date().toISOString(),
              sequence:
                typeof item.sequence === 'number' && Number.isFinite(item.sequence)
                  ? Math.max(0, Math.round(item.sequence))
                  : undefined,
              compressed: Boolean(item.compressed),
              compressed_at: typeof item.compressed_at === 'string' ? item.compressed_at : undefined
            }))
            .filter((item) => item.content)
        : []
    } catch {
      return []
    }
  }

  private hydrateLongTerm(row: MemoryStateRecord): MemoryLongTermSnapshot {
    const parsed = parseLongTermMemory(row.longTermJson || '{}')
    return parsed
  }

  private shouldArchiveNow(role: 'user' | 'ai'): boolean {
    const threshold = this.state.archive_threshold ?? 6
    if (role !== 'ai') return false
    return this.archiveBuffer.length >= threshold
  }

  private async archiveBufferedMessages(triggerKind: string): Promise<void> {
    if (!this.archiveBuffer.length) return

    const messages = this.archiveBuffer.map((item) => ({ ...item }))
    const slots = await memorySlotService.reconcileFromObservations()
    const startedAt = messages[0]?.timestamp || new Date().toISOString()
    const endedAt = messages[messages.length - 1]?.timestamp || startedAt
    const stageIndex = this.lastStageIndex + 1
    const stageSummary = await summarizeMemoryStage(messages, slots)

    for (const message of messages) {
      message.compressed = true
      message.compressed_at = endedAt
    }

    const stageDraft: MemoryStageSnapshot = {
      id: 0,
      stageIndex,
      status: stageSummary.status,
      triggerKind,
      messageCount: messages.length,
      startSequence: messages[0]?.sequence ?? 0,
      endSequence: messages[messages.length - 1]?.sequence ?? 0,
      startedAt,
      endedAt,
      summary: stageSummary.summary,
      moodLabel: stageSummary.moodLabel
    }

    this.longTerm = mergeStageIntoLongTermMemory(this.longTerm, stageDraft, slots)
    this.archiveBuffer = []
    this.lastStageIndex = stageIndex
    this.lastArchivedAt = endedAt
    this.state.counters.since_last_archive = 0
    this.state.last_archive_time = this.lastArchivedAt
    this.state.api_status = stageSummary.status === 'completed' ? 'healthy' : 'down'

    const stage = await this.persistMemoryState({
      stageToCreate: {
        sessionId: this.state.session_id,
        stageIndex,
        status: stageSummary.status,
        triggerKind,
        messageCount: messages.length,
        startSequence: messages[0]?.sequence ?? 0,
        endSequence: messages[messages.length - 1]?.sequence ?? 0,
        startedAt,
        endedAt,
        summary: stageSummary.summary,
        moodLabel: stageSummary.moodLabel
      }
    })

    if (stage) {
      this.lastStageIndex = stage.stageIndex
      this.lastArchivedAt = stage.endedAt || endedAt
    }
  }

  // 获取内存快照
  public async getSnapshot(): Promise<MemorySnapshot> {
    await this.initialize()
    return this.withLock(async () => {
      const recentStages = await memoryStageService.listRecent(this.state.session_id, 5)
      return {
        anchors: this.state.anchors ? [...this.state.anchors] : [],
        shortTerm: this.shortTerm.map((msg) => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          sequence: msg.sequence,
          compressed: msg.compressed,
          compressed_at: msg.compressed_at
        })),
        longTerm: {
          ...this.longTerm
        },
        recentStages,
        archiveStatus: {
          bufferMessageCount: this.archiveBuffer.length,
          lastStageIndex: this.lastStageIndex,
          lastArchivedAt: this.lastArchivedAt,
          apiStatus: this.state.api_status
        }
      }
    })
  }

  public async getCheckpoint(): Promise<MemoryCheckpoint> {
    await this.initialize()
    return this.withLock(async () => ({
      state: JSON.parse(JSON.stringify(this.state)) as StateData,
      longTerm: JSON.parse(JSON.stringify(this.longTerm)) as MemoryLongTermSnapshot,
      archiveBuffer: this.archiveBuffer.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        sequence: msg.sequence,
        compressed: msg.compressed,
        compressed_at: msg.compressed_at
      })),
      lastStageIndex: this.lastStageIndex,
      lastArchivedAt: this.lastArchivedAt,
      shortTerm: this.shortTerm.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        sequence: msg.sequence,
        compressed: msg.compressed,
        compressed_at: msg.compressed_at
      }))
    }))
  }

  public async restoreCheckpoint(checkpoint: MemoryCheckpoint): Promise<void> {
    await this.initialize()
    await this.withLock(async () => {
      this.state = JSON.parse(JSON.stringify(checkpoint.state)) as StateData
      this.longTerm = JSON.parse(JSON.stringify(checkpoint.longTerm)) as MemoryLongTermSnapshot
      this.archiveBuffer = checkpoint.archiveBuffer.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        sequence: msg.sequence,
        compressed: msg.compressed,
        compressed_at: msg.compressed_at
      }))
      this.lastStageIndex = checkpoint.lastStageIndex
      this.lastArchivedAt = checkpoint.lastArchivedAt
      this.shortTerm = checkpoint.shortTerm.map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        sequence: msg.sequence,
        compressed: msg.compressed,
        compressed_at: msg.compressed_at
      }))
      this.normalizeState()
      await this.persistMemoryState({ deleteStagesAfterIndex: checkpoint.lastStageIndex })
    })
  }

  // 添加消息
  public async addMessage(role: 'user' | 'ai', content: string) {
    await this.initialize()
    await this.withLock(async () => {
      const nextSequence = (this.state.counters.total_turns || 0) + 1
      const msg: MessageData = {
        role,
        content,
        timestamp: new Date().toISOString(),
        sequence: nextSequence
      }

      // 简单去重：避免连续添加相同内容
      const lastMsg = this.shortTerm[this.shortTerm.length - 1]
      if (lastMsg && lastMsg.role === role && lastMsg.content === content) {
        return
      }

      this.shortTerm.push(msg)
      this.state.counters.window_turns = this.shortTerm.length
      this.state.counters.total_turns = nextSequence
      this.state.counters.since_last_archive++

      const limit = this.state.short_term_limit ?? SHORT_TERM_RECENT_TWO_ROUNDS_LIMIT
      if (this.shortTerm.length > limit) {
        const overflowCount = this.shortTerm.length - limit
        const overflow = this.shortTerm.splice(0, overflowCount)
        this.archiveBuffer.push(
          ...overflow.map((item) => ({
            role: item.role,
            content: item.content,
            timestamp: item.timestamp,
            sequence: item.sequence,
            compressed: false
          }))
        )
      }

      if (this.shouldArchiveNow(role)) {
        await this.archiveBufferedMessages('window_overflow')
      } else {
        await this.persistMemoryState()
      }
    })
  }

  // 重置存储
  public async resetStorage(): Promise<void> {
    await this.initialize()
    await this.withLock(async () => {
      this.shortTerm = []
      this.archiveBuffer = []
      this.longTerm = createDefaultLongTermMemory()
      this.lastStageIndex = 0
      this.lastArchivedAt = ''
      this.state = defaultState()
      await this.persistMemoryState({ deleteStagesAfterIndex: 0 })
    })
  }

  public async applyAdaptiveConfig(input: {
    archiveThreshold?: number
    shortTermLimit?: number
  }): Promise<void> {
    await this.initialize()
    await this.withLock(async () => {
      const threshold = input.archiveThreshold
      const shortTermLimit = input.shortTermLimit
      let changed = false

      if (Number.isFinite(threshold)) {
        const normalized = Math.max(2, Math.min(20, Math.round(Number(threshold))))
        if (this.state.archive_threshold !== normalized) {
          this.state.archive_threshold = normalized
          changed = true
        }
      }

      if (Number.isFinite(shortTermLimit)) {
        const normalized = SHORT_TERM_RECENT_TWO_ROUNDS_LIMIT
        if (this.state.short_term_limit !== normalized) {
          this.state.short_term_limit = normalized
          changed = true
        }
        if (this.shortTerm.length > normalized) {
          const overflowCount = this.shortTerm.length - normalized
          const overflow = this.shortTerm.splice(0, overflowCount)
          this.archiveBuffer.push(
            ...overflow.map((item) => ({
              role: item.role,
              content: item.content,
              timestamp: item.timestamp,
              sequence: item.sequence,
              compressed: false
            }))
          )
          this.state.counters.window_turns = this.shortTerm.length
          changed = true
        }
      }

      if (changed) {
        await this.persistMemoryState()
      }
    })
  }
}

export const memoryManager = new MemoryManager()
