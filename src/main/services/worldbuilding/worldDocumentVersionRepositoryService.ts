import { randomUUID } from 'node:crypto'
import { In } from 'typeorm'
import { AppDataSource } from '../../database'
import { WorldDocumentCommitRecord } from '@share/entity/database/WorldDocumentCommitRecord'
import { WorldDocumentTreeObjectRecord } from '@share/entity/database/WorldDocumentTreeObjectRecord'
import { WorldDocumentChangeRecord } from '@share/entity/database/WorldDocumentChangeRecord'
import { WorldDocumentCheckpointRecord } from '@share/entity/database/WorldDocumentCheckpointRecord'
import { WorldDocumentBranchRecord } from '@share/entity/database/WorldDocumentBranchRecord'
import { WorldDocumentContentVersionRecord } from '@share/entity/database/WorldDocumentContentVersionRecord'
import {
  checkoutWorldDocumentCommitWithManager,
  applyWorldDocumentCommitWithManager,
  commitWorldDocumentChangeSetWithManager,
  ensureActiveWorldDocumentBranchWithManager,
  ensureWorldDocumentBaselineWithManager,
  readTreeDocuments,
  reconcilePendingWorldDocumentChangeSetsWithDataSource,
  restoreWorldDocumentCommitWithManager
} from './worldDocumentVersionService'
import { buildWorldDocumentContentDiff } from './worldDocumentDiffService'
import {
  getCachedWorldDocumentIntegrityReport,
  inspectWorldDocumentHistory as inspectWorldDocumentHistoryWithDataSource,
  pruneUnreachableWorldDocumentObjects as pruneUnreachableWorldDocumentObjectsWithDataSource
} from './worldDocumentIntegrityService'
import {
  applyWorldDocumentMergeWithManager,
  previewWorldDocumentMergeWithManager
} from './worldDocumentMergeService'
import type {
  ApplyWorldDocumentMergeInput,
  ApplyWorldDocumentCommitInput,
  CompareWorldDocumentCommitsInput,
  CreateWorldDocumentBranchInput,
  RenameWorldDocumentBranchInput,
  PreviewWorldDocumentMergeInput,
  RestoreWorldDocumentCommitInput,
  RestoreWorldDocumentCommitResult,
  SaveWorldDocumentCheckpointInput,
  WorldDocumentBranchPayload,
  WorldDocumentCheckpointPayload,
  WorldDocumentCommitComparisonPayload,
  WorldDocumentCommitChangePayload,
  WorldDocumentCommitDetailPayload,
  WorldDocumentCommitHistoryPayload,
  WorldDocumentCommitSummary,
  WorldDocumentHistoryNodeState,
  WorldDocumentIntegrityReport,
  WorldDocumentGarbageCollectionResult,
  WorldDocumentMergePreviewPayload,
  WorldDocumentVersionStatusPayload
} from '@share/cache/worldbuilding/worldDocumentHistory'
import type { ResolveWorldEntityDocumentHistorySessionInput } from '@share/cache/worldbuilding/worldEntityDocument'
import { resolveWorldDocumentHumanSessionWithDataSource } from './worldDocumentHumanSessionService'
import { getWorldDocumentDiffByRefWithDataSource } from './worldDocumentDiffReferenceResolver'

type StoredDocumentState = Omit<WorldDocumentHistoryNodeState, 'documentId'> & { id: string }

const isBaselineCommit = (commit: WorldDocumentCommitRecord): boolean =>
  commit.changeSetId.startsWith('baseline:')

const parseState = (value: string | null): WorldDocumentHistoryNodeState | undefined => {
  if (!value) return undefined
  const state = JSON.parse(value) as StoredDocumentState
  return {
    documentId: state.id,
    parentDocumentId: state.parentDocumentId,
    title: state.title,
    sortKey: state.sortKey,
    revision: state.revision
  }
}

const toChangePayload = (
  change: WorldDocumentChangeRecord,
  contentById = new Map<string, WorldDocumentContentVersionRecord>()
): WorldDocumentCommitChangePayload => {
  const beforeContent = change.beforeContentVersionId
    ? contentById.get(change.beforeContentVersionId)
    : undefined
  const afterContent = change.afterContentVersionId
    ? contentById.get(change.afterContentVersionId)
    : undefined
  const beforeSource = beforeContent
    ? { format: beforeContent.sourceFormat, content: beforeContent.contentSource }
    : change.beforeSourceFormat
    ? { format: change.beforeSourceFormat, content: change.beforeContentSource ?? '' }
    : null
  const afterSource = afterContent
    ? { format: afterContent.sourceFormat, content: afterContent.contentSource }
    : change.sourceFormat
    ? { format: change.sourceFormat, content: change.contentSource ?? '' }
    : null
  const contentDiff =
    change.operation === 'create'
      ? buildWorldDocumentContentDiff(null, afterSource)
      : change.operation === 'delete'
        ? buildWorldDocumentContentDiff(beforeSource, null)
        : afterSource
          ? buildWorldDocumentContentDiff(beforeSource, afterSource)
          : undefined
  return {
    id: change.id,
    documentId: change.documentId,
    operation: change.operation,
    summary: change.summary,
    before: parseState(change.beforeStateJson),
    after: parseState(change.afterStateJson),
    contentDiff
  }
}

const toCommitSummary = (
  commit: WorldDocumentCommitRecord,
  changes: WorldDocumentChangeRecord[]
): WorldDocumentCommitSummary => ({
  id: commit.id,
  worldId: commit.worldId,
  branchId: commit.branchId ?? 'main',
  sequence: commit.sequence,
  parentCommitId: commit.parentCommitId,
  mergeParentCommitId: commit.mergeParentCommitId ?? null,
  origin: commit.origin,
  summary: commit.summary,
  intent: commit.intent ?? '',
  restoredFromCommitId: commit.restoredFromCommitId ?? null,
  changeCount: changes.length,
  documentIds: [...new Set(changes.map((change) => change.documentId))],
  operations: [...new Set(changes.map((change) => change.operation))],
  isBaseline: isBaselineCommit(commit),
  createdAt: commit.createdAt.toISOString()
})

const toCheckpointPayload = (
  checkpoint: WorldDocumentCheckpointRecord
): WorldDocumentCheckpointPayload => ({
  id: checkpoint.id,
  worldId: checkpoint.worldId,
  commitId: checkpoint.commitId,
  name: checkpoint.name,
  note: checkpoint.note,
  createdAt: checkpoint.createdAt.toISOString(),
  updatedAt: checkpoint.updatedAt.toISOString()
})

const toBranchPayload = (branch: WorldDocumentBranchRecord): WorldDocumentBranchPayload => ({
  id: branch.id,
  worldId: branch.worldId,
  name: branch.name,
  headCommitId: branch.headCommitId,
  active: branch.active,
  createdAt: branch.createdAt.toISOString(),
  updatedAt: branch.updatedAt.toISOString()
})

const getCommitSummary = async (
  commit: WorldDocumentCommitRecord
): Promise<WorldDocumentCommitSummary> => {
  const changes = await AppDataSource.getRepository(WorldDocumentChangeRecord).findBy({
    commitId: commit.id
  })
  return toCommitSummary(commit, changes)
}

export const commitWorldDocumentChangeSet = (
  changeSetId: string,
  origin: WorldDocumentCommitRecord['origin'] = 'human',
  summary?: string
): Promise<WorldDocumentCommitRecord[]> =>
  AppDataSource.transaction((manager) =>
    commitWorldDocumentChangeSetWithManager(manager, changeSetId, origin, summary)
  )

export const resolveWorldDocumentHumanSession = (
  input: ResolveWorldEntityDocumentHistorySessionInput
) =>
  resolveWorldDocumentHumanSessionWithDataSource(AppDataSource, input)

export const initializeWorldDocumentHistory = async (
  worldId: string
): Promise<WorldDocumentCommitSummary> => {
  const normalizedWorldId = String(worldId || '').trim()
  if (!normalizedWorldId) throw new Error('worldId is required')
  const commit = await AppDataSource.transaction((manager) =>
    ensureWorldDocumentBaselineWithManager(manager, normalizedWorldId)
  )
  return getCommitSummary(commit)
}

export const listWorldDocumentCommits = (worldId: string): Promise<WorldDocumentCommitRecord[]> =>
  AppDataSource.getRepository(WorldDocumentCommitRecord).find({
    where: { worldId },
    order: { sequence: 'DESC' }
  })

export const getWorldDocumentDiffByRef = (diffRef: string) =>
  getWorldDocumentDiffByRefWithDataSource(AppDataSource, diffRef)

export const listWorldDocumentCommitHistory = async (
  worldId: string,
  limit = 50
): Promise<WorldDocumentCommitHistoryPayload> => {
  const normalizedWorldId = String(worldId || '').trim()
  if (!normalizedWorldId) throw new Error('worldId is required')
  const repository = AppDataSource.getRepository(WorldDocumentCommitRecord)
  const latest = await repository.findOne({
    where: { worldId: normalizedWorldId },
    order: { sequence: 'DESC' }
  })
  const branch = await AppDataSource.transaction((manager) =>
    ensureActiveWorldDocumentBranchWithManager(manager, normalizedWorldId, latest?.id ?? null)
  )
  const commits: WorldDocumentCommitRecord[] = []
  let cursor = branch.headCommitId
  const max = Math.min(100, Math.max(1, Math.floor(limit)))
  while (cursor && commits.length < max) {
    const commit = await repository.findOneBy({ id: cursor })
    if (!commit) break
    commits.push(commit)
    cursor = commit.parentCommitId
  }
  const visibleCommits = commits.filter(
    (commit) => commit.origin !== 'system' || isBaselineCommit(commit)
  )
  const changes =
    visibleCommits.length === 0
      ? []
      : await AppDataSource.getRepository(WorldDocumentChangeRecord).findBy({
          commitId: In(visibleCommits.map((commit) => commit.id))
        })
  return {
    headCommitId: branch.headCommitId ?? undefined,
    commits: visibleCommits.map((commit) =>
      toCommitSummary(
        commit,
        changes.filter((change) => change.commitId === commit.id)
      )
    )
  }
}

export const getWorldDocumentCommitDetail = async (
  commitId: string
): Promise<WorldDocumentCommitDetailPayload | null> => {
  const normalizedCommitId = String(commitId || '').trim()
  if (!normalizedCommitId) throw new Error('commitId is required')
  const commit = await AppDataSource.getRepository(WorldDocumentCommitRecord).findOneBy({
    id: normalizedCommitId
  })
  if (!commit || (commit.origin === 'system' && !isBaselineCommit(commit))) return null
  const changes = await AppDataSource.getRepository(WorldDocumentChangeRecord).find({
    where: { commitId: commit.id },
    order: { createdAt: 'ASC' }
  })
  const contentIds = [
    ...new Set(
      changes.flatMap((change) =>
        [change.beforeContentVersionId, change.afterContentVersionId].filter(Boolean) as string[]
      )
    )
  ]
  const contents = contentIds.length
    ? await AppDataSource.getRepository(WorldDocumentContentVersionRecord).findBy({
        id: In(contentIds)
      })
    : []
  const contentById = new Map(contents.map((content) => [content.id, content]))
  const documents = await AppDataSource.transaction((manager) =>
    readTreeDocuments(manager, commit.worldId, commit.rootTreeHash)
  )
  return {
    commit: toCommitSummary(commit, changes),
    documents: [...documents.values()].map(snapshotState),
    changes: changes.map((change) => toChangePayload(change, contentById))
  }
}

export const readWorldDocumentTreeObject = (
  hashes: string[]
): Promise<WorldDocumentTreeObjectRecord[]> =>
  hashes.length === 0
    ? Promise.resolve([])
    : AppDataSource.getRepository(WorldDocumentTreeObjectRecord).findBy({ hash: In(hashes) })

export const reconcilePendingWorldDocumentChangeSets = () =>
  reconcilePendingWorldDocumentChangeSetsWithDataSource(AppDataSource)

export const inspectWorldDocumentHistory = (
  worldId?: string
): Promise<WorldDocumentIntegrityReport> =>
  inspectWorldDocumentHistoryWithDataSource(AppDataSource, worldId)

export const pruneUnreachableWorldDocumentObjects = (
  dryRun = true
): Promise<WorldDocumentGarbageCollectionResult> =>
  pruneUnreachableWorldDocumentObjectsWithDataSource(AppDataSource, dryRun)

export const listWorldDocumentCheckpoints = async (
  worldId: string
): Promise<WorldDocumentCheckpointPayload[]> => {
  const records = await AppDataSource.getRepository(WorldDocumentCheckpointRecord).find({
    where: { worldId: String(worldId || '').trim() },
    order: { updatedAt: 'DESC' }
  })
  return records.map(toCheckpointPayload)
}

export const listWorldDocumentBranches = async (
  worldId: string
): Promise<WorldDocumentBranchPayload[]> => {
  const records = await AppDataSource.getRepository(WorldDocumentBranchRecord).find({
    where: { worldId: String(worldId || '').trim() },
    order: { createdAt: 'ASC' }
  })
  return records.map(toBranchPayload)
}

export const createWorldDocumentBranch = async (
  input: CreateWorldDocumentBranchInput
): Promise<WorldDocumentBranchPayload> => {
  const worldId = String(input.worldId || '').trim()
  const name = String(input.name || '').trim()
  if (!worldId || !name) throw new Error('世界和方案名称不能为空。')
  if (name.length > 60) throw new Error('方案名称不能超过 60 个字符。')
  const saved = await AppDataSource.transaction(async (manager) => {
    const commits = manager.getRepository(WorldDocumentCommitRecord)
    const latest = await commits.findOne({ where: { worldId }, order: { sequence: 'DESC' } })
    const active = await ensureActiveWorldDocumentBranchWithManager(manager, worldId, latest?.id ?? null)
    const headCommitId = String(input.fromCommitId || '').trim() || active.headCommitId
    if (headCommitId && !(await commits.findOneBy({ id: headCommitId, worldId }))) {
      throw new Error('创建方案所依据的版本不存在。')
    }
    return manager.getRepository(WorldDocumentBranchRecord).save(
      manager.getRepository(WorldDocumentBranchRecord).create({
        id: randomUUID(),
        worldId,
        name,
        headCommitId: headCommitId ?? null,
        active: false
      })
    )
  })
  return toBranchPayload(saved)
}

export const renameWorldDocumentBranch = async (
  input: RenameWorldDocumentBranchInput
): Promise<WorldDocumentBranchPayload> => {
  const name = String(input.name || '').trim()
  if (!name) throw new Error('方案名称不能为空。')
  return AppDataSource.transaction(async (manager) => {
    const repository = manager.getRepository(WorldDocumentBranchRecord)
    const branch = await repository.findOneByOrFail({ id: String(input.branchId || '').trim() })
    const duplicate = await repository.findOneBy({ worldId: branch.worldId, name })
    if (duplicate && duplicate.id !== branch.id) throw new Error('同名设定方案已存在。')
    branch.name = name
    return toBranchPayload(await repository.save(branch))
  })
}

export const deleteWorldDocumentBranch = async (branchId: string): Promise<void> => {
  await AppDataSource.transaction(async (manager) => {
    const repository = manager.getRepository(WorldDocumentBranchRecord)
    const branch = await repository.findOneByOrFail({ id: String(branchId || '').trim() })
    if (branch.active) throw new Error('不能删除当前正在使用的设定方案。')
    const branchCount = await repository.countBy({ worldId: branch.worldId })
    if (branchCount <= 1) throw new Error('世界至少需要保留一个设定方案。')
    await repository.remove(branch)
  })
}

export const switchWorldDocumentBranch = async (
  branchId: string
): Promise<WorldDocumentBranchPayload> => {
  const switched = await AppDataSource.transaction(async (manager) => {
    const repository = manager.getRepository(WorldDocumentBranchRecord)
    const target = await repository.findOneByOrFail({ id: String(branchId || '').trim() })
    if (target.active) return target
    if (target.headCommitId) await checkoutWorldDocumentCommitWithManager(manager, target.headCommitId)
    const branches = await repository.findBy({ worldId: target.worldId })
    for (const branch of branches) branch.active = branch.id === target.id
    await repository.save(branches)
    return branches.find((branch) => branch.id === target.id)!
  })
  return toBranchPayload(switched)
}

export const previewWorldDocumentMerge = (
  input: PreviewWorldDocumentMergeInput
): Promise<WorldDocumentMergePreviewPayload> =>
  AppDataSource.transaction((manager) =>
    previewWorldDocumentMergeWithManager(manager, input.sourceBranchId)
  )

export const applyWorldDocumentMerge = async (
  input: ApplyWorldDocumentMergeInput
): Promise<WorldDocumentCommitSummary> => {
  const commit = await AppDataSource.transaction((manager) =>
    applyWorldDocumentMergeWithManager(manager, input)
  )
  return getCommitSummary(commit)
}

export const saveWorldDocumentCheckpoint = async (
  input: SaveWorldDocumentCheckpointInput
): Promise<WorldDocumentCheckpointPayload> => {
  const worldId = String(input.worldId || '').trim()
  const commitId = String(input.commitId || '').trim()
  const name = String(input.name || '').trim()
  if (!worldId || !commitId || !name) throw new Error('世界、版本和检查点名称不能为空。')
  if (name.length > 80) throw new Error('检查点名称不能超过 80 个字符。')
  const commit = await AppDataSource.getRepository(WorldDocumentCommitRecord).findOneBy({
    id: commitId,
    worldId
  })
  if (!commit) throw new Error('检查点指向的版本不存在。')
  const repository = AppDataSource.getRepository(WorldDocumentCheckpointRecord)
  const existing = await repository.findOneBy({ worldId, name })
  const saved = await repository.save(
    repository.create({
      ...(existing ?? {}),
      id: existing?.id ?? randomUUID(),
      worldId,
      commitId,
      name,
      note: String(input.note ?? '').trim().slice(0, 500)
    })
  )
  return toCheckpointPayload(saved)
}

export const deleteWorldDocumentCheckpoint = async (checkpointId: string): Promise<void> => {
  const repository = AppDataSource.getRepository(WorldDocumentCheckpointRecord)
  const checkpoint = await repository.findOneBy({ id: String(checkpointId || '').trim() })
  if (checkpoint) await repository.remove(checkpoint)
}

export const getWorldDocumentVersionStatus = async (
  worldId: string
): Promise<WorldDocumentVersionStatusPayload> => {
  const normalizedWorldId = String(worldId || '').trim()
  if (!normalizedWorldId) throw new Error('worldId is required')
  const latest = await AppDataSource.getRepository(WorldDocumentCommitRecord).findOne({
    where: { worldId: normalizedWorldId },
    order: { sequence: 'DESC' }
  })
  const activeBranch = await AppDataSource.transaction((manager) =>
    ensureActiveWorldDocumentBranchWithManager(manager, normalizedWorldId, latest?.id ?? null)
  )
  const head = activeBranch.headCommitId
    ? await AppDataSource.getRepository(WorldDocumentCommitRecord).findOneBy({ id: activeBranch.headCommitId })
    : null
  const staged = await AppDataSource.getRepository(WorldDocumentChangeRecord).findBy({
    worldId: normalizedWorldId,
    status: 'staged'
  })
  const integrity = await getCachedWorldDocumentIntegrityReport(AppDataSource, normalizedWorldId)
  return {
    worldId: normalizedWorldId,
    head: head ? await getCommitSummary(head) : undefined,
    pending: {
      sessionCount: new Set(staged.map((change) => change.changeSetId)).size,
      documentCount: new Set(staged.map((change) => change.documentId)).size,
      documentIds: [...new Set(staged.map((change) => change.documentId))],
      origins: [
        ...new Set(staged.map((change) => (change.changeSetId.startsWith('human:') ? 'human' : 'agent')))
      ]
    },
    checkpoints: await listWorldDocumentCheckpoints(normalizedWorldId),
    branches: await listWorldDocumentBranches(normalizedWorldId),
    integrity: {
      ok: integrity.ok,
      errorCount: integrity.issues.filter((issue) => issue.severity === 'error').length,
      warningCount: integrity.issues.filter((issue) => issue.severity === 'warning').length
    }
  }
}

const snapshotState = (entry: { state: StoredDocumentState }): WorldDocumentHistoryNodeState => ({
  documentId: entry.state.id,
  parentDocumentId: entry.state.parentDocumentId,
  title: entry.state.title,
  sortKey: entry.state.sortKey,
  revision: entry.state.revision
})

export const compareWorldDocumentCommits = async (
  input: CompareWorldDocumentCommitsInput
): Promise<WorldDocumentCommitComparisonPayload> => {
  const repository = AppDataSource.getRepository(WorldDocumentCommitRecord)
  const [base, target] = await Promise.all([
    repository.findOneBy({ id: String(input.baseCommitId || '').trim() }),
    repository.findOneBy({ id: String(input.targetCommitId || '').trim() })
  ])
  if (!base || !target || base.worldId !== target.worldId) {
    throw new Error('只能比较同一世界中存在的两个版本。')
  }
  const [baseDocuments, targetDocuments] = await AppDataSource.transaction((manager) =>
    Promise.all([
      readTreeDocuments(manager, base.worldId, base.rootTreeHash),
      readTreeDocuments(manager, target.worldId, target.rootTreeHash)
    ])
  )
  const selected = new Set((input.documentIds ?? []).map((id) => String(id).trim()).filter(Boolean))
  const ids = [...new Set([...baseDocuments.keys(), ...targetDocuments.keys()])].filter(
    (id) => selected.size === 0 || selected.has(id)
  )
  const changes: WorldDocumentCommitChangePayload[] = []
  for (const documentId of ids) {
    const before = baseDocuments.get(documentId)
    const after = targetDocuments.get(documentId)
    const beforeState = before ? snapshotState(before) : undefined
    const afterState = after ? snapshotState(after) : undefined
    const contentDiff = buildWorldDocumentContentDiff(before?.source ?? null, after?.source ?? null)
    const metadataChanged = JSON.stringify(beforeState) !== JSON.stringify(afterState)
    if (!contentDiff && !metadataChanged) continue
    const operation = !before ? 'create' : !after ? 'delete' : metadataChanged ? 'mixed' : 'update'
    changes.push({
      id: `compare:${base.id}:${target.id}:${documentId}`,
      documentId,
      operation,
      summary: `比较版本 #${base.sequence} 与 #${target.sequence}`,
      before: beforeState,
      after: afterState,
      contentDiff
    })
  }
  return {
    base: await getCommitSummary(base),
    target: await getCommitSummary(target),
    changes
  }
}

export const restoreWorldDocumentCommit = async (
  input: RestoreWorldDocumentCommitInput
): Promise<RestoreWorldDocumentCommitResult> => {
  const result = await AppDataSource.transaction(async (manager) => {
    const commit = await restoreWorldDocumentCommitWithManager(manager, input)
    const changes = await manager.getRepository(WorldDocumentChangeRecord).findBy({
      commitId: commit.id
    })
    return { commit, changes }
  })
  return {
    commit: toCommitSummary(result.commit, result.changes),
    affectedDocumentIds: [...new Set(result.changes.map((change) => change.documentId))]
  }
}

export const applyWorldDocumentCommit = async (
  input: ApplyWorldDocumentCommitInput
): Promise<RestoreWorldDocumentCommitResult> => {
  const result = await AppDataSource.transaction((manager) =>
    applyWorldDocumentCommitWithManager(manager, input)
  )
  return {
    commit: toCommitSummary(result.commit, result.changes),
    affectedDocumentIds: [...new Set(result.changes.map((change) => change.documentId))]
  }
}
