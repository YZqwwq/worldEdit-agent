import { randomUUID } from 'node:crypto'
import type { EntityManager } from 'typeorm'
import { AppDataSource } from '../../database'
import { WorldRecord } from '../../../share/entity/database/WorldRecord'
import { WorldEntityDocumentRecord } from '../../../share/entity/database/WorldEntityDocumentRecord'
import type {
  CreateWorldEntityDocumentInput,
  DeleteWorldEntityDocumentInput,
  MoveWorldEntityDocumentInput,
  UpdateWorldEntityDocumentInput,
  WorldEntityDocumentPayload
} from '@share/cache/worldbuilding/worldEntityDocument'
import { persistCompletedToolEffect } from '../toolEffects/toolEffectReceiptService'
import { getToolEffectExecutionContext } from '../toolEffects/toolEffectExecutionContext'
import {
  commitWorldDocumentChangeSetWithManager,
  ensureWorldDocumentHistoryBranchWithManager,
  stageWorldDocumentChangeWithManager,
  type WorldDocumentEditSource
} from './worldDocumentVersionService'

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
  editSource?: WorldDocumentEditSource
  diffRef?: string
}

export type WorldDocumentHistoryOptions = {
  changeSetId: string
  deferCommit?: boolean
  editSource?: WorldDocumentEditSource
}

const resolveHistoryContext = (
  effect?: WorldDocumentToolEffectInput,
  history?: WorldDocumentHistoryOptions
): {
  changeSetId: string
  deferCommit: boolean
  origin: 'agent' | 'human'
  editSource?: WorldDocumentEditSource
} => {
  const toolContext = getToolEffectExecutionContext()
  return {
    changeSetId: history?.changeSetId ?? toolContext?.changeSetId ?? `human:${randomUUID()}`,
    deferCommit: history?.deferCommit ?? Boolean(toolContext),
    origin: toolContext ? 'agent' : 'human',
    editSource: history?.editSource ?? effect?.editSource
  }
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
  worldId: record.worldId,
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

  private get documentRepo() {
    return AppDataSource.getRepository(WorldEntityDocumentRecord)
  }

  private async assertWorld(worldIdValue: unknown, manager?: EntityManager): Promise<string> {
    const worldId = String(worldIdValue || '').trim()
    if (!worldId) throw new Error('worldId is required')

    const worldRepo = manager?.getRepository(WorldRecord) ?? this.worldRepo
    const world = await worldRepo.findOneBy({ id: worldId })
    if (!world) throw new WorldEntityDocumentNotFoundError('world', worldId)
    return worldId
  }

  private async assertParentDocument(
    worldId: string,
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
    if (parent.worldId !== worldId) {
      throw new WorldEntityDocumentConstraintError(
        'Parent document must belong to the same world',
        'PARENT_WORLD_MISMATCH',
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

  async listDocuments(worldIdValue: string): Promise<WorldEntityDocumentPayload[]> {
    const worldId = await this.assertWorld(worldIdValue)
    const documents = await this.documentRepo.find({
      where: { worldId },
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
    effect?: WorldDocumentToolEffectInput,
    history?: WorldDocumentHistoryOptions
  ): Promise<WorldEntityDocumentPayload> {
    return AppDataSource.transaction(async (manager) => {
      const documentRepo = manager.getRepository(WorldEntityDocumentRecord)
      const worldId = await this.assertWorld(input.worldId, manager)
      const parentDocumentId = await this.assertParentDocument(
        worldId,
        input.parentDocumentId,
        manager
      )
      await ensureWorldDocumentHistoryBranchWithManager(manager, worldId)
      const record = documentRepo.create({
        id: randomUUID(),
        worldId,
        parentDocumentId,
        title: normalizeDocumentTitle(input.title),
        contentHtml: normalizeContentHtml(input.contentHtml),
        contentFormat: 'html',
        sortKey: String(input.sortKey || '').trim() || createSortKey(),
        revision: 1,
        schemaVersion: DEFAULT_SCHEMA_VERSION
      })
      const savedRecord = await documentRepo.save(record)
      const document = toPayload(savedRecord)
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
      const historyContext = resolveHistoryContext(effect, history)
      await stageWorldDocumentChangeWithManager(manager, {
        changeSetId: historyContext.changeSetId,
        operation: 'create',
        before: null,
        after: savedRecord,
        source: historyContext.editSource ?? {
          format: 'html_editor',
          content: savedRecord.contentHtml
        },
        summary: effect?.summary ?? `创建文档「${document.title}」`
      })
      if (!historyContext.deferCommit) {
        await commitWorldDocumentChangeSetWithManager(
          manager,
          historyContext.changeSetId,
          historyContext.origin
        )
      }
      return document
    })
  }

  async updateDocument(
    input: UpdateWorldEntityDocumentInput,
    effect?: WorldDocumentToolEffectInput,
    history?: WorldDocumentHistoryOptions
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
      const nextTitle =
        input.title !== undefined ? normalizeDocumentTitle(input.title) : document.title
      const nextContentHtml =
        input.contentHtml !== undefined
          ? normalizeContentHtml(input.contentHtml)
          : document.contentHtml
      if (nextTitle === document.title && nextContentHtml === document.contentHtml) {
        return toPayload(document)
      }
      await ensureWorldDocumentHistoryBranchWithManager(manager, document.worldId)
      const updateResult = await documentRepo.update(
        { id: document.id, revision: expectedRevision },
        {
          title: nextTitle,
          contentHtml: nextContentHtml,
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
      const updatedRecord = await documentRepo.findOneByOrFail({ id: document.id })
      const updated = toPayload(updatedRecord)
      if (effect) {
        await persistCompletedToolEffect(manager, {
          operation: effect.operation,
          subject: { type: 'document', id: updated.id, label: updated.title },
          beforeRevision: expectedRevision,
          afterRevision: updated.revision,
          summary: effect.summary,
          evidenceRef: `document:${updated.id}`,
          diffRef: effect.diffRef,
          payload: { ...effect.payload, documentId: updated.id, revision: updated.revision },
          compensatable: effect.compensatable
        })
      }
      const historyContext = resolveHistoryContext(effect, history)
      await stageWorldDocumentChangeWithManager(manager, {
        changeSetId: historyContext.changeSetId,
        operation: 'update',
        before: document,
        after: updatedRecord,
        source:
          input.contentHtml !== undefined
            ? (historyContext.editSource ?? {
                format: 'html_editor',
                content: updatedRecord.contentHtml
              })
            : undefined,
        summary: effect?.summary ?? `更新文档「${updated.title}」`
      })
      if (!historyContext.deferCommit) {
        await commitWorldDocumentChangeSetWithManager(
          manager,
          historyContext.changeSetId,
          historyContext.origin
        )
      }
      return updated
    })
  }

  async moveDocument(
    input: MoveWorldEntityDocumentInput,
    effect?: WorldDocumentToolEffectInput,
    history?: WorldDocumentHistoryOptions
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
        document.worldId,
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

      await ensureWorldDocumentHistoryBranchWithManager(manager, document.worldId)

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
      const updatedRecord = await documentRepo.findOneByOrFail({ id: document.id })
      const updated = toPayload(updatedRecord)
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
      const historyContext = resolveHistoryContext(effect, history)
      await stageWorldDocumentChangeWithManager(manager, {
        changeSetId: historyContext.changeSetId,
        operation: 'move',
        before: document,
        after: updatedRecord,
        summary: effect?.summary ?? `移动文档「${updated.title}」`
      })
      if (!historyContext.deferCommit) {
        await commitWorldDocumentChangeSetWithManager(
          manager,
          historyContext.changeSetId,
          historyContext.origin
        )
      }
      return updated
    })
  }

  async deleteDocument(
    input: DeleteWorldEntityDocumentInput,
    effect?: WorldDocumentToolEffectInput,
    history?: WorldDocumentHistoryOptions
  ): Promise<string[]> {
    return AppDataSource.transaction(async (manager) => {
      const documentRepo = manager.getRepository(WorldEntityDocumentRecord)
      const normalizedDocumentId = String(input.documentId || '').trim()
      if (!normalizedDocumentId) throw new Error('documentId is required')
      const document = await documentRepo.findOneBy({ id: normalizedDocumentId })
      if (!document) throw new WorldEntityDocumentNotFoundError('document', normalizedDocumentId)

      const descendantIds = await this.collectDescendantIds(document.id, manager)
      if (descendantIds.length > 0 && !input.recursive) {
        throw new WorldEntityDocumentConstraintError(
          'Document has children; pass recursive=true to delete the subtree',
          'RECURSIVE_DELETE_REQUIRED',
          { descendantCount: descendantIds.length }
        )
      }
      const idsToDelete = [document.id, ...descendantIds]
      const deletedRecords = await documentRepo.findByIds(idsToDelete)
      const historyContext = resolveHistoryContext(effect, history)
      await ensureWorldDocumentHistoryBranchWithManager(manager, document.worldId)
      await documentRepo
        .createQueryBuilder()
        .delete()
        .where('id IN (:...idsToDelete)', { idsToDelete })
        .execute()
      for (const deletedRecord of deletedRecords) {
        await stageWorldDocumentChangeWithManager(manager, {
          changeSetId: historyContext.changeSetId,
          operation: 'delete',
          before: deletedRecord,
          after: null,
          summary: effect?.summary ?? `删除文档「${deletedRecord.title}」`
        })
      }
      if (effect) {
        await persistCompletedToolEffect(manager, {
          operation: effect.operation,
          subject: { type: 'document', id: document.id, label: document.title },
          beforeRevision: document.revision,
          summary: effect.summary,
          evidenceRef: `document:${document.id}`,
          payload: { ...effect.payload, documentId: document.id, deletedDocumentIds: idsToDelete },
          compensatable: effect.compensatable
        })
      }
      if (!historyContext.deferCommit) {
        await commitWorldDocumentChangeSetWithManager(
          manager,
          historyContext.changeSetId,
          historyContext.origin
        )
      }
      return idsToDelete
    })
  }
}

export const worldEntityDocumentService = new WorldEntityDocumentService()
