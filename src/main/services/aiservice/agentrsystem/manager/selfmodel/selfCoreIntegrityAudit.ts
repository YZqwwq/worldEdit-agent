import type { SelfCoreRevisionDraft, SelfCoreSnapshot } from '@share/cache/AItype/states/selfCore'
import {
  assertSelfCoreRevision,
  parseSelfCoreSnapshot
} from './selfCoreEvolution'

export type SelfCoreRevisionAuditRecord = {
  coreId: string
  schemaVersion: number
  revision: number
  stateJson: string
  changeKind: string
  sourceRefsJson: string
  previousRevision: number | null
}

export type SelfCoreIntegrityFindingCode =
  | 'missing_bootstrap'
  | 'invalid_state'
  | 'record_snapshot_mismatch'
  | 'core_id_changed'
  | 'revision_gap'
  | 'previous_revision_mismatch'
  | 'invalid_bootstrap'
  | 'invalid_revision_delta'
  | 'invalid_source_reference'
  | 'missing_self_experience'

export type SelfCoreIntegrityFinding = {
  severity: 'warning' | 'error'
  code: SelfCoreIntegrityFindingCode
  revision?: number
  sourceRef?: string
}

export type SelfCoreIntegrityReport = {
  healthy: boolean
  evidenceComplete: boolean
  coreId?: string
  latestRevision?: number
  revisionCount: number
  evidenceRefCount: number
  findings: SelfCoreIntegrityFinding[]
}

const parseStringArray = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((item): item is string => typeof item === 'string').map(
          (item) => item.trim()
        ).filter(Boolean))]
      : []
  } catch {
    return []
  }
}

const experienceIdFromSourceRef = (sourceRef: string): string | null => {
  const prefix = 'self_experience:'
  if (!sourceRef.startsWith(prefix)) return null
  const experienceId = sourceRef.slice(prefix.length).trim()
  return experienceId || null
}

export const collectSelfCoreEvidenceExperienceIds = (
  records: SelfCoreRevisionAuditRecord[]
): string[] => [...new Set(records.flatMap((record) =>
  parseStringArray(record.sourceRefsJson)
    .map(experienceIdFromSourceRef)
    .filter((id): id is string => Boolean(id))
))]

export const auditSelfCoreRevisionChain = (input: {
  records: SelfCoreRevisionAuditRecord[]
  knownExperienceIds?: ReadonlySet<string>
}): SelfCoreIntegrityReport => {
  const records = [...input.records].sort((left, right) => left.revision - right.revision)
  const findings: SelfCoreIntegrityFinding[] = []
  let evidenceRefCount = 0
  let previousSnapshot: SelfCoreSnapshot | undefined
  let canonicalCoreId: string | undefined

  if (!records.length) findings.push({ severity: 'error', code: 'missing_bootstrap' })

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    const expectedRevision = index + 1
    if (record.revision !== expectedRevision) {
      findings.push({ severity: 'error', code: 'revision_gap', revision: record.revision })
    }
    const expectedPreviousRevision = index === 0 ? null : records[index - 1].revision
    if (record.previousRevision !== expectedPreviousRevision) {
      findings.push({ severity: 'error', code: 'previous_revision_mismatch', revision: record.revision })
    }

    const sourceRefs = parseStringArray(record.sourceRefsJson)
    for (const sourceRef of sourceRefs) {
      const experienceId = experienceIdFromSourceRef(sourceRef)
      if (!sourceRef.startsWith('self_experience:')) continue
      evidenceRefCount += 1
      if (!experienceId) {
        findings.push({ severity: 'error', code: 'invalid_source_reference', revision: record.revision })
      } else if (input.knownExperienceIds && !input.knownExperienceIds.has(experienceId)) {
        findings.push({
          severity: 'warning',
          code: 'missing_self_experience',
          revision: record.revision,
          sourceRef
        })
      }
    }

    let snapshot: SelfCoreSnapshot
    try {
      snapshot = parseSelfCoreSnapshot(JSON.parse(record.stateJson))
    } catch {
      findings.push({ severity: 'error', code: 'invalid_state', revision: record.revision })
      continue
    }

    if (
      snapshot.coreId !== record.coreId ||
      snapshot.revision !== record.revision ||
      snapshot.schemaVersion !== record.schemaVersion
    ) {
      findings.push({ severity: 'error', code: 'record_snapshot_mismatch', revision: record.revision })
    }
    canonicalCoreId ??= snapshot.coreId
    if (snapshot.coreId !== canonicalCoreId) {
      findings.push({ severity: 'error', code: 'core_id_changed', revision: record.revision })
    }

    if (index === 0) {
      if (record.changeKind !== 'bootstrap' || record.revision !== 1 || record.previousRevision !== null) {
        findings.push({ severity: 'error', code: 'invalid_bootstrap', revision: record.revision })
      }
      previousSnapshot = snapshot
      continue
    }

    if (!previousSnapshot) continue
    try {
      const draft: SelfCoreRevisionDraft =
        record.changeKind === 'authored_narrative_replaced'
          ? {
              authority: 'author',
              changeKind: 'authored_narrative_replaced',
              baseRevision: previousSnapshot.revision,
              sourceRefs: sourceRefs as ['author:authored_narrative'],
              next: snapshot
            }
          : {
              authority: 'experience_integration',
              changeKind: record.changeKind as 'narrative_thesis_added',
              baseRevision: previousSnapshot.revision,
              sourceRefs,
              next: snapshot
            }
      assertSelfCoreRevision(previousSnapshot, draft)
    } catch {
      findings.push({ severity: 'error', code: 'invalid_revision_delta', revision: record.revision })
    }
    previousSnapshot = snapshot
  }

  return {
    healthy: findings.every((finding) => finding.severity !== 'error'),
    evidenceComplete: findings.every((finding) => finding.code !== 'missing_self_experience'),
    coreId: canonicalCoreId,
    latestRevision: records.at(-1)?.revision,
    revisionCount: records.length,
    evidenceRefCount,
    findings
  }
}
