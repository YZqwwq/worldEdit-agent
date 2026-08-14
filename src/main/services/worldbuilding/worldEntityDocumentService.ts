import { randomUUID } from 'node:crypto'
import { IsNull, type EntityManager } from 'typeorm'
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
import { persistCompletedToolEffect } from '../toolEffects/toolEffectReceiptService'

const DEFAULT_SCHEMA_VERSION = 1
const DEFAULT_DOCUMENT_TITLE = '新建文件'

const normalizeDocumentTitle = (value: unknown): string => {
  const title = String(value || '').trim()
  return title.slice(0, 120) || DEFAULT_DOCUMENT_TITLE
}

const normalizeContentHtml = (value: unknown): string => String(value ?? '').slice(0, 40000)
const createSortKey = (): string => `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`

export type WorldDocumentToolEffectInput = {
  operation: string
  summary: string
  payload?: Record<string, unknown>
  compensatable?: boolean
}

export class WorldEntityDocumentRevisionConflictError extends Error {
  readonly code = 'DOCUMENT_REVISION_CONFLICT'

  constructor(
    readonly documentId: string,
    readonly expectedRevision: number,
    readonly currentRevision: number
  ) {
    super(`Document revision conflict: expected ${expectedRevision}, current ${currentRevision}`)
    this.name = 'WorldEntityDocumentRevisionConflictError'
  }
}

export class WorldEntityDocumentNotFoundError extends Error {
  readonly code = 'NOT_FOUND'
  readonly retryable = false

  constructor(
    readonly resourceType: 'world' | 'entity' | 'document' | 'parent_document',
    readonly resourceId: string
  ) {
    super(`${resourceType} not found: ${resourceId}`)
    this.name = 'WorldEntityDocumentNotFoundError'
  }
}

export class WorldEntityDocumentConstraintError extends Error {
  readonly code = 'INVALID_TOOL_INPUT'
  readonly retryable = true

  constructor(
    message: string,
    readonly constraint: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'WorldEntityDocumentConstraintError'
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

  private async normalizeOwner(
    owner: WorldEntityDocumentOwnerRef,
    manager?: EntityManager
  ): Promise<{
    ownerKind: 'world' | 'entity'
    worldId: string
    ownerEntityId: string | null
  }> {
    const worldId = String(owner?.worldId || '').trim()
    if (!worldId) throw new Error('worldId is required')

    const worldRepo = manager?.getRepository(WorldRecord) ?? this.worldRepo
    const entityRepo = manager?.getRepository(WorldEntityRecord) ?? this.entityRepo
    const world = await worldRepo.findOneBy({ id: worldId })
    if (!world) throw new WorldEntityDocumentNotFoundError('world', worldId)

    if (owner.kind === 'world') {
      return { ownerKind: 'world', worldId, ownerEntityId: null }
    }

    const entityId = String(owner.entityId || '').trim()
    if (!entityId) throw new Error('entityId is required')
    const entity = await entityRepo.findOneBy({ id: entityId })
    if (!entity) throw new WorldEntityDocumentNotFoundError('entity', entityId)
    if (entity.worldId !== worldId) {
      throw new WorldEntityDocumentConstraintError(
        'Document owner entity must belong to the selected world',
        'OWNER_WORLD_MISMATCH',
        { entityId, worldId, entityWorldId: entity.worldId }
      )
    }
    if (!isWorldEntityDocumentOwnerType(entity.type)) {
      throw new WorldEntityDocumentConstraintError(
        `World entity type "${entity.type}" cannot own documents`,
        'UNSUPPORTED_OWNER_TYPE',
        { entityId, entityType: entity.type }
      )
    }
    return { ownerKind: 'entity', worldId, ownerEntityId: entity.id }
  }

  private async assertParentDocument(
    owner: {
      ownerKind: 'world' | 'entity'
      worldId: string
      ownerEntityId: string | null
    },
    parentDocumentId: string | null | undefined,
    manager?: EntityManager
  ): Promise<string | null> {
    const normalizedParentId = String(parentDocumentId || '').trim()
    if (!normalizedParentId) return null

    const documentRepo = manager?.getRepository(WorldEntityDocumentRecord) ?? this.documentRepo
    const parent = await documentRepo.findOneBy({ id: normalizedParentId })
    if (!parent) {
      throw new WorldEntityDocumentNotFoundError('parent_document', normalizedParentId)
    }
    if (
      parent.ownerKind !== owner.ownerKind ||
      parent.worldId !== owner.worldId ||
      parent.ownerEntityId !== owner.ownerEntityId
    ) {
      throw new WorldEntityDocumentConstraintError(
        'Parent document must belong to the same document owner',
        'PARENT_OWNER_MISMATCH',
        { parentDocumentId: normalizedParentId }
      )
    }
    return parent.id
  }

  private async collectDescendantIds(
    documentId: string,
    manager?: EntityManager
  ): Promise<string[]> {
    const descendants: string[] = []
    const queue = [documentId]
    const documentRepo = manager?.getRepository(WorldEntityDocumentRecord) ?? this.documentRepo

    while (queue.length > 0) {
      const currentId = queue.shift()
      if (!currentId) continue
      const children = await documentRepo.find({
        where: { parentDocumentId: currentId },
        select: ['id']
      })
      const childIds = children.map((child) => child.id)
      descendants.push(...childIds)
      queue.push(...childIds)
    }
    return descendants
  }

  async listDocuments(
    ownerRef: WorldEntityDocumentOwnerRef
  ): Promise<WorldEntityDocumentPayload[]> {
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

  async createDocument(
    input: CreateWorldEntityDocumentInput,
    effect?: WorldDocumentToolEffectInput
  ): Promise<WorldEntityDocumentPayload> {
    return AppDataSource.transaction(async (manager) => {
      const documentRepo = manager.getRepository(WorldEntityDocumentRecord)
      const owner = await this.normalizeOwner(input.owner, manager)
      const parentDocumentId = await this.assertParentDocument(
        owner,
        input.parentDocumentId,
        manager
      )
      const record = documentRepo.create({
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
      const document = toPayload(await documentRepo.save(record))
      if (effect) {
        await persistCompletedToolEffect(manager, {
          operation: effect.operation,
          subject: { type: 'document', id: document.id, label: document.title },
          afterRevision: document.revision,
          summary: effect.summary,
          evidenceRef: `document:${document.id}`,
          payload: { ...effect.payload, documentId: document.id, revision: document.revision },
          compensatable: effect.compensatable
        })
      }
      return document
    })
  }

  async updateDocument(
    input: UpdateWorldEntityDocumentInput,
    effect?: WorldDocumentToolEffectInput
  ): Promise<WorldEntityDocumentPayload> {
    return AppDataSource.transaction(async (manager) => {
      const documentRepo = manager.getRepository(WorldEntityDocumentRecord)
      const normalizedDocumentId = String(input.documentId || '').trim()
      if (!normalizedDocumentId) throw new Error('documentId is required')
      const document = await documentRepo.findOneBy({ id: normalizedDocumentId })
      if (!document) throw new WorldEntityDocumentNotFoundError('document', normalizedDocumentId)
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
      const updateResult = await documentRepo.update(
        { id: document.id, revision: expectedRevision },
        {
          title: input.title !== undefined ? normalizeDocumentTitle(input.title) : document.title,
          contentHtml:
            input.contentHtml !== undefined
              ? normalizeContentHtml(input.contentHtml)
              : document.contentHtml,
          contentFormat: 'html',
          revision: expectedRevision + 1
        }
      )
      if (updateResult.affected !== 1) {
        const current = await documentRepo.findOneBy({ id: document.id })
        throw new WorldEntityDocumentRevisionConflictError(
          document.id,
          expectedRevision,
          current?.revision ?? expectedRevision
        )
      }
      const updated = toPayload(await documentRepo.findOneByOrFail({ id: document.id }))
      if (effect) {
        await persistCompletedToolEffect(manager, {
          operation: effect.operation,
          subject: { type: 'document', id: updated.id, label: updated.title },
          beforeRevision: expectedRevision,
          afterRevision: updated.revision,
          summary: effect.summary,
          evidenceRef: `document:${updated.id}`,
          payload: { ...effect.payload, documentId: updated.id, revision: updated.revision },
          compensatable: effect.compensatable
        })
      }
      return updated
    })
  }

  async moveDocument(
    input: MoveWorldEntityDocumentInput,
    effect?: WorldDocumentToolEffectInput
  ): Promise<WorldEntityDocumentPayload> {
    return AppDataSource.transaction(async (manager) => {
      const documentRepo = manager.getRepository(WorldEntityDocumentRecord)
      const normalizedDocumentId = String(input.documentId || '').trim()
      if (!normalizedDocumentId) throw new Error('documentId is required')
      const document = await documentRepo.findOneBy({ id: normalizedDocumentId })
      if (!document) throw new WorldEntityDocumentNotFoundError('document', normalizedDocumentId)
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
        input.parentDocumentId,
        manager
      )
      if (nextParentId === document.id) {
        throw new WorldEntityDocumentConstraintError(
          'Document cannot be moved under itself',
          'SELF_PARENT'
        )
      }
      if (nextParentId) {
        const descendantIds = await this.collectDescendantIds(document.id, manager)
        if (descendantIds.includes(nextParentId)) {
          throw new WorldEntityDocumentConstraintError(
            'Document cannot be moved under one of its descendants',
            'DESCENDANT_PARENT',
            { parentDocumentId: nextParentId }
          )
        }
      }

      const updateResult = await documentRepo.update(
        { id: document.id, revision: expectedRevision },
        {
          parentDocumentId: nextParentId,
          sortKey: String(input.sortKey || '').trim() || document.sortKey || createSortKey(),
          revision: expectedRevision + 1
        }
      )
      if (updateResult.affected !== 1) {
        const current = await documentRepo.findOneBy({ id: document.id })
        throw new WorldEntityDocumentRevisionConflictError(
          document.id,
          expectedRevision,
          current?.revision ?? expectedRevision
        )
      }
      const updated = toPayload(await documentRepo.findOneByOrFail({ id: document.id }))
      if (effect) {
        await persistCompletedToolEffect(manager, {
          operation: effect.operation,
          subject: { type: 'document', id: updated.id, label: updated.title },
          beforeRevision: expectedRevision,
          afterRevision: updated.revision,
          summary: effect.summary,
          evidenceRef: `document:${updated.id}`,
          payload: {
            ...effect.payload,
            documentId: updated.id,
            parentDocumentId: updated.parentDocumentId,
            revision: updated.revision
          },
          compensatable: effect.compensatable
        })
      }
      return updated
    })
  }

  async deleteDocument(input: DeleteWorldEntityDocumentInput): Promise<string[]> {
    const normalizedDocumentId = String(input.documentId || '').trim()
    if (!normalizedDocumentId) throw new Error('documentId is required')
    const document = await this.documentRepo.findOneBy({ id: normalizedDocumentId })
    if (!document) throw new WorldEntityDocumentNotFoundError('document', normalizedDocumentId)

    const descendantIds = await this.collectDescendantIds(document.id)
    if (descendantIds.length > 0 && !input.recursive) {
      throw new WorldEntityDocumentConstraintError(
        'Document has children; pass recursive=true to delete the subtree',
        'RECURSIVE_DELETE_REQUIRED',
        { descendantCount: descendantIds.length }
      )
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
