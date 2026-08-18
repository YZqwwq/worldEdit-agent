import { createHash, randomUUID } from 'node:crypto'
import { In, type DataSource, type EntityManager } from 'typeorm'
import { WorldDocumentBranchRecord } from '@share/entity/database/WorldDocumentBranchRecord'
import { WorldDocumentChangeRecord } from '@share/entity/database/WorldDocumentChangeRecord'
import { WorldDocumentCheckpointRecord } from '@share/entity/database/WorldDocumentCheckpointRecord'
import { WorldDocumentCommitRecord } from '@share/entity/database/WorldDocumentCommitRecord'
import { WorldDocumentContentVersionRecord } from '@share/entity/database/WorldDocumentContentVersionRecord'
import { WorldDocumentTreeObjectRecord } from '@share/entity/database/WorldDocumentTreeObjectRecord'
import { checkoutWorldDocumentCommitWithManager } from './worldDocumentVersionService'
import type { WorldDocumentVersionPackageImportResult } from '@share/cache/worldbuilding/worldDocumentHistory'

type TreeEntry = { documentId: string; contentVersionId: string; childrenTreeHash: string | null }

type SerializedBranch = Omit<WorldDocumentBranchRecord, 'createdAt' | 'updatedAt'> & {
  createdAt: string
  updatedAt: string
}
type SerializedCheckpoint = Omit<WorldDocumentCheckpointRecord, 'createdAt' | 'updatedAt'> & {
  createdAt: string
  updatedAt: string
}
type SerializedCommit = Omit<WorldDocumentCommitRecord, 'createdAt'> & { createdAt: string }
type SerializedChange = Omit<WorldDocumentChangeRecord, 'createdAt' | 'updatedAt'> & {
  createdAt: string
  updatedAt: string
}
type SerializedTree = Omit<WorldDocumentTreeObjectRecord, 'createdAt'> & { createdAt: string }
type SerializedContent = Omit<WorldDocumentContentVersionRecord, 'createdAt'> & { createdAt: string }

type VersionPackageUnsigned = {
  format: 'worldedit-document-history'
  version: 1
  worldId: string
  exportedAt: string
  refs: { branches: SerializedBranch[]; checkpoints: SerializedCheckpoint[] }
  objects: {
    commits: SerializedCommit[]
    changes: SerializedChange[]
    trees: SerializedTree[]
    contents: SerializedContent[]
  }
}

export type WorldDocumentVersionPackage = VersionPackageUnsigned & { packageHash: string }

const hashText = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex')

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

const packageHash = (value: VersionPackageUnsigned): string => hashText(canonicalJson(value))

const serializeAs = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T

export const buildWorldDocumentVersionPackageWithDataSource = async (
  dataSource: DataSource,
  worldId: string
): Promise<WorldDocumentVersionPackage> => {
  const normalizedWorldId = String(worldId || '').trim()
  if (!normalizedWorldId) throw new Error('worldId is required')
  const commits = await dataSource.getRepository(WorldDocumentCommitRecord).find({
    where: { worldId: normalizedWorldId },
    order: { sequence: 'ASC' }
  })
  const treeHashes = new Set(commits.map((commit) => commit.rootTreeHash))
  const contentIds = new Set<string>()
  const trees: WorldDocumentTreeObjectRecord[] = []
  const pending = [...treeHashes]
  while (pending.length) {
    const hash = pending.shift()!
    if (trees.some((tree) => tree.hash === hash)) continue
    const tree = await dataSource.getRepository(WorldDocumentTreeObjectRecord).findOneBy({ hash })
    if (!tree) throw new Error(`版本历史引用了缺失的目录对象：${hash}`)
    trees.push(tree)
    for (const entry of JSON.parse(tree.entriesJson) as TreeEntry[]) {
      contentIds.add(entry.contentVersionId)
      if (entry.childrenTreeHash) pending.push(entry.childrenTreeHash)
    }
  }
  const [branches, checkpoints, changes, contents] = await Promise.all([
    dataSource.getRepository(WorldDocumentBranchRecord).find({
      where: { worldId: normalizedWorldId },
      order: { name: 'ASC' }
    }),
    dataSource.getRepository(WorldDocumentCheckpointRecord).find({
      where: { worldId: normalizedWorldId },
      order: { name: 'ASC' }
    }),
    commits.length
      ? dataSource.getRepository(WorldDocumentChangeRecord).find({
          where: { commitId: In(commits.map((commit) => commit.id)) },
          order: { id: 'ASC' }
        })
      : [],
    contentIds.size
      ? dataSource.getRepository(WorldDocumentContentVersionRecord).find({
          where: { id: In([...contentIds]) },
          order: { id: 'ASC' }
        })
      : []
  ])
  const unsigned: VersionPackageUnsigned = {
    format: 'worldedit-document-history',
    version: 1,
    worldId: normalizedWorldId,
    exportedAt: new Date().toISOString(),
    refs: {
      branches: serializeAs<SerializedBranch[]>(branches),
      checkpoints: serializeAs<SerializedCheckpoint[]>(checkpoints)
    },
    objects: {
      commits: serializeAs<SerializedCommit[]>(commits),
      changes: serializeAs<SerializedChange[]>(changes),
      trees: serializeAs<SerializedTree[]>(trees.sort((left, right) => left.hash.localeCompare(right.hash))),
      contents: serializeAs<SerializedContent[]>(contents)
    }
  }
  return { ...unsigned, packageHash: packageHash(unsigned) }
}

function assertArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`版本包字段无效：${label}`)
}

export const validateWorldDocumentVersionPackage = (
  input: unknown,
  expectedWorldId?: string
): WorldDocumentVersionPackage => {
  if (!input || typeof input !== 'object') throw new Error('版本包不是有效对象。')
  const value = input as Partial<WorldDocumentVersionPackage>
  if (value.format !== 'worldedit-document-history' || value.version !== 1) {
    throw new Error('不支持的版本包格式。')
  }
  if (!value.worldId || (expectedWorldId && value.worldId !== expectedWorldId)) {
    throw new Error('版本包不属于当前世界。')
  }
  if (!value.refs || !value.objects || typeof value.packageHash !== 'string') {
    throw new Error('版本包结构不完整。')
  }
  assertArray(value.refs.branches, 'refs.branches')
  assertArray(value.refs.checkpoints, 'refs.checkpoints')
  assertArray(value.objects.commits, 'objects.commits')
  assertArray(value.objects.changes, 'objects.changes')
  assertArray(value.objects.trees, 'objects.trees')
  assertArray(value.objects.contents, 'objects.contents')
  const { packageHash: storedHash, ...unsigned } = value as WorldDocumentVersionPackage
  if (packageHash(unsigned) !== storedHash) throw new Error('版本包校验摘要不匹配，文件可能已损坏或被修改。')

  const contentIds = new Set<string>()
  for (const content of value.objects.contents) {
    if (contentIds.has(content.id)) throw new Error(`版本包包含重复内容对象：${content.id}`)
    contentIds.add(content.id)
    const expectedHash = hashText(`${content.sourceFormat}\u0000${content.contentSource}`)
    const expectedId = `content:${hashText(`${content.documentId}\u0000${content.sourceFormat}\u0000${content.contentSource}`)}`
    if (content.contentHash !== expectedHash || content.id !== expectedId || content.worldId !== value.worldId) {
      throw new Error(`内容对象校验失败：${content.id}`)
    }
  }
  const treeHashes = new Set<string>()
  for (const tree of value.objects.trees) {
    if (treeHashes.has(tree.hash) || hashText(tree.entriesJson) !== tree.hash) {
      throw new Error(`目录对象校验失败：${tree.hash}`)
    }
    treeHashes.add(tree.hash)
    const entries = JSON.parse(tree.entriesJson) as TreeEntry[]
    if (!Array.isArray(entries)) throw new Error(`目录对象内容无效：${tree.hash}`)
    for (const entry of entries) {
      if (!contentIds.has(entry.contentVersionId)) throw new Error(`目录对象引用缺失内容：${entry.contentVersionId}`)
      if (entry.childrenTreeHash && !value.objects.trees.some((item) => item.hash === entry.childrenTreeHash)) {
        throw new Error(`目录对象引用缺失子目录：${entry.childrenTreeHash}`)
      }
    }
  }
  const commits = [...value.objects.commits].sort((left, right) => left.sequence - right.sequence)
  const commitById = new Map<string, SerializedCommit>()
  for (let index = 0; index < commits.length; index += 1) {
    const commit = commits[index]
    if (commit.sequence !== index + 1 || commit.worldId !== value.worldId || commitById.has(commit.id)) {
      throw new Error(`提交序列无效：${commit.id}`)
    }
    if (!treeHashes.has(commit.rootTreeHash)) throw new Error(`提交引用缺失目录：${commit.id}`)
    for (const parentId of [commit.parentCommitId, commit.mergeParentCommitId].filter(Boolean) as string[]) {
      const parent = commitById.get(parentId)
      if (!parent || parent.sequence >= commit.sequence) throw new Error(`提交父引用无效：${commit.id}`)
    }
    commitById.set(commit.id, commit)
  }
  const changeIds = new Set<string>()
  for (const change of value.objects.changes) {
    if (changeIds.has(change.id) || change.worldId !== value.worldId || !change.commitId || !commitById.has(change.commitId)) {
      throw new Error(`变更记录无效：${change.id}`)
    }
    changeIds.add(change.id)
  }
  for (const branch of value.refs.branches) {
    if (branch.worldId !== value.worldId || (branch.headCommitId && !commitById.has(branch.headCommitId))) {
      throw new Error(`方案引用无效：${branch.id}`)
    }
  }
  for (const checkpoint of value.refs.checkpoints) {
    if (checkpoint.worldId !== value.worldId || !commitById.has(checkpoint.commitId)) {
      throw new Error(`检查点引用无效：${checkpoint.id}`)
    }
  }
  return value as WorldDocumentVersionPackage
}

const coreCommit = (commit: SerializedCommit | WorldDocumentCommitRecord) => ({
  id: commit.id,
  worldId: commit.worldId,
  branchId: commit.branchId,
  sequence: commit.sequence,
  parentCommitId: commit.parentCommitId,
  mergeParentCommitId: commit.mergeParentCommitId,
  changeSetId: commit.changeSetId,
  rootTreeHash: commit.rootTreeHash,
  origin: commit.origin,
  summary: commit.summary,
  restoredFromCommitId: commit.restoredFromCommitId,
  intent: commit.intent
})

const uniqueImportedName = async (
  manager: EntityManager,
  worldId: string,
  baseName: string,
  kind: 'branch' | 'checkpoint'
): Promise<string> => {
  const repository = kind === 'branch'
    ? manager.getRepository(WorldDocumentBranchRecord)
    : manager.getRepository(WorldDocumentCheckpointRecord)
  let name = `${baseName}（导入）`
  let suffix = 2
  while (await repository.findOneBy({ worldId, name })) name = `${baseName}（导入 ${suffix++}）`
  return name
}

export const importWorldDocumentVersionPackageWithDataSource = async (
  dataSource: DataSource,
  input: unknown,
  expectedWorldId: string
): Promise<WorldDocumentVersionPackageImportResult> => {
  const value = validateWorldDocumentVersionPackage(input, expectedWorldId)
  return dataSource.transaction(async (manager) => {
    const staged = await manager.getRepository(WorldDocumentChangeRecord).countBy({
      worldId: value.worldId,
      status: 'staged'
    })
    if (staged > 0) throw new Error('当前世界仍有未封口编辑，不能导入版本包。')
    const existingCommits = await manager.getRepository(WorldDocumentCommitRecord).find({
      where: { worldId: value.worldId },
      order: { sequence: 'ASC' }
    })
    const packagedCommits = [...value.objects.commits].sort((left, right) => left.sequence - right.sequence)
    for (const existing of existingCommits) {
      const packaged = packagedCommits.find((commit) => commit.sequence === existing.sequence)
      if (!packaged || canonicalJson(coreCommit(packaged)) !== canonicalJson(coreCommit(existing))) {
        throw new Error('当前历史不是版本包历史的前缀，已拒绝覆盖；请导入到新的世界副本。')
      }
    }

    const result: WorldDocumentVersionPackageImportResult = {
      imported: { commits: 0, changes: 0, trees: 0, contents: 0, branches: 0, checkpoints: 0 },
      skipped: { commits: 0, changes: 0, trees: 0, contents: 0 }
    }
    const contentRepository = manager.getRepository(WorldDocumentContentVersionRecord)
    for (const content of value.objects.contents) {
      const existing = await contentRepository.findOneBy({ id: content.id })
      if (existing) {
        if (existing.contentHash !== content.contentHash || existing.worldId !== content.worldId) throw new Error(`内容对象冲突：${content.id}`)
        result.skipped.contents += 1
      } else {
        await contentRepository.save(contentRepository.create({ ...content, createdAt: new Date(content.createdAt) }))
        result.imported.contents += 1
      }
    }
    const treeRepository = manager.getRepository(WorldDocumentTreeObjectRecord)
    for (const tree of value.objects.trees) {
      const existing = await treeRepository.findOneBy({ hash: tree.hash })
      if (existing) {
        if (existing.entriesJson !== tree.entriesJson) throw new Error(`目录对象冲突：${tree.hash}`)
        result.skipped.trees += 1
      } else {
        await treeRepository.save(treeRepository.create({ ...tree, createdAt: new Date(tree.createdAt) }))
        result.imported.trees += 1
      }
    }
    const commitRepository = manager.getRepository(WorldDocumentCommitRecord)
    for (const commit of packagedCommits) {
      const existing = await commitRepository.findOneBy({ id: commit.id })
      if (existing) result.skipped.commits += 1
      else {
        await commitRepository.save(commitRepository.create({ ...commit, createdAt: new Date(commit.createdAt) }))
        result.imported.commits += 1
      }
    }
    const changeRepository = manager.getRepository(WorldDocumentChangeRecord)
    for (const change of value.objects.changes) {
      const existing = await changeRepository.findOneBy({ id: change.id })
      if (existing) result.skipped.changes += 1
      else {
        await changeRepository.save(changeRepository.create({
          ...change,
          createdAt: new Date(change.createdAt),
          updatedAt: new Date(change.updatedAt)
        }))
        result.imported.changes += 1
      }
    }

    const branchRepository = manager.getRepository(WorldDocumentBranchRecord)
    const hadHistory = existingCommits.length > 0
    const existingActive = await branchRepository.findOneBy({ worldId: value.worldId, active: true })
    let branchToCheckout: WorldDocumentBranchRecord | null = null
    for (const branch of value.refs.branches) {
      const equivalentBranch = (await branchRepository.findBy({ worldId: value.worldId })).find(
        (item) =>
          item.headCommitId === branch.headCommitId &&
          (item.name === branch.name || item.name.startsWith(`${branch.name}（导入`))
      )
      if (equivalentBranch) continue
      const imported = branchRepository.create({
        ...branch,
        id: hadHistory || (await branchRepository.findOneBy({ id: branch.id })) ? randomUUID() : branch.id,
        name: hadHistory
          ? await uniqueImportedName(manager, value.worldId, branch.name, 'branch')
          : branch.name,
        active: !existingActive && !branchToCheckout && branch.active,
        createdAt: new Date(branch.createdAt),
        updatedAt: new Date(branch.updatedAt)
      })
      await branchRepository.save(imported)
      if (imported.active) branchToCheckout = imported
      result.imported.branches += 1
    }
    if (branchToCheckout?.headCommitId) {
      await checkoutWorldDocumentCommitWithManager(manager, branchToCheckout.headCommitId)
    }

    const checkpointRepository = manager.getRepository(WorldDocumentCheckpointRecord)
    for (const checkpoint of value.refs.checkpoints) {
      const equivalentCheckpoint = (await checkpointRepository.findBy({
        worldId: value.worldId,
        commitId: checkpoint.commitId
      })).find((item) => item.name === checkpoint.name || item.name.startsWith(`${checkpoint.name}（导入`))
      if (equivalentCheckpoint) continue
      const duplicate = await checkpointRepository.findOneBy({ worldId: value.worldId, name: checkpoint.name })
      await checkpointRepository.save(checkpointRepository.create({
        ...checkpoint,
        id: await checkpointRepository.findOneBy({ id: checkpoint.id }) ? randomUUID() : checkpoint.id,
        name: duplicate
          ? await uniqueImportedName(manager, value.worldId, checkpoint.name, 'checkpoint')
          : checkpoint.name,
        createdAt: new Date(checkpoint.createdAt),
        updatedAt: new Date(checkpoint.updatedAt)
      }))
      result.imported.checkpoints += 1
    }
    return result
  })
}
