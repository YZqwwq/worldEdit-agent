import { createHash, randomUUID } from 'node:crypto'
import { DataSource, EntityManager, In } from 'typeorm'
import { AgentWorldCognitionNodeRecord } from '../../../share/entity/database/AgentWorldCognitionNodeRecord'
import { AgentWorldCognitionSpaceRecord } from '../../../share/entity/database/AgentWorldCognitionSpaceRecord'
import { WorldEntityDocumentRecord } from '../../../share/entity/database/WorldEntityDocumentRecord'
import { WorldRecord } from '../../../share/entity/database/WorldRecord'
import {
  MAX_WORLD_COGNITION_DOCUMENT_REFS,
  MAX_WORLD_COGNITION_MARKDOWN_LENGTH,
  type AgentWorldCognitionNodeKind,
  type AgentWorldCognitionNodeStatus,
  type WorldCognitionDocumentRef
} from '@share/cache/worldbuilding/agentWorldCognition'

export const MAIN_AGENT_COGNITION_OWNER_ID = 'main-agent'
export { MAX_WORLD_COGNITION_DOCUMENT_REFS, MAX_WORLD_COGNITION_MARKDOWN_LENGTH }
export type { WorldCognitionDocumentRef }

export type AgentWorldCognitionNodePayload = {
  id: string
  worldId: string
  parentId: string | null
  parentTitle?: string
  nodeKind: AgentWorldCognitionNodeKind
  title: string
  markdown: string
  documentRefs: WorldCognitionDocumentRef[]
  revision: number
  status: AgentWorldCognitionNodeStatus
  createdAt?: string
  updatedAt?: string
}

export type SaveAgentWorldCognitionNodeInput = {
  agentId: string
  worldId: string
  nodeId?: string
  expectedRevision?: number
  parentId: string | null
  nodeKind: AgentWorldCognitionNodeKind
  title: string
  markdown: string
  documentRefs: WorldCognitionDocumentRef[]
  status?: AgentWorldCognitionNodeStatus
}

export class AgentWorldCognitionError extends Error {
  constructor(
    readonly code:
      | 'WORLD_NOT_FOUND'
      | 'NODE_NOT_FOUND'
      | 'PARENT_NOT_FOUND'
      | 'INVALID_PARENT'
      | 'DOCUMENT_NOT_FOUND'
      | 'DOCUMENT_WORLD_MISMATCH'
      | 'DOCUMENT_REVISION_CONFLICT'
      | 'NODE_REVISION_CONFLICT',
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message)
    this.name = 'AgentWorldCognitionError'
  }
}

const normalizeRequiredText = (value: unknown, label: string, maxLength: number): string => {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${label} is required`)
  if (normalized.length > maxLength) throw new Error(`${label} exceeds ${maxLength} characters`)
  return normalized
}

const parseDocumentRefs = (value: string): WorldCognitionDocumentRef[] => {
  try {
    const parsed = JSON.parse(value || '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const documentId = String((item as { documentId?: unknown }).documentId ?? '').trim()
        const revision = Number((item as { revision?: unknown }).revision)
        if (!documentId || !Number.isSafeInteger(revision) || revision < 1) return null
        return { documentId, revision }
      })
      .filter((item): item is WorldCognitionDocumentRef => item !== null)
  } catch {
    return []
  }
}

const normalizeDocumentRefs = (refs: WorldCognitionDocumentRef[]): WorldCognitionDocumentRef[] => {
  const deduped = new Map<string, WorldCognitionDocumentRef>()
  for (const ref of refs.slice(0, MAX_WORLD_COGNITION_DOCUMENT_REFS + 1)) {
    const documentId = normalizeRequiredText(ref.documentId, 'documentId', 240)
    const revision = Number(ref.revision)
    if (!Number.isSafeInteger(revision) || revision < 1) {
      throw new Error(`document revision must be a positive integer: ${documentId}`)
    }
    deduped.set(documentId, { documentId, revision })
  }
  if (deduped.size > MAX_WORLD_COGNITION_DOCUMENT_REFS) {
    throw new Error(`documentRefs exceeds ${MAX_WORLD_COGNITION_DOCUMENT_REFS} entries`)
  }
  return [...deduped.values()]
}

const makeSpaceId = (agentId: string, worldId: string): string =>
  `cognition-space:${createHash('sha256').update(`${agentId}\u0000${worldId}`).digest('hex')}`

const toPayload = (
  record: AgentWorldCognitionNodeRecord,
  worldId: string,
  parentTitle?: string
): AgentWorldCognitionNodePayload => ({
  id: record.id,
  worldId,
  parentId: record.parentId,
  parentTitle,
  nodeKind: record.nodeKind,
  title: record.title,
  markdown: record.markdown,
  documentRefs: parseDocumentRefs(record.documentRefsJson),
  revision: record.revision,
  status: record.status,
  createdAt: record.createdAt?.toISOString(),
  updatedAt: record.updatedAt?.toISOString()
})

const ensureSpace = async (
  manager: EntityManager,
  agentId: string,
  worldId: string
): Promise<AgentWorldCognitionSpaceRecord> => {
  const repo = manager.getRepository(AgentWorldCognitionSpaceRecord)
  const existing = await repo.findOneBy({ agentId, worldId })
  if (existing) return existing
  await repo
    .createQueryBuilder()
    .insert()
    .values({ id: makeSpaceId(agentId, worldId), agentId, worldId, revision: 0 })
    .orIgnore()
    .execute()
  return repo.findOneByOrFail({ agentId, worldId })
}

export class AgentWorldCognitionService {
  constructor(private readonly dataSource: DataSource) {}

  private async assertWorld(manager: EntityManager, worldId: string): Promise<void> {
    const exists = await manager.getRepository(WorldRecord).exist({ where: { id: worldId } })
    if (!exists) {
      throw new AgentWorldCognitionError('WORLD_NOT_FOUND', `World not found: ${worldId}`, {
        worldId
      })
    }
  }

  private async validateDocumentRefs(
    manager: EntityManager,
    worldId: string,
    refs: WorldCognitionDocumentRef[],
    status: AgentWorldCognitionNodeStatus
  ): Promise<void> {
    if (refs.length === 0) return
    const documents = await manager
      .getRepository(WorldEntityDocumentRecord)
      .findBy({ id: In(refs.map((ref) => ref.documentId)) })
    const byId = new Map(documents.map((document) => [document.id, document]))
    for (const ref of refs) {
      const document = byId.get(ref.documentId)
      if (!document) {
        throw new AgentWorldCognitionError(
          'DOCUMENT_NOT_FOUND',
          `Cognition source document not found: ${ref.documentId}`,
          { documentId: ref.documentId }
        )
      }
      if (document.worldId !== worldId) {
        throw new AgentWorldCognitionError(
          'DOCUMENT_WORLD_MISMATCH',
          `Document ${ref.documentId} does not belong to world ${worldId}`,
          { documentId: ref.documentId, documentWorldId: document.worldId, worldId }
        )
      }
      if (status === 'available' && document.revision !== ref.revision) {
        throw new AgentWorldCognitionError(
          'DOCUMENT_REVISION_CONFLICT',
          `Document revision conflict for ${ref.documentId}: expected ${ref.revision}, current ${document.revision}`,
          {
            documentId: ref.documentId,
            expectedRevision: ref.revision,
            currentRevision: document.revision
          }
        )
      }
    }
  }

  async queryNodes(input: {
    agentId: string
    worldId: string
    query: string
    limit?: number
  }): Promise<{ spaceRevision: number; matches: AgentWorldCognitionNodePayload[] }> {
    const agentId = normalizeRequiredText(input.agentId, 'agentId', 120)
    const worldId = normalizeRequiredText(input.worldId, 'worldId', 240)
    const query = normalizeRequiredText(input.query, 'query', 120)
    const limit = Math.max(1, Math.min(10, Number(input.limit) || 5))
    return this.dataSource.transaction(async (manager) => {
      await this.assertWorld(manager, worldId)
      const space = await manager
        .getRepository(AgentWorldCognitionSpaceRecord)
        .findOneBy({ agentId, worldId })
      if (!space) return { spaceRevision: 0, matches: [] }

      const candidates = await manager
        .getRepository(AgentWorldCognitionNodeRecord)
        .createQueryBuilder('node')
        .where('node.spaceId = :spaceId', { spaceId: space.id })
        .andWhere(
          '(instr(lower(node.title), lower(:query)) > 0 OR instr(lower(node.markdown), lower(:query)) > 0)',
          {
            query
          }
        )
        .take(50)
        .getMany()
      const normalizedQuery = query.toLocaleLowerCase()
      const ranked = candidates
        .map((node) => {
          const title = node.title.toLocaleLowerCase()
          const markdown = node.markdown.toLocaleLowerCase()
          const score =
            title === normalizedQuery
              ? 100
              : title.includes(normalizedQuery)
                ? 70
                : markdown.includes(normalizedQuery)
                  ? 40
                  : 0
          return { node, score }
        })
        .sort((left, right) => right.score - left.score || right.node.revision - left.node.revision)
        .slice(0, limit)
      const parentIds = [
        ...new Set(
          ranked.map(({ node }) => node.parentId).filter((id): id is string => Boolean(id))
        )
      ]
      const parents = parentIds.length
        ? await manager.getRepository(AgentWorldCognitionNodeRecord).findBy({ id: In(parentIds) })
        : []
      const parentTitles = new Map(parents.map((parent) => [parent.id, parent.title]))
      return {
        spaceRevision: space.revision,
        matches: ranked.map(({ node }) =>
          toPayload(node, worldId, node.parentId ? parentTitles.get(node.parentId) : undefined)
        )
      }
    })
  }

  async saveNode(input: SaveAgentWorldCognitionNodeInput): Promise<{
    spaceRevision: number
    created: boolean
    node: AgentWorldCognitionNodePayload
  }> {
    const agentId = normalizeRequiredText(input.agentId, 'agentId', 120)
    const worldId = normalizeRequiredText(input.worldId, 'worldId', 240)
    const title = normalizeRequiredText(input.title, 'title', 120)
    const markdown = normalizeRequiredText(
      input.markdown,
      'markdown',
      MAX_WORLD_COGNITION_MARKDOWN_LENGTH
    )
    const documentRefs = normalizeDocumentRefs(input.documentRefs)
    const status = input.status ?? 'available'
    if (input.nodeKind === 'concept' && !input.parentId) {
      throw new AgentWorldCognitionError(
        'INVALID_PARENT',
        'A concept cognition must belong to a dimension node.'
      )
    }
    if (input.nodeKind === 'concept' && documentRefs.length === 0) {
      throw new Error('A concept cognition requires at least one source document.')
    }

    return this.dataSource.transaction(async (manager) => {
      await this.assertWorld(manager, worldId)
      const space = await ensureSpace(manager, agentId, worldId)
      const nodeRepo = manager.getRepository(AgentWorldCognitionNodeRecord)
      let parentTitle: string | undefined
      if (input.parentId) {
        if (input.parentId === input.nodeId) {
          throw new AgentWorldCognitionError(
            'INVALID_PARENT',
            'A cognition node cannot parent itself.'
          )
        }
        const parent = await nodeRepo.findOneBy({ id: input.parentId, spaceId: space.id })
        if (!parent) {
          throw new AgentWorldCognitionError(
            'PARENT_NOT_FOUND',
            `Cognition parent not found in this Agent world space: ${input.parentId}`,
            { parentId: input.parentId }
          )
        }
        if (parent.nodeKind !== 'dimension') {
          throw new AgentWorldCognitionError(
            'INVALID_PARENT',
            `Cognition parent must be a dimension: ${input.parentId}`,
            { parentId: input.parentId }
          )
        }
        parentTitle = parent.title
      }
      await this.validateDocumentRefs(manager, worldId, documentRefs, status)

      let saved: AgentWorldCognitionNodeRecord
      let created = false
      if (!input.nodeId) {
        saved = await nodeRepo.save(
          nodeRepo.create({
            id: randomUUID(),
            spaceId: space.id,
            parentId: input.parentId,
            nodeKind: input.nodeKind,
            title,
            markdown,
            documentRefsJson: JSON.stringify(documentRefs),
            revision: 1,
            status
          })
        )
        created = true
      } else {
        const current = await nodeRepo.findOneBy({ id: input.nodeId, spaceId: space.id })
        if (!current) {
          throw new AgentWorldCognitionError(
            'NODE_NOT_FOUND',
            `Cognition node not found: ${input.nodeId}`,
            { nodeId: input.nodeId }
          )
        }
        const expectedRevision = Number(input.expectedRevision)
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
          throw new Error('expectedRevision is required when updating a cognition node')
        }
        if (current.revision !== expectedRevision) {
          throw new AgentWorldCognitionError(
            'NODE_REVISION_CONFLICT',
            `Cognition revision conflict: expected ${expectedRevision}, current ${current.revision}`,
            { nodeId: current.id, expectedRevision, currentRevision: current.revision }
          )
        }
        if (current.nodeKind !== input.nodeKind) {
          throw new Error('nodeKind cannot be changed after a cognition node is created')
        }
        const updated = await nodeRepo.update(
          { id: current.id, spaceId: space.id, revision: expectedRevision },
          {
            parentId: input.parentId,
            title,
            markdown,
            documentRefsJson: JSON.stringify(documentRefs),
            revision: expectedRevision + 1,
            status
          }
        )
        if (updated.affected !== 1) {
          const latest = await nodeRepo.findOneBy({ id: current.id })
          throw new AgentWorldCognitionError(
            'NODE_REVISION_CONFLICT',
            `Cognition revision conflict: expected ${expectedRevision}, current ${latest?.revision ?? expectedRevision}`,
            {
              nodeId: current.id,
              expectedRevision,
              currentRevision: latest?.revision ?? expectedRevision
            }
          )
        }
        saved = await nodeRepo.findOneByOrFail({ id: current.id })
      }

      const nextSpaceRevision = space.revision + 1
      await manager
        .getRepository(AgentWorldCognitionSpaceRecord)
        .update({ id: space.id }, { revision: nextSpaceRevision })
      return {
        spaceRevision: nextSpaceRevision,
        created,
        node: toPayload(saved, worldId, parentTitle)
      }
    })
  }
}
