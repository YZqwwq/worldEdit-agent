import { createHash } from 'node:crypto'
import { In, type DataSource, type EntityManager } from 'typeorm'
import { WorldDocumentChangeRecord } from '@share/entity/database/WorldDocumentChangeRecord'
import { WorldDocumentCommitRecord } from '@share/entity/database/WorldDocumentCommitRecord'
import { WorldDocumentBranchRecord } from '@share/entity/database/WorldDocumentBranchRecord'
import { WorldDocumentContentVersionRecord } from '@share/entity/database/WorldDocumentContentVersionRecord'
import { WorldDocumentTreeObjectRecord } from '@share/entity/database/WorldDocumentTreeObjectRecord'
import { WorldDocumentIntegrityCacheRecord } from '@share/entity/database/WorldDocumentIntegrityCacheRecord'
import { MainAgentToolEffectReceiptRecord } from '@share/entity/database/MainAgentToolEffectReceiptRecord'
import { parseWorldDocumentDiffRef } from './worldDocumentDiffReferenceResolver'
import type {
  WorldDocumentIntegrityIssue,
  WorldDocumentIntegrityReport,
  WorldDocumentGarbageCollectionResult
} from '@share/cache/worldbuilding/worldDocumentHistory'

type StoredTreeEntry = {
  documentId: string
  contentVersionId: string
  childrenTreeHash: string | null
}

export const pruneUnreachableWorldDocumentObjects = async (
  dataSource: DataSource,
  dryRun = true
): Promise<WorldDocumentGarbageCollectionResult> => {
  const report = await inspectWorldDocumentHistory(dataSource)
  if (!report.ok) throw new Error('文档历史存在完整性错误，修复前不能清理对象。')
  const treeHashes = report.issues
    .filter((issue) => issue.code === 'UNREACHABLE_TREE_OBJECT' && issue.reference)
    .map((issue) => issue.reference!)
  const contentIds = report.issues
    .filter((issue) => issue.code === 'UNREACHABLE_CONTENT_VERSION' && issue.reference)
    .map((issue) => issue.reference!)
  if (!dryRun && (treeHashes.length > 0 || contentIds.length > 0)) {
    await dataSource.transaction(async (manager) => {
      if (treeHashes.length > 0) {
        await manager.getRepository(WorldDocumentTreeObjectRecord).delete({ hash: In(treeHashes) })
      }
      if (contentIds.length > 0) {
        await manager.getRepository(WorldDocumentContentVersionRecord).delete({ id: In(contentIds) })
      }
    })
  }
  return {
    dryRun,
    removedTreeCount: treeHashes.length,
    removedContentVersionCount: contentIds.length
  }
}

const hashText = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex')

const expectedContentId = (content: WorldDocumentContentVersionRecord): string =>
  `content:${hashText(
    `${content.documentId}\u0000${content.sourceFormat}\u0000${content.contentSource}`
  )}`

export const inspectWorldDocumentHistory = async (
  dataSource: DataSource | EntityManager,
  worldId?: string
): Promise<WorldDocumentIntegrityReport> => {
  const normalizedWorldId = String(worldId || '').trim()
  const commits = await dataSource.getRepository(WorldDocumentCommitRecord).find({
    ...(normalizedWorldId ? { where: { worldId: normalizedWorldId } } : {}),
    order: { worldId: 'ASC', sequence: 'ASC' }
  })
  const branches = await dataSource.getRepository(WorldDocumentBranchRecord).find({
    where: worldId ? { worldId } : undefined
  })
  const changes = await dataSource.getRepository(WorldDocumentChangeRecord).find(
    normalizedWorldId ? { where: { worldId: normalizedWorldId } } : {}
  )
  const allTrees = await dataSource.getRepository(WorldDocumentTreeObjectRecord).find()
  const allContents = await dataSource.getRepository(WorldDocumentContentVersionRecord).find(
    normalizedWorldId ? { where: { worldId: normalizedWorldId } } : {}
  )
  const contentById = new Map(allContents.map((content) => [content.id, content]))
  const commitById = new Map(commits.map((commit) => [commit.id, commit]))
  const commitByChangeSetAndWorld = new Map(
    commits.map((commit) => [`${commit.worldId}\u0000${commit.changeSetId}`, commit])
  )
  const issues: WorldDocumentIntegrityIssue[] = []
  const issueKeys = new Set<string>()
  const addIssue = (issue: WorldDocumentIntegrityIssue): void => {
    const key = `${issue.code}\u0000${issue.reference ?? ''}`
    if (issueKeys.has(key)) return
    issueKeys.add(key)
    issues.push(issue)
  }

  const parsedTrees = new Map<string, StoredTreeEntry[] | null>()
  for (const tree of allTrees) {
    if (hashText(tree.entriesJson) !== tree.hash) {
      addIssue({
        severity: 'error',
        code: 'TREE_HASH_MISMATCH',
        message: 'Tree object content does not match its hash.',
        reference: tree.hash
      })
    }
    try {
      const entries = JSON.parse(tree.entriesJson) as unknown
      if (!Array.isArray(entries)) throw new Error('Tree entries must be an array')
      parsedTrees.set(tree.hash, entries as StoredTreeEntry[])
    } catch {
      parsedTrees.set(tree.hash, null)
      addIssue({
        severity: 'error',
        code: 'TREE_PARSE_ERROR',
        message: 'Tree object cannot be parsed.',
        reference: tree.hash
      })
    }
  }

  for (const content of allContents) {
    const expectedHash = hashText(`${content.sourceFormat}\u0000${content.contentSource}`)
    if (content.contentHash !== expectedHash) {
      addIssue({
        severity: 'error',
        code: 'CONTENT_HASH_MISMATCH',
        message: 'Content version source does not match its content hash.',
        reference: content.id
      })
    }
    if (content.id !== expectedContentId(content)) {
      addIssue({
        severity: 'error',
        code: 'CONTENT_ID_MISMATCH',
        message: 'Content version identity does not match its source.',
        reference: content.id
      })
    }
  }

  const reachableTrees = new Set<string>()
  const reachableContents = new Set<string>()
  const contentIdsByDocumentRevision = new Map<string, string[]>()
  for (const content of allContents) {
    const key = `${content.documentId}\u0000${content.sourceRevision}`
    contentIdsByDocumentRevision.set(key, [
      ...(contentIdsByDocumentRevision.get(key) ?? []),
      content.id
    ])
  }
  const connection = 'connection' in dataSource ? dataSource.connection : dataSource
  if (connection.hasMetadata(MainAgentToolEffectReceiptRecord)) {
    const receipts = await dataSource.getRepository(MainAgentToolEffectReceiptRecord).find()
    for (const receipt of receipts) {
      const parsed = receipt.diffRef ? parseWorldDocumentDiffRef(receipt.diffRef) : null
      if (!parsed) continue
      for (const revision of [parsed.beforeRevision, parsed.afterRevision]) {
        for (const contentId of
          contentIdsByDocumentRevision.get(`${parsed.documentId}\u0000${revision}`) ?? []) {
          reachableContents.add(contentId)
        }
      }
    }
  }
  const visitTree = (
    treeHash: string,
    commit: WorldDocumentCommitRecord,
    ancestors: Set<string>,
    documentIds: Set<string>
  ): void => {
    if (ancestors.has(treeHash)) {
      addIssue({
        severity: 'error',
        code: 'TREE_CYCLE',
        message: 'Tree object contains a cyclic child reference.',
        reference: `${commit.id}:${treeHash}`
      })
      return
    }
    const entries = parsedTrees.get(treeHash)
    if (entries === undefined) {
      addIssue({
        severity: 'error',
        code: 'MISSING_TREE_OBJECT',
        message: 'Commit tree references a missing tree object.',
        reference: `${commit.id}:${treeHash}`
      })
      return
    }
    if (!entries) return
    reachableTrees.add(treeHash)
    const nextAncestors = new Set(ancestors).add(treeHash)
    for (const entry of entries) {
      if (!entry || typeof entry.documentId !== 'string') {
        addIssue({
          severity: 'error',
          code: 'INVALID_TREE_ENTRY',
          message: 'Tree object contains an invalid entry.',
          reference: treeHash
        })
        continue
      }
      if (documentIds.has(entry.documentId)) {
        addIssue({
          severity: 'error',
          code: 'DUPLICATE_DOCUMENT_ENTRY',
          message: 'One commit tree contains the same document more than once.',
          reference: `${commit.id}:${entry.documentId}`
        })
      }
      documentIds.add(entry.documentId)
      const content = contentById.get(entry.contentVersionId)
      if (!content) {
        addIssue({
          severity: 'error',
          code: 'MISSING_CONTENT_VERSION',
          message: 'Tree entry references a missing content version.',
          reference: `${commit.id}:${entry.contentVersionId}`
        })
      } else {
        reachableContents.add(content.id)
        if (content.worldId !== commit.worldId || content.documentId !== entry.documentId) {
          addIssue({
            severity: 'error',
            code: 'CONTENT_OWNER_MISMATCH',
            message: 'Tree entry references content owned by another world or document.',
            reference: `${commit.id}:${entry.documentId}`
          })
        }
      }
      if (entry.childrenTreeHash) {
        visitTree(entry.childrenTreeHash, commit, nextAncestors, documentIds)
      }
    }
  }

  const commitsByWorld = new Map<string, WorldDocumentCommitRecord[]>()
  for (const commit of commits) {
    const worldCommits = commitsByWorld.get(commit.worldId) ?? []
    worldCommits.push(commit)
    commitsByWorld.set(commit.worldId, worldCommits)
    visitTree(commit.rootTreeHash, commit, new Set(), new Set())
  }
  for (const [currentWorldId, worldCommits] of commitsByWorld) {
    const byId = new Map(worldCommits.map((commit) => [commit.id, commit]))
    for (let index = 0; index < worldCommits.length; index += 1) {
      const commit = worldCommits[index]
      if (commit.sequence !== index + 1) {
        addIssue({
          severity: 'error',
          code: 'COMMIT_SEQUENCE_GAP',
          message: 'World commit sequence is not contiguous.',
          reference: `${currentWorldId}:${commit.id}`
        })
      }
      const parent = commit.parentCommitId ? byId.get(commit.parentCommitId) : null
      if (commit.parentCommitId && (!parent || parent.sequence >= commit.sequence)) {
        addIssue({
          severity: 'error',
          code: 'COMMIT_PARENT_MISMATCH',
          message: 'World commit parent is missing, belongs to another world, or is not older.',
          reference: `${currentWorldId}:${commit.id}`
        })
      }
      const mergeParent = commit.mergeParentCommitId
        ? byId.get(commit.mergeParentCommitId)
        : null
      if (
        commit.mergeParentCommitId &&
        (!mergeParent || mergeParent.sequence >= commit.sequence)
      ) {
        addIssue({
          severity: 'error',
          code: 'COMMIT_MERGE_PARENT_MISMATCH',
          message: 'Merge parent is missing, belongs to another world, or is not older.',
          reference: `${currentWorldId}:${commit.id}`
        })
      }
    }
  }

  for (const currentWorldId of new Set([...commitsByWorld.keys(), ...branches.map((branch) => branch.worldId)])) {
    const worldBranches = branches.filter((branch) => branch.worldId === currentWorldId)
    if (worldBranches.filter((branch) => branch.active).length !== 1) {
      addIssue({
        severity: 'error',
        code: 'INVALID_ACTIVE_BRANCH_COUNT',
        message: 'World must have exactly one active document branch.',
        reference: currentWorldId
      })
    }
    const commitIds = new Set((commitsByWorld.get(currentWorldId) ?? []).map((commit) => commit.id))
    for (const branch of worldBranches) {
      if (branch.headCommitId && !commitIds.has(branch.headCommitId)) {
        addIssue({
          severity: 'error',
          code: 'MISSING_BRANCH_HEAD',
          message: 'Document branch points to a missing commit.',
          reference: branch.id
        })
      }
    }
  }

  for (const change of changes) {
    for (const [side, contentId] of [
      ['before', change.beforeContentVersionId],
      ['after', change.afterContentVersionId]
    ] as const) {
      if (!contentId) continue
      const content = contentById.get(contentId)
      if (!content) {
        addIssue({
          severity: 'error',
          code: 'MISSING_CHANGE_CONTENT_VERSION',
          message: 'Change record references a missing content version.',
          reference: `${change.id}:${side}`
        })
      } else if (content.worldId !== change.worldId || content.documentId !== change.documentId) {
        addIssue({
          severity: 'error',
          code: 'CHANGE_CONTENT_OWNER_MISMATCH',
          message: 'Change record references content owned by another world or document.',
          reference: `${change.id}:${side}`
        })
      } else {
        reachableContents.add(content.id)
      }
    }
    const matchingCommit = commitByChangeSetAndWorld.get(
      `${change.worldId}\u0000${change.changeSetId}`
    )
    if (change.status === 'staged') {
      if (matchingCommit) {
        addIssue({
          severity: 'error',
          code: 'STAGED_CHANGESET_ALREADY_COMMITTED',
          message: 'A staged change belongs to an already committed change set.',
          reference: change.id
        })
      }
      continue
    }
    const commit = change.commitId ? commitById.get(change.commitId) : undefined
    if (!commit) {
      addIssue({
        severity: 'error',
        code: 'MISSING_CHANGE_COMMIT',
        message: 'Committed change references a missing commit.',
        reference: change.id
      })
    } else if (commit.changeSetId !== change.changeSetId || commit.worldId !== change.worldId) {
      addIssue({
        severity: 'error',
        code: 'CHANGE_COMMIT_MISMATCH',
        message: 'Committed change and commit have different ownership.',
        reference: change.id
      })
    }
  }

  if (!normalizedWorldId) {
    for (const tree of allTrees) {
      if (!reachableTrees.has(tree.hash)) {
        addIssue({
          severity: 'warning',
          code: 'UNREACHABLE_TREE_OBJECT',
          message: 'Tree object is not reachable from any commit.',
          reference: tree.hash
        })
      }
    }
    for (const content of allContents) {
      if (!reachableContents.has(content.id)) {
        addIssue({
          severity: 'warning',
          code: 'UNREACHABLE_CONTENT_VERSION',
          message: 'Content version is not reachable from any commit.',
          reference: content.id
        })
      }
    }
  }

  return {
    ok: issues.every((issue) => issue.severity !== 'error'),
    worldIds: [...commitsByWorld.keys()],
    counts: {
      commits: commits.length,
      changes: changes.length,
      trees: allTrees.length,
      contentVersions: allContents.length
    },
    issues
  }
}

export const getCachedWorldDocumentIntegrityReport = async (
  dataSource: DataSource,
  worldId: string
): Promise<WorldDocumentIntegrityReport> => {
  const normalizedWorldId = String(worldId || '').trim()
  if (!normalizedWorldId) throw new Error('worldId is required')
  return dataSource.transaction(async (manager) => {
    const repository = manager.getRepository(WorldDocumentIntegrityCacheRecord)
    let cache = await repository.findOneBy({ worldId: normalizedWorldId })
    if (
      cache?.reportJson &&
      cache.verifiedGeneration === cache.generation
    ) {
      return JSON.parse(cache.reportJson) as WorldDocumentIntegrityReport
    }
    const report = await inspectWorldDocumentHistory(manager, normalizedWorldId)
    cache ??= repository.create({
      worldId: normalizedWorldId,
      generation: 0,
      verifiedGeneration: -1,
      reportJson: null,
      verifiedAt: null
    })
    cache.verifiedGeneration = cache.generation
    cache.reportJson = JSON.stringify(report)
    cache.verifiedAt = new Date()
    await repository.save(cache)
    return report
  })
}
