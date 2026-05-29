import { randomUUID } from 'node:crypto'
import { AppDataSource } from '../../database'
import { WorldEntityRecord } from '../../../share/entity/database/WorldEntityRecord'
import { CharacterNarrativeDocumentRecord } from '../../../share/entity/database/CharacterNarrativeDocumentRecord'
import type {
  CharacterNarrativeDocumentPayload,
  CreateCharacterNarrativeDocumentInput,
  DeleteCharacterNarrativeDocumentInput,
  MoveCharacterNarrativeDocumentInput,
  UpdateCharacterNarrativeDocumentInput
} from '@share/cache/worldbuilding/characterNarrativeDocument'

const DEFAULT_SCHEMA_VERSION = 1
const DEFAULT_DOCUMENT_TITLE = '新建文件'

const normalizeDocumentTitle = (value: unknown): string => {
  const title = String(value || '').trim()
  return title.slice(0, 120) || DEFAULT_DOCUMENT_TITLE
}

const normalizeContentHtml = (value: unknown): string => String(value ?? '').slice(0, 40000)

const createSortKey = (): string => `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`

const toPayload = (record: CharacterNarrativeDocumentRecord): CharacterNarrativeDocumentPayload => ({
  id: record.id,
  characterEntityId: record.characterEntityId,
  parentDocumentId: record.parentDocumentId ?? null,
  title: record.title || DEFAULT_DOCUMENT_TITLE,
  contentHtml: record.contentHtml || '',
  contentFormat: 'html',
  sortKey: record.sortKey || '',
  schemaVersion: record.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
  createdAt: record.createdAt?.toISOString(),
  updatedAt: record.updatedAt?.toISOString()
})

class CharacterNarrativeDocumentService {
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
      throw new Error(`Narrative documents require a character entity, received "${entity.type}"`)
    }

    return entity
  }

  private async assertParentDocument(
    characterEntityId: string,
    parentDocumentId: string | null | undefined
  ): Promise<string | null> {
    const normalizedParentId = String(parentDocumentId || '').trim()
    if (!normalizedParentId) return null

    const parent = await this.documentRepo.findOneBy({ id: normalizedParentId })
    if (!parent) throw new Error(`Parent narrative document not found: ${normalizedParentId}`)
    if (parent.characterEntityId !== characterEntityId) {
      throw new Error('Parent narrative document must belong to the same character')
    }

    return parent.id
  }

  private async collectDescendantIds(documentId: string): Promise<string[]> {
    const descendants: string[] = []
    const queue = [documentId]

    while (queue.length > 0) {
      const currentId = queue.shift()
      if (!currentId) continue

      const children = await this.documentRepo.find({
        where: { parentDocumentId: currentId },
        select: ['id']
      })
      const childIds = children.map((child) => child.id)
      descendants.push(...childIds)
      queue.push(...childIds)
    }

    return descendants
  }

  async listDocuments(characterEntityId: string): Promise<CharacterNarrativeDocumentPayload[]> {
    const character = await this.assertCharacterEntity(characterEntityId)
    const documents = await this.documentRepo.find({
      where: { characterEntityId: character.id },
      order: {
        parentDocumentId: 'ASC',
        sortKey: 'ASC',
        createdAt: 'ASC'
      }
    })

    return documents.map(toPayload)
  }

  async getDocument(documentId: string): Promise<CharacterNarrativeDocumentPayload | null> {
    const normalizedDocumentId = String(documentId || '').trim()
    if (!normalizedDocumentId) throw new Error('documentId is required')

    const document = await this.documentRepo.findOneBy({ id: normalizedDocumentId })
    return document ? toPayload(document) : null
  }

  async createDocument(
    input: CreateCharacterNarrativeDocumentInput
  ): Promise<CharacterNarrativeDocumentPayload> {
    const character = await this.assertCharacterEntity(input.characterEntityId)
    const parentDocumentId = await this.assertParentDocument(character.id, input.parentDocumentId)

    const record = this.documentRepo.create({
      id: randomUUID(),
      characterEntityId: character.id,
      parentDocumentId,
      title: normalizeDocumentTitle(input.title),
      contentHtml: normalizeContentHtml(input.contentHtml),
      contentFormat: 'html',
      sortKey: String(input.sortKey || '').trim() || createSortKey(),
      schemaVersion: DEFAULT_SCHEMA_VERSION
    })

    const saved = await this.documentRepo.save(record)
    return toPayload(saved)
  }

  async updateDocument(
    input: UpdateCharacterNarrativeDocumentInput
  ): Promise<CharacterNarrativeDocumentPayload> {
    const normalizedDocumentId = String(input.documentId || '').trim()
    if (!normalizedDocumentId) throw new Error('documentId is required')

    const document = await this.documentRepo.findOneBy({ id: normalizedDocumentId })
    if (!document) throw new Error(`Narrative document not found: ${normalizedDocumentId}`)

    if (input.title !== undefined) {
      document.title = normalizeDocumentTitle(input.title)
    }
    if (input.contentHtml !== undefined) {
      document.contentHtml = normalizeContentHtml(input.contentHtml)
    }
    if (input.contentFormat !== undefined && input.contentFormat !== 'html') {
      throw new Error(`Unsupported narrative content format: ${input.contentFormat}`)
    }

    document.contentFormat = 'html'
    const saved = await this.documentRepo.save(document)
    return toPayload(saved)
  }

  async moveDocument(
    input: MoveCharacterNarrativeDocumentInput
  ): Promise<CharacterNarrativeDocumentPayload> {
    const normalizedDocumentId = String(input.documentId || '').trim()
    if (!normalizedDocumentId) throw new Error('documentId is required')

    const document = await this.documentRepo.findOneBy({ id: normalizedDocumentId })
    if (!document) throw new Error(`Narrative document not found: ${normalizedDocumentId}`)

    const nextParentId = await this.assertParentDocument(
      document.characterEntityId,
      input.parentDocumentId
    )
    if (nextParentId === document.id) {
      throw new Error('Narrative document cannot be moved under itself')
    }

    if (nextParentId) {
      const descendantIds = await this.collectDescendantIds(document.id)
      if (descendantIds.includes(nextParentId)) {
        throw new Error('Narrative document cannot be moved under one of its descendants')
      }
    }

    document.parentDocumentId = nextParentId
    document.sortKey = String(input.sortKey || '').trim() || document.sortKey || createSortKey()

    const saved = await this.documentRepo.save(document)
    return toPayload(saved)
  }

  async deleteDocument(input: DeleteCharacterNarrativeDocumentInput): Promise<void> {
    const normalizedDocumentId = String(input.documentId || '').trim()
    if (!normalizedDocumentId) throw new Error('documentId is required')

    const document = await this.documentRepo.findOneBy({ id: normalizedDocumentId })
    if (!document) throw new Error(`Narrative document not found: ${normalizedDocumentId}`)

    const descendantIds = await this.collectDescendantIds(document.id)
    if (descendantIds.length > 0 && !input.recursive) {
      throw new Error('Narrative document has children; pass recursive=true to delete the subtree')
    }

    const idsToDelete = [document.id, ...descendantIds]
    await this.documentRepo
      .createQueryBuilder()
      .delete()
      .where('id IN (:...idsToDelete)', { idsToDelete })
      .execute()
  }
}

export const characterNarrativeDocumentService = new CharacterNarrativeDocumentService()
