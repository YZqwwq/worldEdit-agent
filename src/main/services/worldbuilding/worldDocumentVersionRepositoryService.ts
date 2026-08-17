import { In } from 'typeorm'
import { AppDataSource } from '../../database'
import { WorldDocumentCommitRecord } from '@share/entity/database/WorldDocumentCommitRecord'
import { WorldDocumentTreeObjectRecord } from '@share/entity/database/WorldDocumentTreeObjectRecord'
import { WorldDocumentChangeRecord } from '@share/entity/database/WorldDocumentChangeRecord'
import {
  commitWorldDocumentChangeSetWithManager,
  restoreWorldDocumentCommitWithManager
} from './worldDocumentVersionService'
import { buildWorldDocumentContentDiff } from './worldDocumentDiffService'
import type {
  RestoreWorldDocumentCommitInput,
  RestoreWorldDocumentCommitResult,
  WorldDocumentCommitChangePayload,
  WorldDocumentCommitDetailPayload,
  WorldDocumentCommitHistoryPayload,
  WorldDocumentCommitSummary,
  WorldDocumentHistoryNodeState
} from '@share/cache/worldbuilding/worldDocumentHistory'

type StoredDocumentState = Omit<WorldDocumentHistoryNodeState, 'documentId'> & { id: string }

const parseState = (value: string | null): WorldDocumentHistoryNodeState | undefined => {
  if (!value) return undefined
  const state = JSON.parse(value) as StoredDocumentState
  return {
    documentId: state.id,
    ownerKind: state.ownerKind,
    ownerEntityId: state.ownerEntityId,
    parentDocumentId: state.parentDocumentId,
    title: state.title,
    sortKey: state.sortKey,
    revision: state.revision
  }
}

const toChangePayload = (change: WorldDocumentChangeRecord): WorldDocumentCommitChangePayload => {
  const beforeSource = change.beforeSourceFormat
    ? { format: change.beforeSourceFormat, content: change.beforeContentSource ?? '' }
    : null
  const afterSource = change.sourceFormat
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
  sequence: commit.sequence,
  parentCommitId: commit.parentCommitId,
  origin: commit.origin,
  summary: commit.summary,
  changeCount: changes.length,
  documentIds: [...new Set(changes.map((change) => change.documentId))],
  operations: [...new Set(changes.map((change) => change.operation))],
  createdAt: commit.createdAt.toISOString()
})

export const commitWorldDocumentChangeSet = (
  changeSetId: string,
  origin: WorldDocumentCommitRecord['origin'] = 'human'
): Promise<WorldDocumentCommitRecord[]> =>
  AppDataSource.transaction((manager) =>
    commitWorldDocumentChangeSetWithManager(manager, changeSetId, origin)
  )

export const listWorldDocumentCommits = (worldId: string): Promise<WorldDocumentCommitRecord[]> =>
  AppDataSource.getRepository(WorldDocumentCommitRecord).find({
    where: { worldId },
    order: { sequence: 'DESC' }
  })

export const listWorldDocumentCommitHistory = async (
  worldId: string,
  limit = 50
): Promise<WorldDocumentCommitHistoryPayload> => {
  const normalizedWorldId = String(worldId || '').trim()
  if (!normalizedWorldId) throw new Error('worldId is required')
  const repository = AppDataSource.getRepository(WorldDocumentCommitRecord)
  const head = await repository.findOne({
    where: { worldId: normalizedWorldId },
    order: { sequence: 'DESC' }
  })
  const commits = await repository.find({
    where: { worldId: normalizedWorldId },
    order: { sequence: 'DESC' },
    take: Math.min(100, Math.max(1, Math.floor(limit)))
  })
  const visibleCommits = commits.filter((commit) => commit.origin !== 'system')
  const changes =
    visibleCommits.length === 0
      ? []
      : await AppDataSource.getRepository(WorldDocumentChangeRecord).findBy({
          commitId: In(visibleCommits.map((commit) => commit.id))
        })
  return {
    headCommitId: head?.id,
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
  if (!commit || commit.origin === 'system') return null
  const changes = await AppDataSource.getRepository(WorldDocumentChangeRecord).find({
    where: { commitId: commit.id },
    order: { createdAt: 'ASC' }
  })
  return {
    commit: toCommitSummary(commit, changes),
    changes: changes.map(toChangePayload)
  }
}

export const readWorldDocumentTreeObject = (
  hashes: string[]
): Promise<WorldDocumentTreeObjectRecord[]> =>
  hashes.length === 0
    ? Promise.resolve([])
    : AppDataSource.getRepository(WorldDocumentTreeObjectRecord).findBy({ hash: In(hashes) })

export const commitPendingWorldDocumentChangeSets = async (): Promise<number> => {
  const staged = await AppDataSource.getRepository(WorldDocumentChangeRecord).findBy({
    status: 'staged'
  })
  const changeSetIds = [...new Set(staged.map((change) => change.changeSetId))]
  for (const changeSetId of changeSetIds) {
    await commitWorldDocumentChangeSet(
      changeSetId,
      changeSetId.startsWith('human:') ? 'human' : 'agent'
    )
  }
  return changeSetIds.length
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
