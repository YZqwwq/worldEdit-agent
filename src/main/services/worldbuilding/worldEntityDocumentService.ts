import { randomUUID } from 'node:crypto'
import { AppDataSource } from '../../database'
import { WorldEntityRecord } from '../../../share/entity/database/WorldEntityRecord'
import { WorldEntityDocumentRecord } from '../../../share/entity/database/WorldEntityDocumentRecord'
import type {
  CreateWorldEntityDocumentInput,
  DeleteWorldEntityDocumentInput,
  MoveWorldEntityDocumentInput,
  UpdateWorldEntityDocumentInput,
  WorldEntityDocumentPayload
} from '@share/cache/worldbuilding/worldEntityDocument'
import { isWorldEntityDocumentOwnerType } from '@share/cache/worldbuilding/worldEntityDocument'

const DEFAULT_SCHEMA_VERSION = 1
const DEFAULT_DOCUMENT_TITLE = '新建文件'

const normalizeDocumentTitle = (value: unknown): string => {
  const title = String(value || '').trim()
  return title.slice(0, 120) || DEFAULT_DOCUMENT_TITLE
}

const normalizeContentHtml = (value: unknown): string => String(value ?? '').slice(0, 40000)
const createSortKey = (): string => `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`

const toPayload = (record: WorldEntityDocumentRecord): WorldEntityDocumentPayload => ({
  id: record.id,
  ownerEntityId: record.ownerEntityId,
  parentDocumentId: record.parentDocumentId ?? null,
  title: record.title || DEFAULT_DOCUMENT_TITLE,
  contentHtml: record.contentHtml || '',
  contentFormat: 'html',
  sortKey: record.sortKey || '',
  schemaVersion: record.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
  createdAt: record.createdAt?.toISOString(),
  updatedAt: record.updatedAt?.toISOString()
})

class WorldEntityDocumentService {
  private get entityRepo() {
    return AppDataSource.getRepository(WorldEntityRecord)
  }

  private get documentRepo() {
    return AppDataSource.getRepository(WorldEntityDocumentRecord)
  }

  private async assertOwnerEntity(ownerEntityId: string): Promise<WorldEntityRecord> {
    const normalizedId = String(ownerEntityId || '').trim()
    if (!normalizedId) throw new Error('ownerEntityId is required')

    const entity = await this.entityRepo.findOneBy({ id: normalizedId })
    if (!entity) throw new Error(`World entity not found: ${normalizedId}`)
    if (!isWorldEntityDocumentOwnerType(entity.type)) {
      throw new Error(`World entity type "${entity.type}" cannot own documents`)
    }
    return entity
  }

  private async assertParentDocument(
    ownerEntityId: string,
    parentDocumentId: string | null | undefined
  ): Promise<string | null> {
    const normalizedParentId = String(parentDocumentId || '').trim()
    if (!normalizedParentId) return null

    const parent = await this.documentRepo.findOneBy({ id: normalizedParentId })
    if (!parent) throw new Error(`Parent document not found: ${normalizedParentId}`)
    if (parent.ownerEntityId !== ownerEntityId) {
      throw new Error('Parent document must belong to the same world entity')
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

  async listDocuments(ownerEntityId: string): Promise<WorldEntityDocumentPayload[]> {
    const owner = await this.assertOwnerEntity(ownerEntityId)
    const documents = await this.documentRepo.find({
      where: { ownerEntityId: owner.id },
      order: { parentDocumentId: 'ASC', sortKey: 'ASC', createdAt: 'ASC' }
    })
    return documents.map(toPayload)
  }

  async getDocument(documentId: string): Promise<WorldEntityDocumentPayload | null> {
    const normalizedDocumentId = String(documentId || '').trim()
    if (!normalizedDocumentId) throw new Error('documentId is required')
    const document = await this.documentRepo.findOneBy({ id: normalizedDocumentId })
    return document ? toPayload(document) : null
  }

  async createDocument(input: CreateWorldEntityDocumentInput): Promise<WorldEntityDocumentPayload> {
    const owner = await this.assertOwnerEntity(input.ownerEntityId)
    const parentDocumentId = await this.assertParentDocument(owner.id, input.parentDocumentId)
    const record = this.documentRepo.create({
      id: randomUUID(),
      ownerEntityId: owner.id,
      parentDocumentId,
      title: normalizeDocumentTitle(input.title),
      contentHtml: normalizeContentHtml(input.contentHtml),
      contentFormat: 'html',
      sortKey: String(input.sortKey || '').trim() || createSortKey(),
      schemaVersion: DEFAULT_SCHEMA_VERSION
    })
    return toPayload(await this.documentRepo.save(record))
  }

  async updateDocument(input: UpdateWorldEntityDocumentInput): Promise<WorldEntityDocumentPayload> {
    const normalizedDocumentId = String(input.documentId || '').trim()
    if (!normalizedDocumentId) throw new Error('documentId is required')
    const document = await this.documentRepo.findOneBy({ id: normalizedDocumentId })
    if (!document) throw new Error(`Document not found: ${normalizedDocumentId}`)

    if (input.title !== undefined) document.title = normalizeDocumentTitle(input.title)
    if (input.contentHtml !== undefined)
      document.contentHtml = normalizeContentHtml(input.contentHtml)
    if (input.contentFormat !== undefined && input.contentFormat !== 'html') {
      throw new Error(`Unsupported document content format: ${input.contentFormat}`)
    }
    document.contentFormat = 'html'
    return toPayload(await this.documentRepo.save(document))
  }

  async moveDocument(input: MoveWorldEntityDocumentInput): Promise<WorldEntityDocumentPayload> {
    const normalizedDocumentId = String(input.documentId || '').trim()
    if (!normalizedDocumentId) throw new Error('documentId is required')
    const document = await this.documentRepo.findOneBy({ id: normalizedDocumentId })
    if (!document) throw new Error(`Document not found: ${normalizedDocumentId}`)

    const nextParentId = await this.assertParentDocument(
      document.ownerEntityId,
      input.parentDocumentId
    )
    if (nextParentId === document.id) throw new Error('Document cannot be moved under itself')
    if (nextParentId) {
      const descendantIds = await this.collectDescendantIds(document.id)
      if (descendantIds.includes(nextParentId)) {
        throw new Error('Document cannot be moved under one of its descendants')
      }
    }

    document.parentDocumentId = nextParentId
    document.sortKey = String(input.sortKey || '').trim() || document.sortKey || createSortKey()
    return toPayload(await this.documentRepo.save(document))
  }

  async deleteDocument(input: DeleteWorldEntityDocumentInput): Promise<void> {
    const normalizedDocumentId = String(input.documentId || '').trim()
    if (!normalizedDocumentId) throw new Error('documentId is required')
    const document = await this.documentRepo.findOneBy({ id: normalizedDocumentId })
    if (!document) throw new Error(`Document not found: ${normalizedDocumentId}`)

    const descendantIds = await this.collectDescendantIds(document.id)
    if (descendantIds.length > 0 && !input.recursive) {
      throw new Error('Document has children; pass recursive=true to delete the subtree')
    }
    const idsToDelete = [document.id, ...descendantIds]
    await this.documentRepo
      .createQueryBuilder()
      .delete()
      .where('id IN (:...idsToDelete)', { idsToDelete })
      .execute()
  }
}

export const worldEntityDocumentService = new WorldEntityDocumentService()
