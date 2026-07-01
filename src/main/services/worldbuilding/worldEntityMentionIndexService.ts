import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { Jieba } from '@node-rs/jieba'
import { dict } from '@node-rs/jieba/dict'
import { AppDataSource } from '../../database'
import { WorldRecord } from '../../../share/entity/database/WorldRecord'
import { WorldEntityRecord } from '../../../share/entity/database/WorldEntityRecord'
import {
  WorldEntityManualMentionRecord,
  type WorldEntityManualMentionSource
} from '../../../share/entity/database/WorldEntityManualMentionRecord'
import {
  WorldEntityMentionIndexRecord,
  type WorldEntityMentionKind
} from '../../../share/entity/database/WorldEntityMentionIndexRecord'
import type { WorldEntityType } from '@share/cache/worldbuilding/worldbuilding'

type Bm25Engine = {
  defineConfig(config: Record<string, unknown>): void
  definePrepTasks(tasks: Array<(input: string) => string[]>): void
  addDoc(doc: Record<string, unknown>, id: string): void
  consolidate(): void
  search(query: string, limit?: number): Array<[string, number]>
}

export type WorldEntityMentionSearchInput = {
  query: string
  worldId?: string
  entityType?: WorldEntityType
  limit?: number
  previousFocus?: {
    worldId?: string
    entityId?: string
  }
}

export type WorldEntityMentionSearchCandidate = {
  worldId: string
  worldName: string
  entityId: string
  entityType: WorldEntityType
  entityName: string
  score: number
  rawScore: number
  matchedMentions: string[]
  matchedFields: WorldEntityMentionKind[]
  sourceRecordIds: string[]
}

export type WorldEntityManualMentionPayload = {
  id: string
  worldId: string
  entityId: string
  entityType: WorldEntityType
  entityName: string
  mentionText: string
  weight: number
  source: WorldEntityManualMentionSource
  note: string
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

export type UpsertWorldEntityManualMentionInput = {
  entityId: string
  mentionText: string
  weight?: number
  source?: WorldEntityManualMentionSource
  note?: string
  enabled?: boolean
}

type MentionDraft = {
  world: WorldRecord
  entity: WorldEntityRecord
  mentionText: string
  mentionKind: WorldEntityMentionKind
  sourceField: string
  weight: number
  sourceUpdatedAt?: Date | string
}

type RuntimeIndex = {
  engine: Bm25Engine | null
  records: WorldEntityMentionIndexRecord[]
  recordById: Map<string, WorldEntityMentionIndexRecord>
  bm25Ready: boolean
  builtAt: string
}

const require = createRequire(import.meta.url)
const createBm25Engine = require('wink-bm25-text-search') as () => Bm25Engine
const jieba = Jieba.withDict(dict)

const MIN_BM25_DOCS = 3
const DEFAULT_LIMIT = 8
const MAX_LIMIT = 30

const ENTITY_TYPE_LABELS: Partial<Record<WorldEntityType, string[]>> = {
  character: ['人物', '角色'],
  race: ['种族'],
  faction: ['势力', '组织'],
  nation: ['国家'],
  city: ['城市'],
  region: ['地区', '区域'],
  map: ['地图'],
  map_location: ['地点', '位置'],
  event: ['事件'],
  item: ['物品', '道具'],
  rule: ['规则'],
  custom: ['自定义']
}

const MENTION_WEIGHTS: Record<WorldEntityMentionKind, number> = {
  entity_name: 1,
  entity_title: 0.9,
  entity_slug: 0.82,
  world_scoped_name: 0.75,
  manual: 1
}

const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()

const normalizeLimit = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? DEFAULT_LIMIT), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(MAX_LIMIT, parsed))
}

const stableMentionId = (input: {
  entityId: string
  mentionKind: WorldEntityMentionKind
  mentionText: string
  sourceId?: string
}): string =>
  `${input.entityId}:${input.mentionKind}:${input.sourceId ? `${input.sourceId}:` : ''}${normalizeText(input.mentionText)}`
    .replace(/\s+/g, '_')
    .slice(0, 240)

const unique = <T>(values: T[]): T[] => [...new Set(values)]

const toTime = (value: unknown): number => {
  if (value instanceof Date) return value.getTime()
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

const latestIsoTime = (...values: unknown[]): string => {
  const latest = Math.max(...values.map(toTime))
  return latest > 0 ? new Date(latest).toISOString() : ''
}

const normalizeWeight = (value: unknown): number => {
  const parsed = Number(value ?? 1)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(0.1, Math.min(2, parsed))
}

const charNgrams = (input: string, min = 2, max = 3): string[] => {
  const text = String(input || '').replace(/\s+/g, '')
  const tokens: string[] = []
  for (let size = min; size <= max; size += 1) {
    if (text.length < size) continue
    for (let index = 0; index <= text.length - size; index += 1) {
      tokens.push(text.slice(index, index + size))
    }
  }
  return tokens
}

const tokenize = (input: string): string[] => {
  const normalized = normalizeText(input)
  if (!normalized) return []
  return unique(
    [
      ...jieba.cutForSearch(normalized, true),
      ...normalized.split(/[\s,，。！？!?;；:：、"'`()[\]{}<>《》]+/),
      ...charNgrams(normalized)
    ]
      .map((token) => normalizeText(token))
      .filter((token) => token.length > 0)
  )
}

const buildSearchText = (draft: MentionDraft): string =>
  unique([
    draft.mentionText,
    draft.entity.name,
    draft.entity.title,
    draft.entity.slug,
    draft.world.name,
    draft.entity.type,
    ...(ENTITY_TYPE_LABELS[draft.entity.type] ?? [])
  ])
    .filter((value) => String(value ?? '').trim())
    .join(' ')

const makeMentionRecord = (draft: MentionDraft): WorldEntityMentionIndexRecord => {
  const record = new WorldEntityMentionIndexRecord()
  record.id =
    stableMentionId({
      entityId: draft.entity.id,
      mentionKind: draft.mentionKind,
      mentionText: draft.mentionText,
      sourceId: draft.mentionKind === 'manual' ? draft.sourceField : undefined
    }) || randomUUID()
  record.worldId = draft.world.id
  record.worldName = draft.world.name
  record.entityId = draft.entity.id
  record.entityType = draft.entity.type
  record.entityName = draft.entity.name
  record.mentionText = draft.mentionText
  record.mentionKind = draft.mentionKind
  record.searchText = buildSearchText(draft)
  record.sourceField = draft.sourceField
  record.weight = draft.weight
  record.enabled = 1
  record.sourceUpdatedAt = latestIsoTime(
    draft.world.updatedAt,
    draft.entity.updatedAt,
    draft.sourceUpdatedAt
  )
  return record
}

const addDraft = (
  drafts: MentionDraft[],
  input: Omit<MentionDraft, 'mentionText'> & { mentionText: unknown }
): void => {
  const mentionText = String(input.mentionText ?? '').trim()
  if (!mentionText) return
  drafts.push({
    world: input.world,
    entity: input.entity,
    mentionText,
    mentionKind: input.mentionKind,
    sourceField: input.sourceField,
    weight: input.weight
  })
}

const toManualMentionPayload = (
  record: WorldEntityManualMentionRecord
): WorldEntityManualMentionPayload => ({
  id: record.id,
  worldId: record.worldId,
  entityId: record.entityId,
  entityType: record.entityType,
  entityName: record.entityName,
  mentionText: record.mentionText,
  weight: record.weight,
  source: record.source,
  note: record.note,
  enabled: record.enabled === 1,
  createdAt: record.createdAt?.toISOString(),
  updatedAt: record.updatedAt?.toISOString()
})

const fallbackTextScore = (
  queryTokens: string[],
  record: WorldEntityMentionIndexRecord
): number => {
  if (queryTokens.length === 0) return 0
  const recordTokens = new Set(tokenize(record.searchText))
  const mention = normalizeText(record.mentionText)
  const entityName = normalizeText(record.entityName)
  let score = 0

  for (const token of queryTokens) {
    if (recordTokens.has(token)) score += 0.35
    if (mention && mention.includes(token)) score += 0.35
    if (entityName && entityName.includes(token)) score += 0.2
  }

  const query = queryTokens.join('')
  if (mention && query.includes(mention)) score += 1
  if (entityName && query.includes(entityName)) score += 0.8

  return score
}

class WorldEntityMentionIndexService {
  private runtime: RuntimeIndex | null = null
  private loadPromise: Promise<RuntimeIndex> | null = null
  private rebuildPromise: Promise<RuntimeIndex> | null = null
  private sourceDirty = false
  private invalidationVersion = 0

  private get indexRepo() {
    return AppDataSource.getRepository(WorldEntityMentionIndexRecord)
  }

  private get worldRepo() {
    return AppDataSource.getRepository(WorldRecord)
  }

  private get entityRepo() {
    return AppDataSource.getRepository(WorldEntityRecord)
  }

  private get manualMentionRepo() {
    return AppDataSource.getRepository(WorldEntityManualMentionRecord)
  }

  invalidateAll(): void {
    this.sourceDirty = true
    this.invalidationVersion += 1
    this.runtime = null
    this.loadPromise = null
  }

  async rebuild(): Promise<RuntimeIndex> {
    if (this.rebuildPromise) return this.rebuildPromise

    this.rebuildPromise = this.rebuildUntilStable()
    try {
      return await this.rebuildPromise
    } finally {
      this.rebuildPromise = null
    }
  }

  async ensureLoaded(): Promise<RuntimeIndex> {
    if (this.runtime && !this.sourceDirty) return this.runtime

    if (this.sourceDirty) {
      return this.rebuild()
    }

    if (!this.loadPromise) {
      this.loadPromise = this.loadFromIndexTable()
    }

    const runtime = await this.loadPromise
    return this.sourceDirty ? this.rebuild() : runtime
  }

  async search(input: WorldEntityMentionSearchInput): Promise<WorldEntityMentionSearchCandidate[]> {
    const query = String(input.query || '').trim()
    if (!query) return []

    const runtime = await this.ensureLoaded()
    const limit = normalizeLimit(input.limit)
    const queryTokens = tokenize(query)
    const allowedRecord = (record: WorldEntityMentionIndexRecord): boolean => {
      if (!record.enabled) return false
      if (input.worldId && record.worldId !== input.worldId) return false
      if (input.entityType && record.entityType !== input.entityType) return false
      return true
    }

    const bm25HitLimit = Math.min(runtime.records.length, Math.max(limit * 20, 100))
    const rawHits =
      runtime.bm25Ready && runtime.engine
        ? runtime.engine.search(query, bm25HitLimit)
        : runtime.records.map(
            (record) => [record.id, fallbackTextScore(queryTokens, record)] as [string, number]
          )

    const byEntity = new Map<string, WorldEntityMentionSearchCandidate>()
    for (const [recordId, rawScore] of rawHits) {
      const record = runtime.recordById.get(recordId)
      if (!record || !allowedRecord(record) || rawScore <= 0) continue

      const contextBoost =
        (input.previousFocus?.worldId && input.previousFocus.worldId === record.worldId
          ? 0.08
          : 0) +
        (input.previousFocus?.entityId && input.previousFocus.entityId === record.entityId
          ? 0.12
          : 0)
      const score = rawScore * record.weight + contextBoost
      const existing = byEntity.get(record.entityId)

      if (!existing) {
        byEntity.set(record.entityId, {
          worldId: record.worldId,
          worldName: record.worldName,
          entityId: record.entityId,
          entityType: record.entityType,
          entityName: record.entityName,
          score,
          rawScore,
          matchedMentions: [record.mentionText],
          matchedFields: [record.mentionKind],
          sourceRecordIds: [record.id]
        })
        continue
      }

      existing.score = Math.max(existing.score, score)
      existing.rawScore = Math.max(existing.rawScore, rawScore)
      existing.matchedMentions = unique([...existing.matchedMentions, record.mentionText]).slice(
        0,
        5
      )
      existing.matchedFields = unique([...existing.matchedFields, record.mentionKind])
      existing.sourceRecordIds = unique([...existing.sourceRecordIds, record.id])
    }

    return [...byEntity.values()].sort((a, b) => b.score - a.score).slice(0, limit)
  }

  async listManualMentions(entityId: string): Promise<WorldEntityManualMentionPayload[]> {
    const normalizedEntityId = String(entityId || '').trim()
    if (!normalizedEntityId) throw new Error('entityId is required')

    const records = await this.manualMentionRepo.find({
      where: { entityId: normalizedEntityId },
      order: { updatedAt: 'DESC' }
    })
    return records.map(toManualMentionPayload)
  }

  async upsertManualMention(
    input: UpsertWorldEntityManualMentionInput
  ): Promise<WorldEntityManualMentionPayload> {
    const entityId = String(input.entityId || '').trim()
    const mentionText = String(input.mentionText || '').trim()
    if (!entityId) throw new Error('entityId is required')
    if (!mentionText) throw new Error('mentionText is required')

    const entity = await this.entityRepo.findOneBy({ id: entityId })
    if (!entity) throw new Error(`Entity not found: ${entityId}`)

    const normalizedMentionText = normalizeText(mentionText)
    const id = stableMentionId({
      entityId,
      mentionKind: 'manual',
      mentionText
    })
    const existing = await this.manualMentionRepo.findOneBy({ id })
    const record =
      existing ??
      this.manualMentionRepo.create({
        id,
        worldId: entity.worldId,
        entityId,
        entityType: entity.type,
        normalizedMentionText
      })

    record.worldId = entity.worldId
    record.entityId = entity.id
    record.entityType = entity.type
    record.entityName = entity.name
    record.mentionText = mentionText
    record.normalizedMentionText = normalizedMentionText
    record.weight = normalizeWeight(input.weight)
    record.source = input.source ?? record.source ?? 'agent'
    record.note = String(input.note ?? record.note ?? '').trim()
    record.enabled = input.enabled === false ? 0 : 1

    const saved = await this.manualMentionRepo.save(record)
    this.invalidateAll()
    return toManualMentionPayload(saved)
  }

  async deleteManualMention(id: string): Promise<boolean> {
    const normalizedId = String(id || '').trim()
    if (!normalizedId) throw new Error('id is required')

    const result = await this.manualMentionRepo.delete({ id: normalizedId })
    const deleted = Boolean(result.affected && result.affected > 0)
    if (deleted) {
      this.invalidateAll()
    }
    return deleted
  }

  private async collectMentionRecords(): Promise<WorldEntityMentionIndexRecord[]> {
    const worlds = await this.worldRepo.find({ order: { updatedAt: 'DESC' } })
    const worldById = new Map(worlds.map((world) => [world.id, world]))
    const entities = await this.entityRepo.find({ order: { updatedAt: 'DESC' } })
    const entityById = new Map(entities.map((entity) => [entity.id, entity]))
    const manualMentions = await this.manualMentionRepo.find({
      where: { enabled: 1 },
      order: { updatedAt: 'DESC' }
    })
    const drafts: MentionDraft[] = []

    for (const entity of entities) {
      const world = worldById.get(entity.worldId)
      if (!world) continue
      addDraft(drafts, {
        world,
        entity,
        mentionText: entity.name,
        mentionKind: 'entity_name',
        sourceField: 'WorldEntityRecord.name',
        weight: MENTION_WEIGHTS.entity_name
      })
      addDraft(drafts, {
        world,
        entity,
        mentionText: entity.title,
        mentionKind: 'entity_title',
        sourceField: 'WorldEntityRecord.title',
        weight: MENTION_WEIGHTS.entity_title
      })
      addDraft(drafts, {
        world,
        entity,
        mentionText: entity.slug,
        mentionKind: 'entity_slug',
        sourceField: 'WorldEntityRecord.slug',
        weight: MENTION_WEIGHTS.entity_slug
      })
      addDraft(drafts, {
        world,
        entity,
        mentionText: `${world.name} ${entity.name}`,
        mentionKind: 'world_scoped_name',
        sourceField: 'WorldRecord.name+WorldEntityRecord.name',
        weight: MENTION_WEIGHTS.world_scoped_name
      })
    }

    for (const mention of manualMentions) {
      const entity = entityById.get(mention.entityId)
      if (!entity) continue
      const world = worldById.get(entity.worldId)
      if (!world) continue

      addDraft(drafts, {
        world,
        entity,
        mentionText: mention.mentionText,
        mentionKind: 'manual',
        sourceField: mention.id,
        weight: normalizeWeight(mention.weight),
        sourceUpdatedAt: mention.updatedAt
      })
    }

    return drafts.map(makeMentionRecord)
  }

  private async persistRecords(records: WorldEntityMentionIndexRecord[]): Promise<void> {
    await this.indexRepo.clear()
    if (records.length > 0) {
      await this.indexRepo.save(records)
    }
  }

  private async rebuildUntilStable(): Promise<RuntimeIndex> {
    let runtime: RuntimeIndex | null = null

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const startedVersion = this.invalidationVersion
      const records = await this.collectMentionRecords()
      await this.persistRecords(records)
      runtime = this.buildRuntimeIndex(records)
      this.runtime = runtime
      this.loadPromise = null

      if (this.invalidationVersion === startedVersion) {
        this.sourceDirty = false
        return runtime
      }

      this.sourceDirty = true
    }

    return runtime ?? this.buildRuntimeIndex([])
  }

  private recordsMatchSource(
    persistedRecords: WorldEntityMentionIndexRecord[],
    sourceRecords: WorldEntityMentionIndexRecord[]
  ): boolean {
    if (persistedRecords.length !== sourceRecords.length) return false

    const signature = (record: WorldEntityMentionIndexRecord): string =>
      [
        record.id,
        record.worldId,
        record.worldName,
        record.entityId,
        record.entityType,
        record.entityName,
        record.mentionText,
        record.mentionKind,
        record.searchText,
        record.sourceField,
        record.weight,
        record.enabled,
        record.sourceUpdatedAt
      ].join('\u0001')

    const persistedById = new Map(persistedRecords.map((record) => [record.id, signature(record)]))
    return sourceRecords.every((record) => persistedById.get(record.id) === signature(record))
  }

  private async loadFromIndexTable(): Promise<RuntimeIndex> {
    const startedVersion = this.invalidationVersion
    const [persistedRecords, sourceRecords] = await Promise.all([
      this.indexRepo.find({
        where: { enabled: 1 },
        order: { updatedAt: 'DESC' }
      }),
      this.collectMentionRecords()
    ])

    const records = this.recordsMatchSource(persistedRecords, sourceRecords)
      ? persistedRecords
      : sourceRecords

    if (records === sourceRecords) {
      await this.persistRecords(sourceRecords)
    }

    this.runtime = this.buildRuntimeIndex(records)
    this.loadPromise = null
    this.sourceDirty = this.invalidationVersion !== startedVersion
    return this.runtime
  }

  private buildRuntimeIndex(records: WorldEntityMentionIndexRecord[]): RuntimeIndex {
    const recordById = new Map(records.map((record) => [record.id, record]))
    const enabledRecords = records.filter((record) => record.enabled === 1)
    let engine: Bm25Engine | null = null
    let bm25Ready = false

    if (enabledRecords.length >= MIN_BM25_DOCS) {
      try {
        engine = createBm25Engine()
        engine.defineConfig({ fldWeights: { searchText: 1 } })
        engine.definePrepTasks([tokenize])
        for (const record of enabledRecords) {
          engine.addDoc({ searchText: record.searchText }, record.id)
        }
        engine.consolidate()
        bm25Ready = true
      } catch {
        engine = null
        bm25Ready = false
      }
    }

    return {
      engine,
      records: enabledRecords,
      recordById,
      bm25Ready,
      builtAt: new Date().toISOString()
    }
  }
}

export const worldEntityMentionIndexService = new WorldEntityMentionIndexService()
