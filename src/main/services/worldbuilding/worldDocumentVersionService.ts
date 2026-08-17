import { createHash, randomUUID } from 'node:crypto'
import type { EntityManager } from 'typeorm'
import { WorldEntityDocumentRecord } from '@share/entity/database/WorldEntityDocumentRecord'
import { WorldDocumentContentVersionRecord } from '@share/entity/database/WorldDocumentContentVersionRecord'
import { WorldDocumentTreeObjectRecord } from '@share/entity/database/WorldDocumentTreeObjectRecord'
import { WorldDocumentCommitRecord } from '@share/entity/database/WorldDocumentCommitRecord'
import {
  WorldDocumentChangeRecord,
  type WorldDocumentChangeOperation
} from '@share/entity/database/WorldDocumentChangeRecord'
import { worldDocumentMarkdownToHtml } from '../aiservice/ai-utils/tools/document/worldDocumentMarkdownCodec'

export type WorldDocumentEditSource = {
  format: 'markdown' | 'html_editor'
  content: string
}

export type StageWorldDocumentChangeInput = {
  changeSetId: string
  operation: Exclude<WorldDocumentChangeOperation, 'mixed'>
  before: WorldEntityDocumentRecord | null
  after: WorldEntityDocumentRecord | null
  source?: WorldDocumentEditSource
  summary?: string
}

type DocumentState = {
  id: string
  ownerKind: WorldEntityDocumentRecord['ownerKind']
  worldId: string
  ownerEntityId: string | null
  parentDocumentId: string | null
  title: string
  sortKey: string
  revision: number
  schemaVersion: number
}

type TreeEntry = {
  documentId: string
  ownerKind: WorldEntityDocumentRecord['ownerKind']
  ownerEntityId: string | null
  title: string
  sortKey: string
  schemaVersion: number
  contentVersionId: string
  childrenTreeHash: string | null
}

const toState = (record: WorldEntityDocumentRecord): DocumentState => ({
  id: record.id,
  ownerKind: record.ownerKind,
  worldId: record.worldId,
  ownerEntityId: record.ownerEntityId,
  parentDocumentId: record.parentDocumentId ?? null,
  title: record.title,
  sortKey: record.sortKey,
  revision: record.revision,
  schemaVersion: record.schemaVersion
})

const parseState = (value: string | null): DocumentState | null => {
  if (!value) return null
  return JSON.parse(value) as DocumentState
}

const hashText = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex')

const contentVersionId = (documentId: string, source: WorldDocumentEditSource): string =>
  `content:${hashText(`${documentId}\u0000${source.format}\u0000${source.content}`)}`

const sameOwner = (left: DocumentState, right: DocumentState): boolean =>
  left.ownerKind === right.ownerKind && left.ownerEntityId === right.ownerEntityId

const resolveOperation = (
  current: WorldDocumentChangeRecord | null,
  input: StageWorldDocumentChangeInput
): WorldDocumentChangeOperation => {
  if (!current) return input.operation
  if (!current.beforeStateJson && !input.after) return 'mixed'
  if (!current.beforeStateJson) return 'create'
  if (!input.after) return 'delete'
  return current.operation === input.operation ? current.operation : 'mixed'
}

const latestContentVersion = async (
  manager: EntityManager,
  documentId: string
): Promise<WorldDocumentContentVersionRecord | null> =>
  manager.getRepository(WorldDocumentContentVersionRecord).findOne({
    where: { documentId },
    order: { createdAt: 'DESC' }
  })

const resolveBeforeSource = async (
  manager: EntityManager,
  before: WorldEntityDocumentRecord | null
): Promise<WorldDocumentEditSource | null> => {
  if (!before) return null
  const previous = await latestContentVersion(manager, before.id)
  if (previous) {
    return {
      format: previous.sourceFormat,
      content: previous.contentSource
    }
  }
  // Existing installations only have editor HTML. It is retained once as the
  // migration baseline; later Agent/runtime HTML is never used as a Diff source.
  return { format: 'html_editor', content: before.contentHtml || '' }
}

export const stageWorldDocumentChangeWithManager = async (
  manager: EntityManager,
  input: StageWorldDocumentChangeInput
): Promise<void> => {
  const worldId = input.after?.worldId ?? input.before?.worldId
  const documentId = input.after?.id ?? input.before?.id
  if (!worldId || !documentId) return

  const repository = manager.getRepository(WorldDocumentChangeRecord)
  const current = await repository.findOneBy({
    changeSetId: input.changeSetId,
    documentId
  })

  if (current && !current.beforeStateJson && !input.after) {
    await repository.remove(current)
    return
  }

  const beforeSource = current
    ? current.beforeSourceFormat
      ? {
          format: current.beforeSourceFormat,
          content: current.beforeContentSource ?? ''
        }
      : null
    : await resolveBeforeSource(manager, input.before)
  const record =
    current ??
    repository.create({
      id: randomUUID(),
      changeSetId: input.changeSetId,
      worldId,
      documentId,
      beforeStateJson: input.before ? JSON.stringify(toState(input.before)) : null,
      beforeSourceFormat: beforeSource?.format ?? null,
      beforeContentSource: beforeSource?.content ?? null,
      status: 'staged',
      commitId: null
    })

  record.operation = resolveOperation(current, input)
  record.afterStateJson = input.after ? JSON.stringify(toState(input.after)) : null
  if (input.source) {
    record.sourceFormat = input.source.format
    record.contentSource = input.source.content
  } else if (!current && input.after && input.operation === 'create') {
    record.sourceFormat = 'html_editor'
    record.contentSource = input.after.contentHtml || ''
  }
  record.summary = input.summary?.trim() || record.summary || input.operation
  record.status = 'staged'
  await repository.save(record)
}

const ensureContentVersion = async (
  manager: EntityManager,
  state: DocumentState,
  source: WorldDocumentEditSource
): Promise<WorldDocumentContentVersionRecord> => {
  const repository = manager.getRepository(WorldDocumentContentVersionRecord)
  const id = contentVersionId(state.id, source)
  const existing = await repository.findOneBy({ id })
  if (existing) return existing
  return repository.save(
    repository.create({
      id,
      worldId: state.worldId,
      documentId: state.id,
      sourceRevision: state.revision,
      sourceFormat: source.format,
      contentSource: source.content,
      contentHash: hashText(`${source.format}\u0000${source.content}`)
    })
  )
}

const ensureTreeObject = async (
  manager: EntityManager,
  entries: TreeEntry[]
): Promise<WorldDocumentTreeObjectRecord> => {
  const entriesJson = JSON.stringify(entries)
  const hash = hashText(entriesJson)
  const repository = manager.getRepository(WorldDocumentTreeObjectRecord)
  const existing = await repository.findOneBy({ hash })
  return (
    existing ??
    (await repository.save(
      repository.create({
        hash,
        entriesJson
      })
    ))
  )
}

const materializeTree = async (
  manager: EntityManager,
  states: DocumentState[],
  sourceOverrides: Map<string, WorldDocumentEditSource>
): Promise<WorldDocumentTreeObjectRecord> => {
  const byParent = new Map<string | null, DocumentState[]>()
  for (const state of states) {
    const siblings = byParent.get(state.parentDocumentId) ?? []
    siblings.push(state)
    byParent.set(state.parentDocumentId, siblings)
  }
  for (const siblings of byParent.values()) {
    siblings.sort(
      (left, right) => left.sortKey.localeCompare(right.sortKey) || left.id.localeCompare(right.id)
    )
  }

  const build = async (parentId: string | null): Promise<WorldDocumentTreeObjectRecord> => {
    const entries: TreeEntry[] = []
    for (const state of byParent.get(parentId) ?? []) {
      const latest = await latestContentVersion(manager, state.id)
      const currentRecord =
        latest || sourceOverrides.has(state.id)
          ? null
          : await manager.getRepository(WorldEntityDocumentRecord).findOneBy({ id: state.id })
      const source =
        sourceOverrides.get(state.id) ??
        (latest
          ? { format: latest.sourceFormat, content: latest.contentSource }
          : { format: 'html_editor' as const, content: currentRecord?.contentHtml ?? '' })
      const version = await ensureContentVersion(manager, state, source)
      const children = (byParent.get(state.id) ?? []).filter((child) => sameOwner(child, state))
      const childrenTree = children.length > 0 ? await build(state.id) : null
      entries.push({
        documentId: state.id,
        ownerKind: state.ownerKind,
        ownerEntityId: state.ownerEntityId,
        title: state.title,
        sortKey: state.sortKey,
        schemaVersion: state.schemaVersion,
        contentVersionId: version.id,
        childrenTreeHash: childrenTree?.hash ?? null
      })
    }
    return ensureTreeObject(manager, entries)
  }

  return build(null)
}

const currentStatesForWorld = async (
  manager: EntityManager,
  worldId: string
): Promise<DocumentState[]> =>
  (await manager.getRepository(WorldEntityDocumentRecord).findBy({ worldId })).map(toState)

const buildBaselineStates = (
  currentStates: DocumentState[],
  changes: WorldDocumentChangeRecord[]
): DocumentState[] => {
  const states = new Map(currentStates.map((state) => [state.id, state]))
  for (const change of changes) {
    const before = parseState(change.beforeStateJson)
    if (before) states.set(before.id, before)
    else states.delete(change.documentId)
  }
  return [...states.values()]
}

const sourceOverridesFor = (
  changes: WorldDocumentChangeRecord[],
  side: 'before' | 'after'
): Map<string, WorldDocumentEditSource> => {
  const result = new Map<string, WorldDocumentEditSource>()
  for (const change of changes) {
    const format = side === 'before' ? change.beforeSourceFormat : change.sourceFormat
    const content = side === 'before' ? change.beforeContentSource : change.contentSource
    if (format && content !== null) result.set(change.documentId, { format, content })
  }
  return result
}

const createCommit = async (
  manager: EntityManager,
  input: {
    worldId: string
    sequence: number
    parentCommitId: string | null
    changeSetId: string
    rootTreeHash: string
    origin: WorldDocumentCommitRecord['origin']
    summary: string
  }
): Promise<WorldDocumentCommitRecord> =>
  manager.getRepository(WorldDocumentCommitRecord).save(
    manager.getRepository(WorldDocumentCommitRecord).create({
      id: randomUUID(),
      ...input
    })
  )

export const commitWorldDocumentChangeSetWithManager = async (
  manager: EntityManager,
  changeSetId: string,
  origin: WorldDocumentCommitRecord['origin'] = 'agent'
): Promise<WorldDocumentCommitRecord[]> => {
  const changeRepository = manager.getRepository(WorldDocumentChangeRecord)
  const staged = await changeRepository.findBy({ changeSetId, status: 'staged' })
  if (staged.length === 0) return []

  const commits: WorldDocumentCommitRecord[] = []
  const worldIds = [...new Set(staged.map((change) => change.worldId))]
  for (const worldId of worldIds) {
    const existing = await manager.getRepository(WorldDocumentCommitRecord).findOneBy({
      changeSetId,
      worldId
    })
    if (existing) {
      commits.push(existing)
      continue
    }
    const changes = staged.filter((change) => change.worldId === worldId)
    const currentStates = await currentStatesForWorld(manager, worldId)
    let parent = await manager.getRepository(WorldDocumentCommitRecord).findOne({
      where: { worldId },
      order: { sequence: 'DESC' }
    })

    if (!parent) {
      const baselineTree = await materializeTree(
        manager,
        buildBaselineStates(currentStates, changes),
        sourceOverridesFor(changes, 'before')
      )
      parent = await createCommit(manager, {
        worldId,
        sequence: 1,
        parentCommitId: null,
        changeSetId: `baseline:${worldId}:${randomUUID()}`,
        rootTreeHash: baselineTree.hash,
        origin: 'system',
        summary: 'Imported existing document tree'
      })
    }

    const tree = await materializeTree(manager, currentStates, sourceOverridesFor(changes, 'after'))
    const commit = await createCommit(manager, {
      worldId,
      sequence: parent.sequence + 1,
      parentCommitId: parent.id,
      changeSetId,
      rootTreeHash: tree.hash,
      origin,
      summary: changes
        .map((change) => change.summary)
        .filter(Boolean)
        .join('；')
        .slice(0, 500)
    })
    for (const change of changes) {
      change.status = 'committed'
      change.commitId = commit.id
    }
    await changeRepository.save(changes)
    commits.push(commit)
  }
  return commits
}

type RestorableDocument = {
  state: DocumentState
  source: WorldDocumentEditSource
}

const readTreeDocuments = async (
  manager: EntityManager,
  worldId: string,
  treeHash: string,
  parentDocumentId: string | null = null,
  result = new Map<string, RestorableDocument>()
): Promise<Map<string, RestorableDocument>> => {
  const tree = await manager.getRepository(WorldDocumentTreeObjectRecord).findOneByOrFail({
    hash: treeHash
  })
  const entries = JSON.parse(tree.entriesJson) as TreeEntry[]
  for (const entry of entries) {
    const content = await manager
      .getRepository(WorldDocumentContentVersionRecord)
      .findOneByOrFail({ id: entry.contentVersionId })
    result.set(entry.documentId, {
      state: {
        id: entry.documentId,
        ownerKind: entry.ownerKind,
        worldId,
        ownerEntityId: entry.ownerEntityId,
        parentDocumentId,
        title: entry.title,
        sortKey: entry.sortKey,
        revision: content.sourceRevision,
        schemaVersion: entry.schemaVersion
      },
      source: {
        format: content.sourceFormat,
        content: content.contentSource
      }
    })
    if (entry.childrenTreeHash) {
      await readTreeDocuments(manager, worldId, entry.childrenTreeHash, entry.documentId, result)
    }
  }
  return result
}

const sourceToStoredHtml = (source: WorldDocumentEditSource): string =>
  source.format === 'markdown' ? worldDocumentMarkdownToHtml(source.content) : source.content

export class WorldDocumentHistoryConflictError extends Error {
  readonly code = 'DOCUMENT_HISTORY_CONFLICT'

  constructor(
    readonly expectedHeadCommitId: string,
    readonly currentHeadCommitId: string
  ) {
    super(
      `Document history conflict: expected head ${expectedHeadCommitId}, current ${currentHeadCommitId}`
    )
    this.name = 'WorldDocumentHistoryConflictError'
  }
}

export const restoreWorldDocumentCommitWithManager = async (
  manager: EntityManager,
  input: {
    targetCommitId: string
    expectedHeadCommitId: string
    changeSetId?: string
    summary?: string
  }
): Promise<WorldDocumentCommitRecord> => {
  const commitRepository = manager.getRepository(WorldDocumentCommitRecord)
  const target = await commitRepository.findOneByOrFail({ id: input.targetCommitId })
  const head = await commitRepository.findOne({
    where: { worldId: target.worldId },
    order: { sequence: 'DESC' }
  })
  if (!head || head.id !== input.expectedHeadCommitId) {
    throw new WorldDocumentHistoryConflictError(input.expectedHeadCommitId, head?.id ?? '')
  }

  const desired = await readTreeDocuments(manager, target.worldId, target.rootTreeHash)
  const documentRepository = manager.getRepository(WorldEntityDocumentRecord)
  const currentRecords = await documentRepository.findBy({ worldId: target.worldId })
  const current = new Map(currentRecords.map((record) => [record.id, record]))
  const changeSetId = input.changeSetId ?? `restore:${randomUUID()}`
  const summary = input.summary?.trim() || `恢复文档树到提交 #${target.sequence}`

  for (const [documentId, desiredDocument] of desired) {
    const existing = current.get(documentId) ?? null
    const storedHtml = sourceToStoredHtml(desiredDocument.source)
    if (
      existing &&
      existing.ownerKind === desiredDocument.state.ownerKind &&
      existing.ownerEntityId === desiredDocument.state.ownerEntityId &&
      existing.parentDocumentId === desiredDocument.state.parentDocumentId &&
      existing.title === desiredDocument.state.title &&
      existing.sortKey === desiredDocument.state.sortKey &&
      existing.contentHtml === storedHtml
    ) {
      current.delete(documentId)
      continue
    }

    const before = existing ? documentRepository.create({ ...existing }) : null
    const nextRevision = existing
      ? existing.revision + 1
      : Math.max(
          desiredDocument.state.revision,
          ...(
            await manager.getRepository(WorldDocumentContentVersionRecord).findBy({ documentId })
          ).map((version) => version.sourceRevision)
        ) + 1
    const after = await documentRepository.save(
      documentRepository.create({
        ...(existing ?? {}),
        id: documentId,
        ownerKind: desiredDocument.state.ownerKind,
        worldId: desiredDocument.state.worldId,
        ownerEntityId: desiredDocument.state.ownerEntityId,
        parentDocumentId: desiredDocument.state.parentDocumentId,
        title: desiredDocument.state.title,
        contentHtml: storedHtml,
        contentFormat: 'html',
        sortKey: desiredDocument.state.sortKey,
        revision: nextRevision,
        schemaVersion: desiredDocument.state.schemaVersion
      })
    )
    await stageWorldDocumentChangeWithManager(manager, {
      changeSetId,
      operation: existing ? 'update' : 'create',
      before,
      after,
      source: desiredDocument.source,
      summary
    })
    current.delete(documentId)
  }

  for (const record of current.values()) {
    await documentRepository.remove(record)
    await stageWorldDocumentChangeWithManager(manager, {
      changeSetId,
      operation: 'delete',
      before: record,
      after: null,
      summary
    })
  }

  const [restored] = await commitWorldDocumentChangeSetWithManager(manager, changeSetId, 'human')
  if (!restored) return head
  return restored
}
