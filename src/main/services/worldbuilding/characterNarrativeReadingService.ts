import { AppDataSource } from '../../database'
import { CharacterNarrativeDocumentRecord } from '../../../share/entity/database/CharacterNarrativeDocumentRecord'
import { WorldEntityRecord } from '../../../share/entity/database/WorldEntityRecord'

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
  fullReadOption: {
    type: 'full'
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
}

type TreeNode = CharacterNarrativeDocumentRecord & {
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

class CharacterNarrativeReadingService {
  private get entityRepo() {
    return AppDataSource.getRepository(WorldEntityRecord)
  }

  private get documentRepo() {
    return AppDataSource.getRepository(CharacterNarrativeDocumentRecord)
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

  private async loadTree(characterEntityId: string): Promise<{
    character: WorldEntityRecord
    roots: TreeNode[]
  }> {
    const character = await this.assertCharacterEntity(characterEntityId)
    const documents = await this.documentRepo.find({
      where: { characterEntityId: character.id }
    })
    const nodeById = new Map<string, TreeNode>()
    for (const document of documents) {
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
      roots: sortDocuments(roots)
    }
  }

  private flattenDocumentInfo(roots: TreeNode[]): DocumentInfo[] {
    const documents: DocumentInfo[] = []

    const visit = (node: TreeNode, depth: number, parentPath: string[]): void => {
      const title = node.title || '新建文件'
      const path = [...parentPath, title]
      const text = htmlToReadableText(node.contentHtml)
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
    const character = await this.assertCharacterEntity(characterEntityId)
    const documents = await this.documentRepo.find({
      where: { characterEntityId: character.id }
    })
    const latestUpdatedAt = documents.reduce<Date | null>((latest, document) => {
      if (!document.updatedAt) return latest
      if (!latest || document.updatedAt.getTime() > latest.getTime()) {
        return document.updatedAt
      }
      return latest
    }, null)
    const totalReadableCharacters = documents.reduce(
      (total, document) => total + htmlToReadableText(document.contentHtml).length,
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
      latestDocumentUpdatedAt: latestUpdatedAt?.toISOString()
    }
  }

  private buildDocumentMaps(roots: TreeNode[]): {
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

    const infos = this.flattenDocumentInfo(roots)
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
    const { character, roots } = await this.loadTree(input.characterEntityId)
    const { nodeById, infoById } = this.buildDocumentMaps(roots)
    const totalReadableCharacters = [...infoById.values()].reduce(
      (total, info) => total + info.textLength,
      0
    )
    const previewChars = normalizePreviewChars(input.previewChars)
    const selectableItems: CharacterNarrativeCatalogSelectableItem[] = []

    for (const info of infoById.values()) {
      const node = nodeById.get(info.documentId)
      if (!node) continue
      const subtreeIds = this.collectSubtreeDocumentIds(node)
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
      rootCount: roots.length,
      fullReadOption: {
        type: 'full',
        label: '全量阅读',
        mission: DEFAULT_FULL_READING_MISSION,
        documentCount: infoById.size,
        readableCharacters: totalReadableCharacters
      },
      selectableItems,
      selectionGuide: {
        rules: [
          '如果用户需要整体认识人物，选择 full。',
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
    const { character, roots } = await this.loadTree(input.characterEntityId)
    const { nodeById, infoById, documentOrder } = this.buildDocumentMaps(roots)
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
    const { roots } = await this.loadTree(task.character.entityId)
    const { infoById } = this.buildDocumentMaps(roots)
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

export const characterNarrativeReadingService = new CharacterNarrativeReadingService()
