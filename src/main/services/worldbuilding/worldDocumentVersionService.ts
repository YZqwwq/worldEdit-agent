import { createHash, randomUUID } from 'node:crypto'
import type { DataSource, EntityManager } from 'typeorm'
import { WorldEntityDocumentRecord } from '@share/entity/database/WorldEntityDocumentRecord'
import { MainAgentChangeSetRecord } from '@share/entity/database/MainAgentChangeSetRecord'
import { MainAgentTurnRecord } from '@share/entity/database/MainAgentTurnRecord'
import { WorldDocumentContentVersionRecord } from '@share/entity/database/WorldDocumentContentVersionRecord'
import { WorldDocumentTreeObjectRecord } from '@share/entity/database/WorldDocumentTreeObjectRecord'
import { WorldDocumentCommitRecord } from '@share/entity/database/WorldDocumentCommitRecord'
import { WorldDocumentBranchRecord } from '@share/entity/database/WorldDocumentBranchRecord'
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

export class WorldDocumentChangeSetClosedError extends Error {
  readonly code = 'CHANGESET_CLOSED'
  readonly retryable = false

  constructor(
    readonly changeSetId: string,
    readonly worldId: string,
    readonly commitId: string
  ) {
    super(`Document change set is already committed: ${changeSetId}`)
    this.name = 'WorldDocumentChangeSetClosedError'
  }
}

export class WorldDocumentHistorySourceMismatchError extends Error {
  readonly code = 'DOCUMENT_HISTORY_SOURCE_MISMATCH'
  readonly retryable = false

  constructor(
    readonly changeSetId: string,
    readonly documentId: string
  ) {
    super(`Document history source does not match stored content: ${documentId}`)
    this.name = 'WorldDocumentHistorySourceMismatchError'
  }
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
  revision: number
  schemaVersion: number
  contentVersionId: string
  childrenTreeHash: string | null
}

type RestorableDocument = {
  state: DocumentState
  source: WorldDocumentEditSource
}

export type WorldDocumentSnapshotEntry = RestorableDocument

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

const readDocumentSourceFromTree = async (
  manager: EntityManager,
  treeHash: string,
  documentId: string,
  visited = new Set<string>()
): Promise<WorldDocumentEditSource | null> => {
  if (visited.has(treeHash)) return null
  visited.add(treeHash)
  const tree = await manager.getRepository(WorldDocumentTreeObjectRecord).findOneBy({
    hash: treeHash
  })
  if (!tree) return null
  const entries = JSON.parse(tree.entriesJson) as TreeEntry[]
  const entry = entries.find((candidate) => candidate.documentId === documentId)
  if (entry) {
    const content = await manager
      .getRepository(WorldDocumentContentVersionRecord)
      .findOneBy({ id: entry.contentVersionId })
    return content
      ? { format: content.sourceFormat, content: content.contentSource }
      : null
  }
  for (const candidate of entries) {
    if (!candidate.childrenTreeHash) continue
    const source = await readDocumentSourceFromTree(
      manager,
      candidate.childrenTreeHash,
      documentId,
      visited
    )
    if (source) return source
  }
  return null
}

const resolveBeforeSource = async (
  manager: EntityManager,
  before: WorldEntityDocumentRecord | null
): Promise<WorldDocumentEditSource | null> => {
  if (!before) return null
  const branch = await manager.getRepository(WorldDocumentBranchRecord).findOneBy({
    worldId: before.worldId,
    active: true
  })
  const head = branch?.headCommitId
    ? await manager.getRepository(WorldDocumentCommitRecord).findOneBy({ id: branch.headCommitId })
    : null
  const source = head
    ? await readDocumentSourceFromTree(manager, head.rootTreeHash, before.id)
    : null
  if (source) {
    const storedHtml =
      source.format === 'markdown' ? worldDocumentMarkdownToHtml(source.content) : source.content
    if (storedHtml === (before.contentHtml || '')) return source
  }
  // The working copy can legitimately be ahead of HEAD while another history
  // session is still staged. Its exact editor source is safer than borrowing a
  // ContentVersion from another branch.
  return { format: 'html_editor', content: before.contentHtml || '' }
}

const readContentVersionSource = async (
  manager: EntityManager,
  contentVersionId: string | null | undefined
): Promise<WorldDocumentEditSource | null> => {
  if (!contentVersionId) return null
  const content = await manager
    .getRepository(WorldDocumentContentVersionRecord)
    .findOneBy({ id: contentVersionId })
  return content ? { format: content.sourceFormat, content: content.contentSource } : null
}

const readChangeSource = async (
  manager: EntityManager,
  change: WorldDocumentChangeRecord,
  side: 'before' | 'after'
): Promise<WorldDocumentEditSource | null> => {
  const referenced = await readContentVersionSource(
    manager,
    side === 'before' ? change.beforeContentVersionId : change.afterContentVersionId
  )
  if (referenced) return referenced
  const format = side === 'before' ? change.beforeSourceFormat : change.sourceFormat
  if (!format) return null
  return {
    format,
    content:
      (side === 'before' ? change.beforeContentSource : change.contentSource) ?? ''
  }
}

export const stageWorldDocumentChangeWithManager = async (
  manager: EntityManager,
  input: StageWorldDocumentChangeInput
): Promise<void> => {
  const worldId = input.after?.worldId ?? input.before?.worldId
  const documentId = input.after?.id ?? input.before?.id
  if (!worldId || !documentId) return

  const committed = await manager.getRepository(WorldDocumentCommitRecord).findOneBy({
    changeSetId: input.changeSetId,
    worldId
  })
  if (committed) {
    throw new WorldDocumentChangeSetClosedError(input.changeSetId, worldId, committed.id)
  }

  if (input.after && input.source) {
    const sourceHtml =
      input.source.format === 'markdown'
        ? worldDocumentMarkdownToHtml(input.source.content)
        : input.source.content
    if (sourceHtml !== (input.after.contentHtml || '')) {
      throw new WorldDocumentHistorySourceMismatchError(input.changeSetId, documentId)
    }
  }

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
    ? await readChangeSource(manager, current, 'before')
    : await resolveBeforeSource(manager, input.before)
  const currentAfterSource = current
    ? await readChangeSource(manager, current, 'after')
    : null
  const afterSource = input.after
    ? (input.source ??
      currentAfterSource ??
      beforeSource ?? {
        format: 'html_editor' as const,
        content: input.after.contentHtml || ''
      })
    : null
  const beforeVersion = input.before && beforeSource
    ? await ensureContentVersion(manager, toState(input.before), beforeSource)
    : null
  const afterVersion = input.after && afterSource
    ? await ensureContentVersion(manager, toState(input.after), afterSource)
    : null
  const record =
    current ??
    repository.create({
      id: randomUUID(),
      changeSetId: input.changeSetId,
      worldId,
      documentId,
      beforeStateJson: input.before ? JSON.stringify(toState(input.before)) : null,
      beforeSourceFormat: null,
      beforeContentSource: null,
      beforeContentVersionId: beforeVersion?.id ?? null,
      status: 'staged',
      commitId: null
    })

  record.operation = resolveOperation(current, input)
  record.afterStateJson = input.after ? JSON.stringify(toState(input.after)) : null
  record.beforeContentVersionId ??= beforeVersion?.id ?? null
  record.afterContentVersionId = afterVersion?.id ?? null
  record.beforeSourceFormat = null
  record.beforeContentSource = null
  record.sourceFormat = null
  record.contentSource = null
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
  documents: Map<string, RestorableDocument>
): Promise<WorldDocumentTreeObjectRecord> => {
  const states = [...documents.values()].map((document) => document.state)
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
      const document = documents.get(state.id)
      if (!document) throw new Error(`Missing document snapshot for tree entry: ${state.id}`)
      const version = await ensureContentVersion(manager, state, document.source)
      const children = (byParent.get(state.id) ?? []).filter((child) => sameOwner(child, state))
      const childrenTree = children.length > 0 ? await build(state.id) : null
      entries.push({
        documentId: state.id,
        ownerKind: state.ownerKind,
        ownerEntityId: state.ownerEntityId,
        title: state.title,
        sortKey: state.sortKey,
        revision: state.revision,
        schemaVersion: state.schemaVersion,
        contentVersionId: version.id,
        childrenTreeHash: childrenTree?.hash ?? null
      })
    }
    return ensureTreeObject(manager, entries)
  }

  return build(null)
}

const currentDocumentsForWorld = async (
  manager: EntityManager,
  worldId: string
): Promise<Map<string, RestorableDocument>> => {
  const records = await manager.getRepository(WorldEntityDocumentRecord).findBy({ worldId })
  return new Map(
    records.map((record) => [
      record.id,
      {
        state: toState(record),
        source: { format: 'html_editor' as const, content: record.contentHtml || '' }
      }
    ])
  )
}

const buildFallbackBaselineDocuments = async (
  manager: EntityManager,
  currentDocuments: Map<string, RestorableDocument>,
  changes: WorldDocumentChangeRecord[]
): Promise<Map<string, RestorableDocument>> => {
  const documents = new Map(currentDocuments)
  for (const change of changes) {
    const before = parseState(change.beforeStateJson)
    if (before) {
      const source = await readChangeSource(manager, change, 'before')
      documents.set(before.id, {
        state: before,
        source: source ?? { format: 'html_editor', content: '' }
      })
    } else {
      documents.delete(change.documentId)
    }
  }
  return documents
}

const removeDocumentSubtree = (
  documents: Map<string, RestorableDocument>,
  documentId: string
): void => {
  const pending = [documentId]
  while (pending.length > 0) {
    const currentId = pending.shift()!
    for (const document of documents.values()) {
      if (document.state.parentDocumentId === currentId) pending.push(document.state.id)
    }
    documents.delete(currentId)
  }
}

const applyChangesToParentDocuments = async (
  manager: EntityManager,
  parentDocuments: Map<string, RestorableDocument>,
  changes: WorldDocumentChangeRecord[],
): Promise<Map<string, RestorableDocument>> => {
  const documents = new Map(parentDocuments)
  for (const change of changes) {
    const before = parseState(change.beforeStateJson)
    const after = parseState(change.afterStateJson)
    const parentDocument = documents.get(change.documentId)
    if (!after) {
      if (before && parentDocument && parentDocument.state.revision > before.revision) continue
      removeDocumentSubtree(documents, change.documentId)
      continue
    }
    if (parentDocument && parentDocument.state.revision >= after.revision) continue
    const source = (await readChangeSource(manager, change, 'after')) ?? parentDocument?.source
    if (!source) throw new Error(`Missing content source for changed document: ${change.documentId}`)
    documents.set(change.documentId, { state: after, source })
  }
  return documents
}

const createCommit = async (
  manager: EntityManager,
  input: {
    worldId: string
    branchId?: string
    sequence: number
    parentCommitId: string | null
    changeSetId: string
    rootTreeHash: string
    origin: WorldDocumentCommitRecord['origin']
    summary: string
    restoredFromCommitId?: string | null
    intent?: string
  }
): Promise<WorldDocumentCommitRecord> =>
  manager.getRepository(WorldDocumentCommitRecord).save(
    manager.getRepository(WorldDocumentCommitRecord).create({
      id: randomUUID(),
      ...input,
      branchId: input.branchId ?? 'main',
      restoredFromCommitId: input.restoredFromCommitId ?? null,
      intent: input.intent?.trim() ?? ''
    })
  )

export const ensureActiveWorldDocumentBranchWithManager = async (
  manager: EntityManager,
  worldId: string,
  fallbackHeadCommitId: string | null = null
): Promise<WorldDocumentBranchRecord> => {
  const repository = manager.getRepository(WorldDocumentBranchRecord)
  const active = await repository.findOneBy({ worldId, active: true })
  if (active) return active
  const existingMain = await repository.findOneBy({ worldId, name: '主方案' })
  if (existingMain) {
    existingMain.active = true
    if (!existingMain.headCommitId) existingMain.headCommitId = fallbackHeadCommitId
    return repository.save(existingMain)
  }
  return repository.save(
    repository.create({
      id: `branch:${worldId}:main`,
      worldId,
      name: '主方案',
      headCommitId: fallbackHeadCommitId,
      active: true
    })
  )
}

export const ensureWorldDocumentBaselineWithManager = async (
  manager: EntityManager,
  worldId: string
): Promise<WorldDocumentCommitRecord> => {
  const commitRepository = manager.getRepository(WorldDocumentCommitRecord)
  const existing = await commitRepository.findOne({
    where: { worldId },
    order: { sequence: 'DESC' }
  })
  if (existing) {
    await ensureActiveWorldDocumentBranchWithManager(manager, worldId, existing.id)
    return existing
  }

  const baselineTree = await materializeTree(
    manager,
    await currentDocumentsForWorld(manager, worldId)
  )
  const branch = await ensureActiveWorldDocumentBranchWithManager(manager, worldId)
  const baseline = await createCommit(manager, {
    worldId,
    branchId: branch.id,
    sequence: 1,
    parentCommitId: null,
    changeSetId: `baseline:${worldId}:${randomUUID()}`,
    rootTreeHash: baselineTree.hash,
    origin: 'system',
    summary: 'Imported existing document tree'
  })
  branch.headCommitId = baseline.id
  await manager.getRepository(WorldDocumentBranchRecord).save(branch)
  return baseline
}

export const commitWorldDocumentChangeSetWithManager = async (
  manager: EntityManager,
  changeSetId: string,
  origin: WorldDocumentCommitRecord['origin'] = 'agent',
  summary?: string
): Promise<WorldDocumentCommitRecord[]> => {
  const changeRepository = manager.getRepository(WorldDocumentChangeRecord)
  const staged = await changeRepository.findBy({ changeSetId, status: 'staged' })
  if (staged.length === 0) return []

  const commits: WorldDocumentCommitRecord[] = []
  const worldIds = [...new Set(staged.map((change) => change.worldId))]
  for (const worldId of worldIds) {
    const changes = staged.filter((change) => change.worldId === worldId)
    const existing = await manager.getRepository(WorldDocumentCommitRecord).findOneBy({
      changeSetId,
      worldId
    })
    if (existing) {
      for (const change of changes) {
        change.status = 'committed'
        change.commitId = existing.id
      }
      await changeRepository.save(changes)
      commits.push(existing)
      continue
    }
    const latestWorldCommit = await manager.getRepository(WorldDocumentCommitRecord).findOne({
      where: { worldId },
      order: { sequence: 'DESC' }
    })
    const branch = await ensureActiveWorldDocumentBranchWithManager(
      manager,
      worldId,
      latestWorldCommit?.id ?? null
    )
    let parent = branch.headCommitId
      ? await manager.getRepository(WorldDocumentCommitRecord).findOneBy({ id: branch.headCommitId })
      : null

    if (!parent) {
      const currentDocuments = await currentDocumentsForWorld(manager, worldId)
      const baselineTree = await materializeTree(
        manager,
        await buildFallbackBaselineDocuments(manager, currentDocuments, changes)
      )
      parent = await createCommit(manager, {
        worldId,
        branchId: branch.id,
        sequence: 1,
        parentCommitId: null,
        changeSetId: `baseline:${worldId}:${randomUUID()}`,
        rootTreeHash: baselineTree.hash,
        origin: 'system',
        summary: 'Imported existing document tree'
      })
    }

    const parentDocuments = await readTreeDocuments(manager, worldId, parent.rootTreeHash)
    const tree = await materializeTree(
      manager,
      await applyChangesToParentDocuments(manager, parentDocuments, changes)
    )
    const commit = await createCommit(manager, {
      worldId,
      branchId: branch.id,
      sequence: (latestWorldCommit?.sequence ?? parent.sequence) + 1,
      parentCommitId: parent.id,
      changeSetId,
      rootTreeHash: tree.hash,
      origin,
      summary:
        summary?.trim().slice(0, 500) ||
        changes
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
    branch.headCommitId = commit.id
    await manager.getRepository(WorldDocumentBranchRecord).save(branch)
    commits.push(commit)
  }
  return commits
}

export type PendingWorldDocumentChangeSetReconciliation = {
  deferredHuman: string[]
  committedTerminalAgent: string[]
  deferredActiveAgent: string[]
  deferredUnowned: string[]
}

// Reverted is terminal but must never publish leftover staged document effects.
const HISTORY_FINALIZED_TURN_STATUSES = new Set<MainAgentTurnRecord['status']>([
  'completed',
  'interrupted',
  'failed',
  'cancelled'
])

export const reconcilePendingWorldDocumentChangeSetsWithDataSource = async (
  dataSource: DataSource
): Promise<PendingWorldDocumentChangeSetReconciliation> => {
  const staged = await dataSource.getRepository(WorldDocumentChangeRecord).findBy({
    status: 'staged'
  })
  const changeSetIds = [...new Set(staged.map((change) => change.changeSetId))]
  const result: PendingWorldDocumentChangeSetReconciliation = {
    deferredHuman: [],
    committedTerminalAgent: [],
    deferredActiveAgent: [],
    deferredUnowned: []
  }

  for (const changeSetId of changeSetIds) {
    if (changeSetId.startsWith('human:')) {
      result.deferredHuman.push(changeSetId)
      continue
    }

    const changeSet = await dataSource
      .getRepository(MainAgentChangeSetRecord)
      .findOneBy({ id: changeSetId })
    if (!changeSet || changeSet.scopeType !== 'turn') {
      result.deferredUnowned.push(changeSetId)
      continue
    }
    const turn = await dataSource.getRepository(MainAgentTurnRecord).findOneBy({
      id: changeSet.turnId
    })
    if (!turn || turn.eventId !== changeSet.eventId) {
      result.deferredUnowned.push(changeSetId)
      continue
    }
    if (!HISTORY_FINALIZED_TURN_STATUSES.has(turn.status)) {
      result.deferredActiveAgent.push(changeSetId)
      continue
    }

    await dataSource.transaction(async (manager) => {
      const persistedChangeSet = await manager
        .getRepository(MainAgentChangeSetRecord)
        .findOneByOrFail({ id: changeSetId })
      if (persistedChangeSet.lifecycle === 'open') {
        persistedChangeSet.lifecycle = 'sealed'
        persistedChangeSet.sealedAt = new Date()
        await manager.getRepository(MainAgentChangeSetRecord).save(persistedChangeSet)
      }
      await commitWorldDocumentChangeSetWithManager(manager, changeSetId, 'agent')
    })
    result.committedTerminalAgent.push(changeSetId)
  }
  return result
}

export const readTreeDocuments = async (
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
        revision: entry.revision ?? content.sourceRevision,
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

export const checkoutWorldDocumentCommitWithManager = async (
  manager: EntityManager,
  commitId: string
): Promise<void> => {
  const commit = await manager.getRepository(WorldDocumentCommitRecord).findOneByOrFail({ id: commitId })
  const pending = await manager.getRepository(WorldDocumentChangeRecord).countBy({
    worldId: commit.worldId,
    status: 'staged'
  })
  if (pending > 0) throw new Error('当前方案仍有未封口编辑，请等待自动保存完成后再切换。')
  const desired = await readTreeDocuments(manager, commit.worldId, commit.rootTreeHash)
  const repository = manager.getRepository(WorldEntityDocumentRecord)
  const current = new Map(
    (await repository.findBy({ worldId: commit.worldId })).map((record) => [record.id, record])
  )
  for (const [documentId, document] of desired) {
    const existing = current.get(documentId)
    await repository.save(
      repository.create({
        ...(existing ?? {}),
        id: documentId,
        ownerKind: document.state.ownerKind,
        worldId: document.state.worldId,
        ownerEntityId: document.state.ownerEntityId,
        parentDocumentId: document.state.parentDocumentId,
        title: document.state.title,
        contentHtml: sourceToStoredHtml(document.source),
        contentFormat: 'html',
        sortKey: document.state.sortKey,
        revision: Math.max(existing?.revision ?? 0, document.state.revision) + 1,
        schemaVersion: document.state.schemaVersion
      })
    )
    current.delete(documentId)
  }
  if (current.size > 0) await repository.remove([...current.values()])
}

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
    documentIds?: string[]
    intent?: string
    restoredFromCommitId?: string
  }
): Promise<WorldDocumentCommitRecord> => {
  const commitRepository = manager.getRepository(WorldDocumentCommitRecord)
  const target = await commitRepository.findOneByOrFail({ id: input.targetCommitId })
  const latest = await commitRepository.findOne({
    where: { worldId: target.worldId },
    order: { sequence: 'DESC' }
  })
  const branch = await ensureActiveWorldDocumentBranchWithManager(
    manager,
    target.worldId,
    latest?.id ?? null
  )
  const head = branch.headCommitId
    ? await commitRepository.findOneBy({ id: branch.headCommitId })
    : null
  if (!head || head.id !== input.expectedHeadCommitId) {
    throw new WorldDocumentHistoryConflictError(input.expectedHeadCommitId, head?.id ?? '')
  }

  const desired = await readTreeDocuments(manager, target.worldId, target.rootTreeHash)
  const documentRepository = manager.getRepository(WorldEntityDocumentRecord)
  const currentRecords = await documentRepository.findBy({ worldId: target.worldId })
  const allCurrent = new Map(currentRecords.map((record) => [record.id, record]))
  const requestedIds = new Set((input.documentIds ?? []).map((id) => String(id).trim()).filter(Boolean))
  const scopedIds = new Set<string>()
  if (requestedIds.size > 0) {
    const collectDescendants = (
      roots: Set<string>,
      entries: Iterable<{ id: string; parentDocumentId: string | null }>
    ): void => {
      let changed = true
      while (changed) {
        changed = false
        for (const entry of entries) {
          if (roots.has(entry.id) || !entry.parentDocumentId || !roots.has(entry.parentDocumentId)) continue
          roots.add(entry.id)
          changed = true
        }
      }
    }
    requestedIds.forEach((id) => scopedIds.add(id))
    collectDescendants(scopedIds, [...desired.values()].map((entry) => entry.state))
    collectDescendants(scopedIds, currentRecords)
  }
  const inScope = (documentId: string): boolean => scopedIds.size === 0 || scopedIds.has(documentId)
  const current = new Map(
    [...allCurrent].filter(([documentId]) => inScope(documentId))
  )
  const changeSetId = input.changeSetId ?? `restore:${randomUUID()}`
  const summary = input.summary?.trim() || `恢复文档树到提交 #${target.sequence}`

  for (const [documentId, desiredDocument] of desired) {
    if (!inScope(documentId)) continue
    const existing = current.get(documentId) ?? null
    const storedHtml = sourceToStoredHtml(desiredDocument.source)
    if (
      existing &&
      existing.ownerKind === desiredDocument.state.ownerKind &&
      existing.ownerEntityId === desiredDocument.state.ownerEntityId &&
      existing.parentDocumentId === desiredDocument.state.parentDocumentId &&
      existing.title === desiredDocument.state.title &&
      existing.sortKey === desiredDocument.state.sortKey &&
      existing.contentHtml === storedHtml &&
      existing.schemaVersion === desiredDocument.state.schemaVersion
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
  restored.restoredFromCommitId = input.restoredFromCommitId ?? target.id
  restored.intent = input.intent ?? (scopedIds.size > 0 ? 'selective_restore' : 'restore')
  await commitRepository.save(restored)
  return restored
}

export const applyWorldDocumentCommitWithManager = async (
  manager: EntityManager,
  input: {
    commitId: string
    expectedHeadCommitId: string
    mode: 'revert' | 'cherry_pick'
  }
): Promise<{ commit: WorldDocumentCommitRecord; changes: WorldDocumentChangeRecord[] }> => {
  const commitId = String(input.commitId || '').trim()
  if (!commitId) throw new Error('commitId is required')
  const commitRepository = manager.getRepository(WorldDocumentCommitRecord)
  const target = await commitRepository.findOneByOrFail({ id: commitId })
  const targetChanges = await manager.getRepository(WorldDocumentChangeRecord).findBy({
    commitId: target.id
  })
  const documentIds = [...new Set(targetChanges.map((change) => change.documentId))]
  if (documentIds.length === 0) throw new Error('该版本没有可应用的文档变化。')

  const sourceCommitId = input.mode === 'revert' ? target.parentCommitId : target.id
  if (!sourceCommitId) throw new Error('初始版本没有父版本，无法执行撤销。')
  const source = await commitRepository.findOneByOrFail({ id: sourceCommitId })
  if (source.worldId !== target.worldId) throw new Error('版本不属于同一世界。')
  const summary =
    input.mode === 'revert'
      ? `撤销版本 #${target.sequence}${target.summary ? `：${target.summary}` : ''}`
      : `摘取版本 #${target.sequence}${target.summary ? `：${target.summary}` : ''}`
  const applied = await restoreWorldDocumentCommitWithManager(manager, {
    targetCommitId: source.id,
    expectedHeadCommitId: input.expectedHeadCommitId,
    documentIds,
    summary,
    intent: input.mode,
    restoredFromCommitId: target.id
  })
  const changes = await manager.getRepository(WorldDocumentChangeRecord).findBy({
    commitId: applied.id
  })
  return { commit: applied, changes }
}
