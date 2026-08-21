import { randomUUID } from 'node:crypto'
import type { DataSource } from 'typeorm'
import type {
  ResolveWorldEntityDocumentHistorySessionInput,
  WorldEntityDocumentHistorySessionResolution
} from '@share/cache/worldbuilding/worldEntityDocument'
import { WorldDocumentChangeRecord } from '@share/entity/database/WorldDocumentChangeRecord'
import { WorldDocumentCommitRecord } from '@share/entity/database/WorldDocumentCommitRecord'

const humanChangeSetId = (sessionId: string): string => `human:${sessionId}`

const historyStateRevision = (value: string | null): number | null => {
  if (!value) return null
  const revision = Number((JSON.parse(value) as { revision?: unknown }).revision)
  return Number.isSafeInteger(revision) ? revision : null
}

export const resolveWorldDocumentHumanSessionWithDataSource = async (
  dataSource: DataSource,
  input: ResolveWorldEntityDocumentHistorySessionInput
): Promise<WorldEntityDocumentHistorySessionResolution> => {
  const worldId = String(input.worldId || '').trim()
  const preferredSessionId = String(input.preferredSessionId || '').trim() || randomUUID()
  if (!worldId) throw new Error('worldId is required')

  return dataSource.transaction(async (manager) => {
    const changeRepository = manager.getRepository(WorldDocumentChangeRecord)
    const commitRepository = manager.getRepository(WorldDocumentCommitRecord)
    const preferredChangeSetId = humanChangeSetId(preferredSessionId)
    const preferredClosed = Boolean(
      await commitRepository.findOneBy({ worldId, changeSetId: preferredChangeSetId })
    )
    const staged = (
      await changeRepository.find({ where: { worldId, status: 'staged' } })
    ).filter((change) => change.changeSetId.startsWith('human:'))
    const originalSessionIds = [
      ...new Set(staged.map((change) => change.changeSetId.slice('human:'.length)))
    ]
    const sessionId = preferredClosed ? randomUUID() : preferredSessionId
    const targetChangeSetId = humanChangeSetId(sessionId)

    if (staged.length > 0) {
      const byDocument = new Map<string, WorldDocumentChangeRecord[]>()
      for (const change of staged) {
        const changes = byDocument.get(change.documentId) ?? []
        changes.push(change)
        byDocument.set(change.documentId, changes)
      }

      for (const changes of byDocument.values()) {
        const chronological = [...changes].sort(
          (left, right) =>
            (historyStateRevision(left.beforeStateJson) ??
              historyStateRevision(left.afterStateJson) ??
              Number.MAX_SAFE_INTEGER) -
              (historyStateRevision(right.beforeStateJson) ??
                historyStateRevision(right.afterStateJson) ??
                Number.MAX_SAFE_INTEGER) ||
            left.createdAt.getTime() - right.createdAt.getTime()
        )
        const latestFirst = [...changes].sort(
          (left, right) =>
            (historyStateRevision(right.afterStateJson) ??
              historyStateRevision(right.beforeStateJson) ??
              -1) -
              (historyStateRevision(left.afterStateJson) ??
                historyStateRevision(left.beforeStateJson) ??
                -1) ||
            right.updatedAt.getTime() - left.updatedAt.getTime()
        )
        const earliest = chronological[0]
        const latest = latestFirst[0]
        const target =
          changes.find((change) => change.changeSetId === targetChangeSetId) ?? earliest
        const superseded = changes.filter((change) => change.id !== target.id)
        if (superseded.length > 0) await changeRepository.remove(superseded)

        if (!earliest.beforeStateJson && !latest.afterStateJson) {
          await changeRepository.remove(target)
          continue
        }
        target.changeSetId = targetChangeSetId
        target.beforeStateJson = earliest.beforeStateJson
        target.beforeContentVersionId = earliest.beforeContentVersionId
        target.beforeSourceFormat = earliest.beforeSourceFormat
        target.beforeContentSource = earliest.beforeContentSource
        target.afterStateJson = latest.afterStateJson
        target.afterContentVersionId = latest.afterContentVersionId
        target.sourceFormat = latest.sourceFormat
        target.contentSource = latest.contentSource
        target.operation = !target.beforeStateJson
          ? 'create'
          : !target.afterStateJson
            ? 'delete'
            : changes.every((change) => change.operation === changes[0].operation)
              ? changes[0].operation
              : 'mixed'
        target.summary = [...new Set(changes.map((change) => change.summary).filter(Boolean))]
          .join('；')
          .slice(0, 500)
        target.status = 'staged'
        target.commitId = null
        await changeRepository.save(target)
      }
    }

    const recoveredSessionCount = originalSessionIds.filter((id) => id !== sessionId).length
    return {
      sessionId,
      status:
        preferredClosed && staged.length === 0
          ? 'rotated'
          : recoveredSessionCount > 0 || preferredClosed
            ? 'recovered'
            : 'active',
      recoveredSessionCount
    }
  })
}
