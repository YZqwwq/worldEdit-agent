import { DataSource, In } from 'typeorm'
import { WorldEntityDocumentRecord } from '../../../share/entity/database/WorldEntityDocumentRecord'
import { WorldEntityRecord } from '../../../share/entity/database/WorldEntityRecord'
import {
  AgentWorldCognitionService,
  MAIN_AGENT_COGNITION_OWNER_ID
} from './agentWorldCognitionService'
import type {
  AgentWorldCognitionNodeStatus,
  WorldCognitionDocumentRef
} from '@share/cache/worldbuilding/agentWorldCognition'

export type CharacterNarrativeCognitionScopeStatus =
  | 'available'
  | 'missing'
  | 'needs_review'
  | 'ambiguous'

export interface CharacterNarrativeCognitionScope {
  status: CharacterNarrativeCognitionScopeStatus
  query: string
  cognitionNodeId?: string
  cognitionRevision?: number
  documentRefs: WorldCognitionDocumentRef[]
  candidates: Array<{
    nodeId: string
    title: string
    revision: number
    status: AgentWorldCognitionNodeStatus
  }>
  reason: string
}

export interface CharacterNarrativeReadingChunk {
  chunkId: string
  documentId: string
  title: string
  path: string[]
  depth: number
  chunkIndex: number
  chunkCount: number
  text: string
  textLength: number
  updatedAt?: string
}

export interface CharacterNarrativeCatalogSelectableItem {
  type: 'document' | 'document_tree'
  documentId: string
  title: string
  path: string[]
  depth: number
  childCount: number
  subtreeDocumentCount: number
  textLength: number
  subtreeTextLength: number
  updatedAt?: string
  preview?: string
}

export interface CharacterNarrativeCatalog {
  character: {
    entityId: string
    name: string
    worldId: string
  }
  totalDocuments: number
  totalReadableCharacters: number
  rootCount: number
  cognitionScope: CharacterNarrativeCognitionScope
  warnings: string[]
  fullReadOption: {
    type: 'full'
    available: boolean
    label: string
    mission: string
    documentCount: number
    readableCharacters: number
  }
  selectableItems: CharacterNarrativeCatalogSelectableItem[]
  selectionGuide: {
    rules: string[]
    examples: Array<{
      mission: string
      selections: Array<{
        type: 'document' | 'document_tree' | 'full'
        title: string
        mission: string
      }>
    }>
  }
}

export type CharacterNarrativeReadingSelection =
  | {
      type: 'document'
      documentId: string
      mission: string
    }
  | {
      type: 'document_tree'
      rootDocumentId: string
      mission: string
    }

export interface CharacterNarrativeReadingTaskUnit {
  unitId: string
  type: 'full' | 'document' | 'document_tree'
  mission: string
  documentId?: string
  rootDocumentId?: string
  title: string
  path: string[]
  documentIds: string[]
  documentCount: number
  readableCharacters: number
  orderIndex: number
}

export interface CharacterNarrativeReadingTask {
  taskId: string
  character: {
    entityId: string
    name: string
    worldId: string
  }
  mode: 'full' | 'selective'
  cognitionBinding: {
    nodeId: string
    revision: number
    documentRefs: WorldCognitionDocumentRef[]
  }
  mission: string
  outputIntent: {
    kind: string
    instructions?: string
  }
  totalDocuments: number
  totalReadableCharacters: number
  estimatedBatchCount: number
  maxBatchChars: number
  units: CharacterNarrativeReadingTaskUnit[]
  firstCursor: string
  warnings: string[]
  readingProtocol: {
    rules: string[]
    perUnitOutputGuidance: string[]
    finalOutputGuidance: string[]
  }
}

export interface CharacterNarrativeTaskReadingBatch {
  taskId: string
  mission: string
  outputIntent: {
    kind: string
    instructions?: string
  }
  currentUnit: CharacterNarrativeReadingTaskUnit
  cursor: string
  nextCursor: string | null
  hasMoreInUnit: boolean
  hasMore: boolean
  unitIndex: number
  chunkIndexStart: number
  chunkIndexEnd: number
  totalUnitChunks: number
  returnedCharacters: number
  chunks: CharacterNarrativeReadingChunk[]
  readingInstruction: {
    taskMission: string
    unitMission: string
    requiredAgentAction: string
  }
}

export interface CharacterNarrativeFreshnessSnapshot {
  character: {
    entityId: string
    name: string
    worldId: string
  }
  totalDocuments: number
  totalReadableCharacters: number
  latestDocumentUpdatedAt?: string
  cognitionScope: CharacterNarrativeCognitionScope
}

type TreeNode = WorldEntityDocumentRecord & {
  children: TreeNode[]
}

type DocumentInfo = {
  documentId: string
  title: string
  parentDocumentId: string | null
  path: string[]
  depth: number
  childCount: number
  text: string
  textLength: number
  updatedAt?: string
  children: TreeNode[]
}

const DEFAULT_READING_CHUNK_CHARS = 6000
const DEFAULT_BATCH_CHARS = 12000
const MAX_BATCH_CHARS = 24000
const DEFAULT_FULL_READING_MISSION = '形成对人物的整体概念'

const normalizeMaxChars = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? DEFAULT_BATCH_CHARS), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_BATCH_CHARS
  return Math.max(1000, Math.min(MAX_BATCH_CHARS, parsed))
}

const normalizePreviewChars = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? 200), 10)
  if (!Number.isFinite(parsed)) return 200
  return Math.max(0, Math.min(1000, parsed))
}

const normalizeMission = (value: unknown, fallback: string): string => {
  const mission = String(value || '').trim()
  return (mission || fallback).slice(0, 2000)
}

const normalizeCursorPair = (value: unknown): { unitIndex: number; chunkIndex: number } => {
  const text = String(value ?? '0:0').trim()
  const [unit, chunk] = text.split(':')
  const unitIndex = Number.parseInt(unit ?? '0', 10)
  const chunkIndex = Number.parseInt(chunk ?? '0', 10)
  return {
    unitIndex: Number.isFinite(unitIndex) && unitIndex > 0 ? unitIndex : 0,
    chunkIndex: Number.isFinite(chunkIndex) && chunkIndex > 0 ? chunkIndex : 0
  }
}

const formatCursorPair = (unitIndex: number, chunkIndex: number): string =>
  `${Math.max(0, unitIndex)}:${Math.max(0, chunkIndex)}`

const decodeHtmlEntities = (text: string): string =>
  text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))

export const htmlToReadableText = (html: string): string => {
  const raw = String(html || '')
  if (!raw.trim()) return ''

  return decodeHtmlEntities(
    raw
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<\/(p|div|section|article|header|footer|blockquote|li|h[1-6])>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<h([1-6])[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim()
}

const sortDocuments = <T extends { sortKey?: string; createdAt?: Date; title?: string }>(
  documents: T[]
): T[] =>
  [...documents].sort((a, b) => {
    const sortKeyCompare = String(a.sortKey || '').localeCompare(String(b.sortKey || ''))
    if (sortKeyCompare !== 0) return sortKeyCompare
    const createdCompare = Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0)
    if (createdCompare !== 0) return createdCompare
    return String(a.title || '').localeCompare(String(b.title || ''))
  })

const splitText = (text: string, chunkSize = DEFAULT_READING_CHUNK_CHARS): string[] => {
  const normalized = text.trim()
  if (!normalized) return ['']
  const chunks: string[] = []
  for (let index = 0; index < normalized.length; index += chunkSize) {
    chunks.push(normalized.slice(index, index + chunkSize))
  }
  return chunks
}

const compactPreview = (value: string, maxChars: number): string => {
  const max = Math.max(0, Math.min(1000, maxChars))
  if (max === 0) return ''
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

export class CharacterNarrativeReadingService {
  private readonly cognitionService: AgentWorldCognitionService

  constructor(private readonly dataSource: DataSource) {
    this.cognitionService = new AgentWorldCognitionService(dataSource)
  }

  private get entityRepo() {
    return this.dataSource.getRepository(WorldEntityRecord)
  }

  private get documentRepo() {
    return this.dataSource.getRepository(WorldEntityDocumentRecord)
  }

  private async assertCharacterEntity(characterEntityId: string): Promise<WorldEntityRecord> {
    const normalizedId = String(characterEntityId || '').trim()
    if (!normalizedId) throw new Error('characterEntityId is required')

    const entity = await this.entityRepo.findOneBy({ id: normalizedId })
    if (!entity) throw new Error(`Character entity not found: ${normalizedId}`)
    if (entity.type !== 'character') {
      throw new Error(`Narrative reading requires a character entity, received "${entity.type}"`)
    }

    return entity
  }

  private async resolveCognitionScope(
    character: WorldEntityRecord
  ): Promise<CharacterNarrativeCognitionScope> {
    const query = character.name.trim()
    const cognition = await this.cognitionService.queryNodes({
      agentId: MAIN_AGENT_COGNITION_OWNER_ID,
      worldId: character.worldId,
      query,
      limit: 10
    })
    const concepts = cognition.matches.filter((node) => node.nodeKind === 'concept')
    const candidates = concepts.map((node) => ({
      nodeId: node.id,
      title: node.title,
      revision: node.revision,
      status: node.status
    }))
    const normalizedName = query.toLocaleLowerCase()
    const exact = concepts.filter(
      (node) => node.title.trim().toLocaleLowerCase() === normalizedName
    )
    const choose = (
      node: (typeof concepts)[number],
      reason: string
    ): CharacterNarrativeCognitionScope => ({
      status: 'available',
      query,
      cognitionNodeId: node.id,
      cognitionRevision: node.revision,
      documentRefs: node.documentRefs,
      candidates,
      reason
    })

    if (exact.length > 0) {
      const available = exact.filter((node) => node.status === 'available')
      if (available.length === 1) {
        return choose(available[0], `使用与人物名称“${query}”完全匹配的认知卡片。`)
      }
      if (available.length > 1) {
        return {
          status: 'ambiguous',
          query,
          documentRefs: [],
          candidates,
          reason: `存在 ${available.length} 张同名有效认知卡片，不能自动决定人物阅读范围。`
        }
      }
      return {
        status: 'needs_review',
        query,
        documentRefs: [],
        candidates,
        reason: '与人物名称完全匹配的认知卡片需要重新验证。'
      }
    }

    const available = concepts.filter((node) => node.status === 'available')
    if (available.length > 0) {
      return {
        status: 'ambiguous',
        query,
        documentRefs: [],
        candidates,
        reason:
          available.length === 1
            ? `名称“${query}”只在认知正文中间接命中，不能确认它就是该人物的认知卡片。`
            : `名称“${query}”间接命中 ${available.length} 张有效认知卡片，需要先消歧。`
      }
    }
    if (concepts.length > 0) {
      return {
        status: 'needs_review',
        query,
        documentRefs: [],
        candidates,
        reason: `人物“${query}”只命中了待验证的认知卡片。`
      }
    }
    return {
      status: 'missing',
      query,
      documentRefs: [],
      candidates: [],
      reason: `尚未建立人物“${query}”的世界认知卡片。`
    }
  }

  private async loadTree(characterEntityId: string): Promise<{
    character: WorldEntityRecord
    roots: TreeNode[]
    cognitionScope: CharacterNarrativeCognitionScope
    allowedDocumentIds: Set<string>
  }> {
    const character = await this.assertCharacterEntity(characterEntityId)
    let cognitionScope = await this.resolveCognitionScope(character)
    if (cognitionScope.status !== 'available') {
      return { character, roots: [], cognitionScope, allowedDocumentIds: new Set() }
    }

    const allowedDocumentIds = new Set(cognitionScope.documentRefs.map((ref) => ref.documentId))
    const contentDocuments = await this.documentRepo.findBy({
      id: In([...allowedDocumentIds])
    })
    const contentById = new Map(contentDocuments.map((document) => [document.id, document]))
    const invalidRef = cognitionScope.documentRefs.find((ref) => {
      const document = contentById.get(ref.documentId)
      return (
        !document || document.worldId !== character.worldId || document.revision !== ref.revision
      )
    })
    if (invalidRef) {
      cognitionScope = {
        ...cognitionScope,
        status: 'needs_review',
        documentRefs: [],
        reason: `认知来源文档 ${invalidRef.documentId} 已缺失、跨世界或 revision 不一致，需要重新验证。`
      }
      return { character, roots: [], cognitionScope, allowedDocumentIds: new Set() }
    }

    const documentMetadata = await this.documentRepo.find({
      where: { worldId: character.worldId },
      select: {
        id: true,
        worldId: true,
        parentDocumentId: true,
        title: true,
        contentFormat: true,
        sortKey: true,
        revision: true,
        schemaVersion: true,
        createdAt: true,
        updatedAt: true
      }
    })
    const nodeById = new Map<string, TreeNode>()
    for (const metadata of documentMetadata) {
      const content = contentById.get(metadata.id)
      const document = this.documentRepo.create({
        ...metadata,
        contentHtml: content?.contentHtml ?? ''
      })
      nodeById.set(document.id, Object.assign(document, { children: [] }))
    }

    const roots: TreeNode[] = []
    for (const node of nodeById.values()) {
      const parentId = node.parentDocumentId || ''
      const parent = parentId ? nodeById.get(parentId) : null
      if (parent) {
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    }

    for (const node of nodeById.values()) {
      node.children = sortDocuments(node.children)
    }

    return {
      character,
      roots: sortDocuments(roots),
      cognitionScope,
      allowedDocumentIds
    }
  }

  private flattenDocumentInfo(
    roots: TreeNode[],
    allowedDocumentIds: ReadonlySet<string>
  ): DocumentInfo[] {
    const documents: DocumentInfo[] = []

    const visit = (node: TreeNode, depth: number, parentPath: string[]): void => {
      const title = node.title || '新建文件'
      const path = [...parentPath, title]
      const text = htmlToReadableText(node.contentHtml)
      if (allowedDocumentIds.has(node.id)) {
        documents.push({
          documentId: node.id,
          title,
          parentDocumentId: node.parentDocumentId ?? null,
          path,
          depth,
          childCount: node.children.length,
          text,
          textLength: text.length,
          updatedAt: node.updatedAt?.toISOString(),
          children: node.children
        })
      }

      for (const child of node.children) {
        visit(child, depth + 1, path)
      }
    }

    for (const root of roots) {
      visit(root, 0, [])
    }

    return documents
  }

  private collectSubtreeDocumentIds(node: TreeNode): string[] {
    const ids: string[] = []
    const visit = (current: TreeNode): void => {
      ids.push(current.id)
      for (const child of current.children) {
        visit(child)
      }
    }
    visit(node)
    return ids
  }

  async getFreshnessSnapshot(
    characterEntityId: string
  ): Promise<CharacterNarrativeFreshnessSnapshot> {
    const { character, roots, cognitionScope, allowedDocumentIds } =
      await this.loadTree(characterEntityId)
    const documents = this.flattenDocumentInfo(roots, allowedDocumentIds)
    const latestUpdatedAt = documents.reduce<number | null>((latest, document) => {
      const updatedAt = document.updatedAt ? Date.parse(document.updatedAt) : Number.NaN
      if (!Number.isFinite(updatedAt)) return latest
      if (latest === null || updatedAt > latest) {
        return updatedAt
      }
      return latest
    }, null)
    const totalReadableCharacters = documents.reduce(
      (total, document) => total + document.textLength,
      0
    )

    return {
      character: {
        entityId: character.id,
        name: character.name,
        worldId: character.worldId
      },
      totalDocuments: documents.length,
      totalReadableCharacters,
      latestDocumentUpdatedAt:
        latestUpdatedAt === null ? undefined : new Date(latestUpdatedAt).toISOString(),
      cognitionScope
    }
  }

  private buildDocumentMaps(
    roots: TreeNode[],
    allowedDocumentIds: ReadonlySet<string>
  ): {
    nodeById: Map<string, TreeNode>
    infoById: Map<string, DocumentInfo>
    documentOrder: string[]
  } {
    const nodeById = new Map<string, TreeNode>()
    const visitNode = (node: TreeNode): void => {
      nodeById.set(node.id, node)
      for (const child of node.children) {
        visitNode(child)
      }
    }
    for (const root of roots) {
      visitNode(root)
    }

    const infos = this.flattenDocumentInfo(roots, allowedDocumentIds)
    return {
      nodeById,
      infoById: new Map(infos.map((info) => [info.documentId, info])),
      documentOrder: infos.map((info) => info.documentId)
    }
  }

  async inspectCatalog(input: {
    characterEntityId: string
    includePreview?: boolean
    previewChars?: number
  }): Promise<CharacterNarrativeCatalog> {
    const { character, roots, cognitionScope, allowedDocumentIds } = await this.loadTree(
      input.characterEntityId
    )
    const { nodeById, infoById } = this.buildDocumentMaps(roots, allowedDocumentIds)
    const totalReadableCharacters = [...infoById.values()].reduce(
      (total, info) => total + info.textLength,
      0
    )
    const previewChars = normalizePreviewChars(input.previewChars)
    const selectableItems: CharacterNarrativeCatalogSelectableItem[] = []

    for (const info of infoById.values()) {
      const node = nodeById.get(info.documentId)
      if (!node) continue
      const subtreeIds = this.collectSubtreeDocumentIds(node).filter((documentId) =>
        infoById.has(documentId)
      )
      const subtreeTextLength = subtreeIds.reduce(
        (total, documentId) => total + (infoById.get(documentId)?.textLength ?? 0),
        0
      )
      const base = {
        documentId: info.documentId,
        title: info.title,
        path: info.path,
        depth: info.depth,
        childCount: info.childCount,
        subtreeDocumentCount: subtreeIds.length,
        textLength: info.textLength,
        subtreeTextLength,
        updatedAt: info.updatedAt,
        preview: input.includePreview ? compactPreview(info.text, previewChars) : undefined
      }

      selectableItems.push({
        type: 'document',
        ...base
      })

      if (subtreeIds.length > 1) {
        selectableItems.push({
          type: 'document_tree',
          ...base
        })
      }
    }

    return {
      character: {
        entityId: character.id,
        name: character.name,
        worldId: character.worldId
      },
      totalDocuments: infoById.size,
      totalReadableCharacters,
      rootCount: new Set([...infoById.values()].map((info) => info.path[0])).size,
      cognitionScope,
      warnings:
        cognitionScope.status === 'available'
          ? []
          : [
              cognitionScope.reason,
              '先使用世界文档搜索、树浏览和精确阅读确认人物文档，再建立或修正世界认知卡片。'
            ],
      fullReadOption: {
        type: 'full',
        available: cognitionScope.status === 'available',
        label: cognitionScope.status === 'available' ? '认知范围内全量阅读' : '认知阅读范围不可用',
        mission: DEFAULT_FULL_READING_MISSION,
        documentCount: infoById.size,
        readableCharacters: totalReadableCharacters
      },
      selectableItems,
      selectionGuide: {
        rules: [
          'full 只表示阅读当前人物认知卡片引用的全部文档，不表示读取整个世界。',
          '认知范围缺失、待验证或有歧义时，先通过世界文档工具确认范围并修正认知，不创建阅读任务。',
          '如果用户只关心某一篇文本，选择 document。',
          '如果用户关心某个目录及其子文件，选择 document_tree。',
          '选择性阅读时，每个 document 或 document_tree 都必须有独立 mission。',
          '后续 create_character_narrative_reading_task 必须使用 documentId/rootDocumentId，不要只使用标题。'
        ],
        examples: [
          {
            mission: '形成对人物的整体概念',
            selections: [
              {
                type: 'full',
                title: '全量阅读',
                mission: DEFAULT_FULL_READING_MISSION
              }
            ]
          },
          {
            mission: '先了解人物性格，再分析重要事件对性格的影响',
            selections: [
              {
                type: 'document',
                title: '人物性格',
                mission: '了解人物性格，建立性格基线'
              },
              {
                type: 'document_tree',
                title: '人物事迹',
                mission: '了解人物的重要事件，分析事件如何影响人物性格'
              }
            ]
          }
        ]
      }
    }
  }

  async createReadingTask(input: {
    characterEntityId: string
    mission: string
    mode: 'full' | 'selective'
    selections?: CharacterNarrativeReadingSelection[]
    outputIntent?: {
      kind: string
      instructions?: string
    }
    readingOrder?: 'given_order' | 'tree_order'
    maxBatchChars?: number
  }): Promise<CharacterNarrativeReadingTask> {
    const { character, roots, cognitionScope, allowedDocumentIds } = await this.loadTree(
      input.characterEntityId
    )
    if (cognitionScope.status !== 'available') {
      throw new Error(
        `${cognitionScope.reason} 请先通过世界文档搜索、树浏览和精确阅读建立有效认知范围。`
      )
    }
    if (!cognitionScope.cognitionNodeId || !cognitionScope.cognitionRevision) {
      throw new Error('有效人物认知缺少稳定 nodeId 或 revision。')
    }
    const { nodeById, infoById, documentOrder } = this.buildDocumentMaps(roots, allowedDocumentIds)
    const maxBatchChars = normalizeMaxChars(input.maxBatchChars)
    const mission = normalizeMission(input.mission, DEFAULT_FULL_READING_MISSION)
    const warnings: string[] = []
    const units: CharacterNarrativeReadingTaskUnit[] = []

    const createUnit = (inputUnit: {
      type: 'full' | 'document' | 'document_tree'
      mission: string
      documentIds: string[]
      title: string
      path: string[]
      documentId?: string
      rootDocumentId?: string
    }): CharacterNarrativeReadingTaskUnit => {
      const readableCharacters = inputUnit.documentIds.reduce(
        (total, documentId) => total + (infoById.get(documentId)?.textLength ?? 0),
        0
      )
      return {
        unitId: `unit_${String(units.length + 1).padStart(3, '0')}`,
        type: inputUnit.type,
        mission: normalizeMission(inputUnit.mission, mission),
        documentId: inputUnit.documentId,
        rootDocumentId: inputUnit.rootDocumentId,
        title: inputUnit.title,
        path: inputUnit.path,
        documentIds: inputUnit.documentIds,
        documentCount: inputUnit.documentIds.length,
        readableCharacters,
        orderIndex: units.length
      }
    }

    if (input.mode === 'full') {
      units.push(
        createUnit({
          type: 'full',
          mission,
          documentIds: documentOrder,
          title: '全量阅读',
          path: ['全量阅读']
        })
      )
    } else {
      const selections = input.selections ?? []
      if (selections.length === 0) {
        throw new Error('selective reading requires at least one selection')
      }

      const normalizedSelections =
        input.readingOrder === 'tree_order'
          ? [...selections].sort((a, b) => {
              const aId = a.type === 'document' ? a.documentId : a.rootDocumentId
              const bId = b.type === 'document' ? b.documentId : b.rootDocumentId
              return documentOrder.indexOf(aId) - documentOrder.indexOf(bId)
            })
          : selections

      for (const selection of normalizedSelections) {
        if (selection.type === 'document') {
          const info = infoById.get(selection.documentId)
          if (!info) {
            throw new Error(`Narrative document not found: ${selection.documentId}`)
          }
          units.push(
            createUnit({
              type: 'document',
              mission: selection.mission,
              documentId: selection.documentId,
              documentIds: [selection.documentId],
              title: info.title,
              path: info.path
            })
          )
          continue
        }

        const root = nodeById.get(selection.rootDocumentId)
        const info = infoById.get(selection.rootDocumentId)
        if (!root || !info) {
          throw new Error(`Narrative tree root not found: ${selection.rootDocumentId}`)
        }
        units.push(
          createUnit({
            type: 'document_tree',
            mission: selection.mission,
            rootDocumentId: selection.rootDocumentId,
            documentIds: this.collectSubtreeDocumentIds(root),
            title: info.title,
            path: info.path
          })
        )
      }
    }

    const totalDocuments = units.reduce((total, unit) => total + unit.documentCount, 0)
    const totalReadableCharacters = units.reduce(
      (total, unit) => total + unit.readableCharacters,
      0
    )
    if (totalReadableCharacters === 0) {
      warnings.push('Selected narrative documents contain no readable text.')
    }

    return {
      taskId: `narrative_read_${Date.now().toString(36)}`,
      character: {
        entityId: character.id,
        name: character.name,
        worldId: character.worldId
      },
      mode: input.mode,
      cognitionBinding: {
        nodeId: cognitionScope.cognitionNodeId,
        revision: cognitionScope.cognitionRevision,
        documentRefs: cognitionScope.documentRefs
      },
      mission,
      outputIntent: {
        kind: input.outputIntent?.kind || 'custom',
        instructions: input.outputIntent?.instructions
      },
      totalDocuments,
      totalReadableCharacters,
      estimatedBatchCount: Math.max(1, Math.ceil(totalReadableCharacters / maxBatchChars)),
      maxBatchChars,
      units,
      firstCursor: '0:0',
      warnings,
      readingProtocol: {
        rules: [
          '按 units 顺序阅读，不要跳过前置 unit。',
          '每个 unit 都有独立 mission，阅读该 unit 时必须围绕它提炼阶段理解。',
          '只有 hasMore=false 后才进行最终总结。',
          '如果 hasMore=true，下一次必须使用 nextCursor 继续读取。'
        ],
        perUnitOutputGuidance: [
          '记录本 unit 支持 mission 的关键事实。',
          '区分原文事实、推断和不确定信息。',
          '在进入下一个 unit 前，形成可被后续 unit 使用的阶段结论。'
        ],
        finalOutputGuidance: [
          '最终输出必须回应总 mission。',
          '保留关键证据路径或文件名。',
          '说明文本不足或矛盾之处。'
        ]
      }
    }
  }

  async readTaskBatch(input: {
    task: CharacterNarrativeReadingTask
    cursor?: string
  }): Promise<CharacterNarrativeTaskReadingBatch> {
    const task = input.task
    const { roots, cognitionScope, allowedDocumentIds } = await this.loadTree(
      task.character.entityId
    )
    if (
      cognitionScope.status !== 'available' ||
      cognitionScope.cognitionNodeId !== task.cognitionBinding.nodeId ||
      cognitionScope.cognitionRevision !== task.cognitionBinding.revision
    ) {
      throw new Error(
        `人物认知范围在阅读任务创建后发生变化：${cognitionScope.reason} 请重新检查目录并创建阅读任务。`
      )
    }
    const { infoById } = this.buildDocumentMaps(roots, allowedDocumentIds)
    const cursor = normalizeCursorPair(input.cursor ?? task.firstCursor)
    const unitIndex = Math.min(cursor.unitIndex, Math.max(0, task.units.length - 1))
    const unit = task.units[unitIndex]
    if (!unit) {
      throw new Error('Reading task has no readable units.')
    }

    const unitChunks: CharacterNarrativeReadingChunk[] = []
    for (const documentId of unit.documentIds) {
      const info = infoById.get(documentId)
      if (!info) continue
      const textChunks = splitText(info.text)
      textChunks.forEach((chunk, index) => {
        unitChunks.push({
          chunkId: `${documentId}:${index}`,
          documentId,
          title: info.title,
          path: info.path,
          depth: info.depth,
          chunkIndex: index,
          chunkCount: textChunks.length,
          text: chunk,
          textLength: chunk.length,
          updatedAt: info.updatedAt
        })
      })
    }

    const startIndex = Math.min(cursor.chunkIndex, unitChunks.length)
    const chunks: CharacterNarrativeReadingChunk[] = []
    let returnedCharacters = 0
    let currentIndex = startIndex
    const maxBatchChars = normalizeMaxChars(task.maxBatchChars)

    while (currentIndex < unitChunks.length) {
      const next = unitChunks[currentIndex]
      if (chunks.length > 0 && returnedCharacters + next.textLength > maxBatchChars) break
      chunks.push(next)
      returnedCharacters += next.textLength
      currentIndex += 1
    }

    const hasMoreInUnit = currentIndex < unitChunks.length
    const hasMoreUnit = unitIndex + 1 < task.units.length
    const nextCursor = hasMoreInUnit
      ? formatCursorPair(unitIndex, currentIndex)
      : hasMoreUnit
        ? formatCursorPair(unitIndex + 1, 0)
        : null
    const hasMore = Boolean(nextCursor)

    return {
      taskId: task.taskId,
      mission: task.mission,
      outputIntent: task.outputIntent,
      currentUnit: unit,
      cursor: formatCursorPair(unitIndex, startIndex),
      nextCursor,
      hasMoreInUnit,
      hasMore,
      unitIndex,
      chunkIndexStart: startIndex,
      chunkIndexEnd: currentIndex,
      totalUnitChunks: unitChunks.length,
      returnedCharacters,
      chunks,
      readingInstruction: {
        taskMission: task.mission,
        unitMission: unit.mission,
        requiredAgentAction: hasMoreInUnit
          ? '继续围绕当前 unit mission 阅读下一批文本。'
          : hasMoreUnit
            ? '当前 unit 已读完，先形成阶段结论，再用 nextCursor 进入下一个 unit。'
            : '全部阅读任务已读完，基于所有阶段结论回应总 mission。'
      }
    }
  }
}
