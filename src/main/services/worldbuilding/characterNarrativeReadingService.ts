import { AppDataSource } from '../../database'
import { CharacterNarrativeDocumentRecord } from '../../../share/entity/database/CharacterNarrativeDocumentRecord'
import { WorldEntityRecord } from '../../../share/entity/database/WorldEntityRecord'

export interface CharacterNarrativeOutlineItem {
  documentId: string
  parentDocumentId: string | null
  title: string
  depth: number
  path: string[]
  childCount: number
  textLength: number
  updatedAt?: string
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

export interface CharacterNarrativeReadingPlan {
  character: {
    entityId: string
    name: string
    worldId: string
  }
  outline: CharacterNarrativeOutlineItem[]
  totalDocuments: number
  totalReadableCharacters: number
  recommendedBatchMaxChars: number
  firstCursor: string
}

export interface CharacterNarrativeReadingBatch {
  character: {
    entityId: string
    name: string
    worldId: string
  }
  cursor: string
  nextCursor: string | null
  hasMore: boolean
  batchIndexStart: number
  batchIndexEnd: number
  totalChunks: number
  returnedCharacters: number
  chunks: CharacterNarrativeReadingChunk[]
}

type TreeNode = CharacterNarrativeDocumentRecord & {
  children: TreeNode[]
}

const DEFAULT_READING_CHUNK_CHARS = 6000
const DEFAULT_BATCH_CHARS = 12000
const MAX_BATCH_CHARS = 24000

const normalizeCursor = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? '0'), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const normalizeMaxChars = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? DEFAULT_BATCH_CHARS), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_BATCH_CHARS
  return Math.max(1000, Math.min(MAX_BATCH_CHARS, parsed))
}

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

  private flattenOutline(roots: TreeNode[]): CharacterNarrativeOutlineItem[] {
    const outline: CharacterNarrativeOutlineItem[] = []

    const visit = (node: TreeNode, depth: number, parentPath: string[]): void => {
      const title = node.title || '新建文件'
      const path = [...parentPath, title]
      const text = htmlToReadableText(node.contentHtml)
      outline.push({
        documentId: node.id,
        parentDocumentId: node.parentDocumentId ?? null,
        title,
        depth,
        path,
        childCount: node.children.length,
        textLength: text.length,
        updatedAt: node.updatedAt?.toISOString()
      })

      for (const child of node.children) {
        visit(child, depth + 1, path)
      }
    }

    for (const root of roots) {
      visit(root, 0, [])
    }

    return outline
  }

  private flattenChunks(roots: TreeNode[]): CharacterNarrativeReadingChunk[] {
    const chunks: CharacterNarrativeReadingChunk[] = []

    const visit = (node: TreeNode, depth: number, parentPath: string[]): void => {
      const title = node.title || '新建文件'
      const path = [...parentPath, title]
      const text = htmlToReadableText(node.contentHtml)
      const textChunks = splitText(text)
      textChunks.forEach((chunk, index) => {
        chunks.push({
          chunkId: `${node.id}:${index}`,
          documentId: node.id,
          title,
          path,
          depth,
          chunkIndex: index,
          chunkCount: textChunks.length,
          text: chunk,
          textLength: chunk.length,
          updatedAt: node.updatedAt?.toISOString()
        })
      })

      for (const child of node.children) {
        visit(child, depth + 1, path)
      }
    }

    for (const root of roots) {
      visit(root, 0, [])
    }

    return chunks
  }

  async getReadingPlan(characterEntityId: string): Promise<CharacterNarrativeReadingPlan> {
    const { character, roots } = await this.loadTree(characterEntityId)
    const outline = this.flattenOutline(roots)

    return {
      character: {
        entityId: character.id,
        name: character.name,
        worldId: character.worldId
      },
      outline,
      totalDocuments: outline.length,
      totalReadableCharacters: outline.reduce((total, item) => total + item.textLength, 0),
      recommendedBatchMaxChars: DEFAULT_BATCH_CHARS,
      firstCursor: '0'
    }
  }

  async readBatch(input: {
    characterEntityId: string
    cursor?: string
    maxChars?: number
  }): Promise<CharacterNarrativeReadingBatch> {
    const { character, roots } = await this.loadTree(input.characterEntityId)
    const chunks = this.flattenChunks(roots)
    const startIndex = normalizeCursor(input.cursor)
    const maxChars = normalizeMaxChars(input.maxChars)
    const batch: CharacterNarrativeReadingChunk[] = []
    let returnedCharacters = 0
    let currentIndex = Math.min(startIndex, chunks.length)

    while (currentIndex < chunks.length) {
      const next = chunks[currentIndex]
      if (batch.length > 0 && returnedCharacters + next.textLength > maxChars) break
      batch.push(next)
      returnedCharacters += next.textLength
      currentIndex += 1
    }

    const hasMore = currentIndex < chunks.length

    return {
      character: {
        entityId: character.id,
        name: character.name,
        worldId: character.worldId
      },
      cursor: String(startIndex),
      nextCursor: hasMore ? String(currentIndex) : null,
      hasMore,
      batchIndexStart: startIndex,
      batchIndexEnd: currentIndex,
      totalChunks: chunks.length,
      returnedCharacters,
      chunks: batch
    }
  }
}

export const characterNarrativeReadingService = new CharacterNarrativeReadingService()
