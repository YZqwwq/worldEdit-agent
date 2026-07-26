import { randomUUID } from 'node:crypto'
import { IsNull } from 'typeorm'
import { AppDataSource } from '../../database'
import { WorldRecord } from '../../../share/entity/database/WorldRecord'
import { WorldEntityRecord } from '../../../share/entity/database/WorldEntityRecord'
import { WorldEntityDocumentRecord } from '../../../share/entity/database/WorldEntityDocumentRecord'
import type {
  CreateWorldEntityDocumentInput,
  DeleteWorldEntityDocumentInput,
  MoveWorldEntityDocumentInput,
  UpdateWorldEntityDocumentInput,
  WorldEntityDocumentOwnerRef,
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

export class WorldEntityDocumentRevisionConflictError extends Error {
  readonly code = 'DOCUMENT_REVISION_CONFLICT'

  constructor(
    readonly documentId: string,
    readonly expectedRevision: number,
    readonly currentRevision: number
  ) {
    super(
      `Document revision conflict: expected ${expectedRevision}, current ${currentRevision}`
    )
    this.name = 'WorldEntityDocumentRevisionConflictError'
  }
}

const toPayload = (record: WorldEntityDocumentRecord): WorldEntityDocumentPayload => ({
  id: record.id,
  ownerKind: record.ownerKind,
  worldId: record.worldId,
  ownerEntityId: record.ownerEntityId,
  parentDocumentId: record.parentDocumentId ?? null,
  title: record.title || DEFAULT_DOCUMENT_TITLE,
  contentHtml: record.contentHtml || '',
  contentFormat: 'html',
  sortKey: record.sortKey || '',
  revision: record.revision ?? 1,
  schemaVersion: record.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
  createdAt: record.createdAt?.toISOString(),
  updatedAt: record.updatedAt?.toISOString()
})

class WorldEntityDocumentService {
  private get worldRepo() {
    return AppDataSource.getRepository(WorldRecord)
  }

  private get entityRepo() {
    return AppDataSource.getRepository(WorldEntityRecord)
  }

  private get documentRepo() {
    return AppDataSource.getRepository(WorldEntityDocumentRecord)
  }

  private async normalizeOwner(owner: WorldEntityDocumentOwnerRef): Promise<{
    ownerKind: 'world' | 'entity'
    worldId: string
    ownerEntityId: string | null
  }> {
    const worldId = String(owner?.worldId || '').trim()
    if (!worldId) throw new Error('worldId is required')

    const world = await this.worldRepo.findOneBy({ id: worldId })
    if (!world) throw new Error(`World not found: ${worldId}`)

    if (owner.kind === 'world') {
      return { ownerKind: 'world', worldId, ownerEntityId: null }
    }

    const entityId = String(owner.entityId || '').trim()
    if (!entityId) throw new Error('entityId is required')
    const entity = await this.entityRepo.findOneBy({ id: entityId })
    if (!entity) throw new Error(`World entity not found: ${entityId}`)
    if (entity.worldId !== worldId) {
      throw new Error('Document owner entity must belong to the selected world')
    }
    if (!isWorldEntityDocumentOwnerType(entity.type)) {
      throw new Error(`World entity type "${entity.type}" cannot own documents`)
    }
    return { ownerKind: 'entity', worldId, ownerEntityId: entity.id }
  }

  private async assertParentDocument(
    owner: {
      ownerKind: 'world' | 'entity'
      worldId: string
      ownerEntityId: string | null
    },
    parentDocumentId: string | null | undefined
  ): Promise<string | null> {
    const normalizedParentId = String(parentDocumentId || '').trim()
    if (!normalizedParentId) return null

    const parent = await this.documentRepo.findOneBy({ id: normalizedParentId })
    if (!parent) throw new Error(`Parent document not found: ${normalizedParentId}`)
    if (
      parent.ownerKind !== owner.ownerKind ||
      parent.worldId !== owner.worldId ||
      parent.ownerEntityId !== owner.ownerEntityId
    ) {
      throw new Error('Parent document must belong to the same document owner')
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

  async listDocuments(ownerRef: WorldEntityDocumentOwnerRef): Promise<WorldEntityDocumentPayload[]> {
    const owner = await this.normalizeOwner(ownerRef)
    const documents = await this.documentRepo.find({
      where: {
        ownerKind: owner.ownerKind,
        worldId: owner.worldId,
        ownerEntityId: owner.ownerEntityId ?? IsNull()
      },
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
    const owner = await this.normalizeOwner(input.owner)
    const parentDocumentId = await this.assertParentDocument(owner, input.parentDocumentId)
    const record = this.documentRepo.create({
      id: randomUUID(),
      ...owner,
      parentDocumentId,
      title: normalizeDocumentTitle(input.title),
      contentHtml: normalizeContentHtml(input.contentHtml),
      contentFormat: 'html',
      sortKey: String(input.sortKey || '').trim() || createSortKey(),
      revision: 1,
      schemaVersion: DEFAULT_SCHEMA_VERSION
    })
    return toPayload(await this.documentRepo.save(record))
  }

  async updateDocument(input: UpdateWorldEntityDocumentInput): Promise<WorldEntityDocumentPayload> {
    const normalizedDocumentId = String(input.documentId || '').trim()
    if (!normalizedDocumentId) throw new Error('documentId is required')
    const document = await this.documentRepo.findOneBy({ id: normalizedDocumentId })
    if (!document) throw new Error(`Document not found: ${normalizedDocumentId}`)
    const expectedRevision = Number(input.expectedRevision)
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new Error('expectedRevision must be a positive integer')
    }
    if (document.revision !== expectedRevision) {
      throw new WorldEntityDocumentRevisionConflictError(
        document.id,
        expectedRevision,
        document.revision
      )
    }

    if (input.contentFormat !== undefined && input.contentFormat !== 'html') {
      throw new Error(`Unsupported document content format: ${input.contentFormat}`)
    }
    const updateResult = await this.documentRepo.update(
      { id: document.id, revision: expectedRevision },
      {
        title:
          input.title !== undefined
            ? normalizeDocumentTitle(input.title)
            : document.title,
        contentHtml:
          input.contentHtml !== undefined
            ? normalizeContentHtml(input.contentHtml)
            : document.contentHtml,
        contentFormat: 'html',
        revision: expectedRevision + 1
      }
    )
    if (updateResult.affected !== 1) {
      const current = await this.documentRepo.findOneBy({ id: document.id })
      throw new WorldEntityDocumentRevisionConflictError(
        document.id,
        expectedRevision,
        current?.revision ?? expectedRevision
      )
    }
    const updated = await this.documentRepo.findOneByOrFail({ id: document.id })
    return toPayload(updated)
  }

  async moveDocument(input: MoveWorldEntityDocumentInput): Promise<WorldEntityDocumentPayload> {
    const normalizedDocumentId = String(input.documentId || '').trim()
    if (!normalizedDocumentId) throw new Error('documentId is required')
    const document = await this.documentRepo.findOneBy({ id: normalizedDocumentId })
    if (!document) throw new Error(`Document not found: ${normalizedDocumentId}`)
    const expectedRevision = Number(input.expectedRevision)
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new Error('expectedRevision must be a positive integer')
    }
    if (document.revision !== expectedRevision) {
      throw new WorldEntityDocumentRevisionConflictError(
        document.id,
        expectedRevision,
        document.revision
      )
    }

    const nextParentId = await this.assertParentDocument(
      {
        ownerKind: document.ownerKind,
        worldId: document.worldId,
        ownerEntityId: document.ownerEntityId
      },
      input.parentDocumentId
    )
    if (nextParentId === document.id) throw new Error('Document cannot be moved under itself')
    if (nextParentId) {
      const descendantIds = await this.collectDescendantIds(document.id)
      if (descendantIds.includes(nextParentId)) {
        throw new Error('Document cannot be moved under one of its descendants')
      }
    }

    const updateResult = await this.documentRepo.update(
      { id: document.id, revision: expectedRevision },
      {
        parentDocumentId: nextParentId,
        sortKey: String(input.sortKey || '').trim() || document.sortKey || createSortKey(),
        revision: expectedRevision + 1
      }
    )
    if (updateResult.affected !== 1) {
      const current = await this.documentRepo.findOneBy({ id: document.id })
      throw new WorldEntityDocumentRevisionConflictError(
        document.id,
        expectedRevision,
        current?.revision ?? expectedRevision
      )
    }
    return toPayload(await this.documentRepo.findOneByOrFail({ id: document.id }))
  }

  async deleteDocument(input: DeleteWorldEntityDocumentInput): Promise<string[]> {
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
    return idsToDelete
  }
}

export const worldEntityDocumentService = new WorldEntityDocumentService()
