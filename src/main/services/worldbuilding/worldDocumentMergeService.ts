import { randomUUID } from 'node:crypto'
import type { EntityManager } from 'typeorm'
import { WorldEntityDocumentRecord } from '@share/entity/database/WorldEntityDocumentRecord'
import { WorldDocumentBranchRecord } from '@share/entity/database/WorldDocumentBranchRecord'
import { WorldDocumentCommitRecord } from '@share/entity/database/WorldDocumentCommitRecord'
import type {
  ApplyWorldDocumentMergeInput,
  WorldDocumentMergePreviewPayload
} from '@share/cache/worldbuilding/worldDocumentHistory'
import {
  commitWorldDocumentChangeSetWithManager,
  ensureActiveWorldDocumentBranchWithManager,
  readTreeDocuments,
  stageWorldDocumentChangeWithManager,
  type WorldDocumentSnapshotEntry
} from './worldDocumentVersionService'
import { buildWorldDocumentContentDiff } from './worldDocumentDiffService'
import { worldDocumentMarkdownToHtml } from '../aiservice/ai-utils/tools/document/worldDocumentMarkdownCodec'
import { mergeWorldDocumentText } from './worldDocumentThreeWayTextMerge'

const sourceHtml = (entry: WorldDocumentSnapshotEntry): string =>
  entry.source.format === 'markdown'
    ? worldDocumentMarkdownToHtml(entry.source.content)
    : entry.source.content

const signature = (entry?: WorldDocumentSnapshotEntry): string =>
  entry
    ? JSON.stringify({
        ownerKind: entry.state.ownerKind,
        ownerEntityId: entry.state.ownerEntityId,
        parentDocumentId: entry.state.parentDocumentId,
        title: entry.state.title,
        sortKey: entry.state.sortKey,
        schemaVersion: entry.state.schemaVersion,
        source: entry.source
      })
    : 'absent'

const metadataSignature = (entry: WorldDocumentSnapshotEntry): string =>
  JSON.stringify({
    ownerKind: entry.state.ownerKind,
    ownerEntityId: entry.state.ownerEntityId,
    parentDocumentId: entry.state.parentDocumentId,
    title: entry.state.title,
    sortKey: entry.state.sortKey,
    schemaVersion: entry.state.schemaVersion
  })

const tryMergeDocument = (
  base: WorldDocumentSnapshotEntry,
  current: WorldDocumentSnapshotEntry,
  incoming: WorldDocumentSnapshotEntry
): WorldDocumentSnapshotEntry | null => {
  const baseMetadata = metadataSignature(base)
  const currentMetadata = metadataSignature(current)
  const incomingMetadata = metadataSignature(incoming)
  if (
    currentMetadata !== incomingMetadata &&
    currentMetadata !== baseMetadata &&
    incomingMetadata !== baseMetadata
  ) return null
  if (
    base.source.format !== 'markdown' ||
    current.source.format !== 'markdown' ||
    incoming.source.format !== 'markdown'
  ) return null
  const content = mergeWorldDocumentText(
    base.source.content,
    current.source.content,
    incoming.source.content
  )
  if (content === null) return null
  const state =
    currentMetadata === baseMetadata && incomingMetadata !== baseMetadata
      ? incoming.state
      : current.state
  return {
    state: { ...state, revision: Math.max(current.state.revision, incoming.state.revision) },
    source: { format: 'markdown', content }
  }
}

const ancestors = async (manager: EntityManager, commitId: string): Promise<Map<string, number>> => {
  const result = new Map<string, number>()
  const pending: Array<[string, number]> = [[commitId, 0]]
  while (pending.length) {
    const [id, depth] = pending.shift()!
    if (result.has(id)) continue
    result.set(id, depth)
    const commit = await manager.getRepository(WorldDocumentCommitRecord).findOneBy({ id })
    if (!commit) continue
    if (commit.parentCommitId) pending.push([commit.parentCommitId, depth + 1])
    if (commit.mergeParentCommitId) pending.push([commit.mergeParentCommitId, depth + 1])
  }
  return result
}

const commonAncestor = async (
  manager: EntityManager,
  currentId: string,
  incomingId: string
): Promise<WorldDocumentCommitRecord> => {
  const currentAncestors = await ancestors(manager, currentId)
  const incomingAncestors = await ancestors(manager, incomingId)
  const candidates = [...currentAncestors.keys()].filter((id) => incomingAncestors.has(id))
  candidates.sort(
    (left, right) =>
      currentAncestors.get(left)! + incomingAncestors.get(left)! -
      currentAncestors.get(right)! - incomingAncestors.get(right)!
  )
  if (!candidates[0]) throw new Error('两个设定方案没有共同祖先，无法合并。')
  return manager.getRepository(WorldDocumentCommitRecord).findOneByOrFail({ id: candidates[0] })
}

const resolveMerge = async (
  manager: EntityManager,
  sourceBranchId: string,
  resolutions: Record<string, 'current' | 'incoming'> = {}
) => {
  const branches = manager.getRepository(WorldDocumentBranchRecord)
  const sourceBranch = await branches.findOneByOrFail({ id: sourceBranchId })
  const latest = await manager.getRepository(WorldDocumentCommitRecord).findOne({
    where: { worldId: sourceBranch.worldId },
    order: { sequence: 'DESC' }
  })
  const active = await ensureActiveWorldDocumentBranchWithManager(
    manager,
    sourceBranch.worldId,
    latest?.id ?? null
  )
  if (active.id === sourceBranch.id) throw new Error('不能将当前方案合并到自身。')
  if (!active.headCommitId || !sourceBranch.headCommitId) throw new Error('设定方案尚无可合并版本。')
  const base = await commonAncestor(manager, active.headCommitId, sourceBranch.headCommitId)
  const [baseDocs, currentDocs, incomingDocs] = await Promise.all([
    readTreeDocuments(manager, sourceBranch.worldId, base.rootTreeHash),
    readTreeDocuments(manager, sourceBranch.worldId, (await manager.getRepository(WorldDocumentCommitRecord).findOneByOrFail({ id: active.headCommitId })).rootTreeHash),
    readTreeDocuments(manager, sourceBranch.worldId, (await manager.getRepository(WorldDocumentCommitRecord).findOneByOrFail({ id: sourceBranch.headCommitId })).rootTreeHash)
  ])
  const merged = new Map(currentDocs)
  const conflicts: WorldDocumentMergePreviewPayload['conflicts'] = []
  const autoMergedDocumentIds: string[] = []
  for (const id of new Set([...baseDocs.keys(), ...currentDocs.keys(), ...incomingDocs.keys()])) {
    const baseEntry = baseDocs.get(id)
    const currentEntry = currentDocs.get(id)
    const incomingEntry = incomingDocs.get(id)
    const baseSig = signature(baseEntry)
    const currentSig = signature(currentEntry)
    const incomingSig = signature(incomingEntry)
    if (currentSig === incomingSig || incomingSig === baseSig) continue
    if (currentSig === baseSig) {
      incomingEntry ? merged.set(id, incomingEntry) : merged.delete(id)
      autoMergedDocumentIds.push(id)
      continue
    }
    if (baseEntry && currentEntry && incomingEntry) {
      const automaticallyMerged = tryMergeDocument(baseEntry, currentEntry, incomingEntry)
      if (automaticallyMerged) {
        merged.set(id, automaticallyMerged)
        autoMergedDocumentIds.push(id)
        continue
      }
    }
    const resolution = resolutions[id]
    if (resolution) {
      if (resolution === 'incoming') incomingEntry ? merged.set(id, incomingEntry) : merged.delete(id)
      continue
    }
    conflicts.push({
      documentId: id,
      title: incomingEntry?.state.title ?? currentEntry?.state.title ?? baseEntry?.state.title ?? '未命名文档',
      reason: !currentEntry || !incomingEntry ? 'delete_modify' : 'both_changed',
      currentDiff: buildWorldDocumentContentDiff(baseEntry?.source ?? null, currentEntry?.source ?? null),
      incomingDiff: buildWorldDocumentContentDiff(baseEntry?.source ?? null, incomingEntry?.source ?? null)
    })
  }
  return { sourceBranch, active, base, currentDocs, merged, conflicts, autoMergedDocumentIds }
}

export const previewWorldDocumentMergeWithManager = async (
  manager: EntityManager,
  sourceBranchId: string
): Promise<WorldDocumentMergePreviewPayload> => {
  const result = await resolveMerge(manager, sourceBranchId)
  return {
    baseCommitId: result.base.id,
    currentCommitId: result.active.headCommitId!,
    incomingCommitId: result.sourceBranch.headCommitId!,
    sourceBranch: {
      id: result.sourceBranch.id,
      worldId: result.sourceBranch.worldId,
      name: result.sourceBranch.name,
      headCommitId: result.sourceBranch.headCommitId,
      active: result.sourceBranch.active,
      createdAt: result.sourceBranch.createdAt.toISOString(),
      updatedAt: result.sourceBranch.updatedAt.toISOString()
    },
    autoMergedDocumentIds: result.autoMergedDocumentIds,
    conflicts: result.conflicts
  }
}

export const applyWorldDocumentMergeWithManager = async (
  manager: EntityManager,
  input: ApplyWorldDocumentMergeInput
): Promise<WorldDocumentCommitRecord> => {
  const result = await resolveMerge(manager, input.sourceBranchId, input.resolutions)
  if (result.active.headCommitId !== input.expectedCurrentHeadCommitId) {
    throw new Error('当前方案在合并预览后发生了变化，请重新预览。')
  }
  if (result.conflicts.length) throw new Error('仍有未解决的合并冲突。')
  const changeSetId = `merge:${randomUUID()}`
  const repository = manager.getRepository(WorldEntityDocumentRecord)
  const currentRecords = new Map(
    (await repository.findBy({ worldId: result.sourceBranch.worldId })).map((record) => [record.id, record])
  )
  for (const id of new Set([...result.currentDocs.keys(), ...result.merged.keys()])) {
    const beforeEntry = result.currentDocs.get(id)
    const afterEntry = result.merged.get(id)
    if (signature(beforeEntry) === signature(afterEntry)) continue
    const existing = currentRecords.get(id) ?? null
    if (!afterEntry) {
      if (existing) await repository.remove(existing)
      if (existing) await stageWorldDocumentChangeWithManager(manager, { changeSetId, operation: 'delete', before: existing, after: null, summary: `合并方案「${result.sourceBranch.name}」` })
      continue
    }
    const after = await repository.save(repository.create({
      ...(existing ?? {}),
      id,
      ownerKind: afterEntry.state.ownerKind,
      worldId: afterEntry.state.worldId,
      ownerEntityId: afterEntry.state.ownerEntityId,
      parentDocumentId: afterEntry.state.parentDocumentId,
      title: afterEntry.state.title,
      contentHtml: sourceHtml(afterEntry),
      contentFormat: 'html',
      sortKey: afterEntry.state.sortKey,
      revision: (existing?.revision ?? 0) + 1,
      schemaVersion: afterEntry.state.schemaVersion
    }))
    await stageWorldDocumentChangeWithManager(manager, { changeSetId, operation: existing ? 'update' : 'create', before: existing, after, source: afterEntry.source, summary: `合并方案「${result.sourceBranch.name}」` })
  }
  const [commit] = await commitWorldDocumentChangeSetWithManager(manager, changeSetId, 'human')
  if (!commit) return manager.getRepository(WorldDocumentCommitRecord).findOneByOrFail({ id: result.active.headCommitId! })
  commit.mergeParentCommitId = result.sourceBranch.headCommitId
  commit.intent = 'merge'
  commit.summary = `合并方案「${result.sourceBranch.name}」`
  return manager.getRepository(WorldDocumentCommitRecord).save(commit)
}
