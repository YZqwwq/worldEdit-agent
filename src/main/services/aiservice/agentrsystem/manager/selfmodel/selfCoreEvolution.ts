import { randomUUID } from 'node:crypto'
import type {
  SelfCoreAuthorRevisionDraft,
  SelfCoreExperienceRevisionDraft,
  SelfCoreNarrativeThesis,
  SelfCoreRevisionDraft,
  SelfCoreSnapshot
} from '@share/cache/AItype/states/selfCore'

const parseStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(
        value
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
      )]
    : []

const normalizeStatement = (value: unknown): string => String(value || '').replace(/\s+/g, ' ').trim()

const normalizeThesis = (value: SelfCoreNarrativeThesis): SelfCoreNarrativeThesis => ({
  ...value,
  statement: normalizeStatement(value.statement),
  sourceExperienceIds: parseStringArray(value.sourceExperienceIds),
  confidence: Math.min(1, Math.max(0, Number(value.confidence) || 0)),
  status: value.status === 'retired' ? 'retired' : 'active'
})

export const parseSelfCoreSnapshot = (value: unknown): SelfCoreSnapshot => {
  if (!value || typeof value !== 'object') throw new Error('Self Core state must be an object.')
  const core = value as SelfCoreSnapshot
  if (core.schemaVersion !== 1 || !core.coreId?.trim() || !core.identity?.authoredNarrative?.trim()) {
    throw new Error('Self Core state is missing its schema, identity, or authored narrative.')
  }
  if (!Number.isInteger(core.revision) || core.revision < 1) {
    throw new Error('Self Core revision must be a positive integer.')
  }
  return {
    ...core,
    coreId: core.coreId.trim(),
    values: Array.isArray(core.values) ? core.values : [],
    boundaries: Array.isArray(core.boundaries) ? core.boundaries : [],
    agencyPrinciples: parseStringArray(core.agencyPrinciples),
    epistemicPrinciples: parseStringArray(core.epistemicPrinciples),
    relationalPrinciples: parseStringArray(core.relationalPrinciples),
    narrativeTheses: Array.isArray(core.narrativeTheses)
      ? core.narrativeTheses.map(normalizeThesis).filter((thesis) => thesis.statement)
      : []
  }
}

const lockedCoreState = (core: SelfCoreSnapshot): string =>
  JSON.stringify({
    schemaVersion: core.schemaVersion,
    coreId: core.coreId,
    identity: core.identity,
    values: core.values,
    boundaries: core.boundaries,
    agencyPrinciples: core.agencyPrinciples,
    epistemicPrinciples: core.epistemicPrinciples,
    relationalPrinciples: core.relationalPrinciples,
    createdAt: core.createdAt
  })

const narrativeThesisState = (thesis: SelfCoreNarrativeThesis): string =>
  JSON.stringify(normalizeThesis(thesis))

const assertNarrativeThesisAddition = (
  current: SelfCoreSnapshot,
  next: SelfCoreSnapshot,
  draft: SelfCoreRevisionDraft
): void => {
  if (draft.changeKind !== 'narrative_thesis_added') {
    throw new Error(`Unsupported Self Core change kind: ${String(draft.changeKind)}`)
  }
  if (next.narrativeTheses.length !== current.narrativeTheses.length + 1) {
    throw new Error('A narrative thesis addition must append exactly one thesis.')
  }
  for (let index = 0; index < current.narrativeTheses.length; index += 1) {
    if (
      narrativeThesisState(current.narrativeTheses[index]) !==
      narrativeThesisState(next.narrativeTheses[index])
    ) {
      throw new Error('A narrative thesis addition cannot alter existing theses.')
    }
  }

  const added = next.narrativeTheses.at(-1)!
  if (!added.id?.trim() || !added.statement || added.status !== 'active') {
    throw new Error('A new narrative thesis must have an identity, statement, and active status.')
  }
  if (!added.sourceExperienceIds.length) {
    throw new Error('A new narrative thesis requires Self Experience evidence.')
  }
  if (next.narrativeTheses.slice(0, -1).some((thesis) => thesis.id === added.id)) {
    throw new Error('A new narrative thesis must have a unique identity.')
  }

  const expectedSourceRefs = added.sourceExperienceIds
    .map((id) => `self_experience:${id}`)
    .sort()
  const actualSourceRefs = parseStringArray(draft.sourceRefs).sort()
  if (JSON.stringify(actualSourceRefs) !== JSON.stringify(expectedSourceRefs)) {
    throw new Error('Self Core source references must match the added thesis evidence.')
  }
}

export const assertExperienceSelfCoreRevision = (
  current: SelfCoreSnapshot,
  draft: SelfCoreExperienceRevisionDraft
): SelfCoreSnapshot => {
  const next = parseSelfCoreSnapshot(draft.next)
  if (draft.authority !== 'experience_integration') {
    throw new Error(`Unsupported Self Core authority: ${String(draft.authority)}`)
  }
  if (draft.baseRevision !== current.revision || next.revision !== current.revision + 1) {
    throw new Error('Self Core revision must advance exactly once from its authoritative base.')
  }
  if (current.coreId !== next.coreId || lockedCoreState(current) !== lockedCoreState(next)) {
    throw new Error('Experience Integration may only revise Self Core narrative theses.')
  }
  assertNarrativeThesisAddition(current, next, draft)
  return next
}

const authorLockedCoreState = (core: SelfCoreSnapshot): string =>
  JSON.stringify({
    schemaVersion: core.schemaVersion,
    coreId: core.coreId,
    identity: {
      name: core.identity.name,
      ontology: core.identity.ontology,
      role: core.identity.role,
      continuityStatement: core.identity.continuityStatement
    },
    values: core.values,
    boundaries: core.boundaries,
    agencyPrinciples: core.agencyPrinciples,
    epistemicPrinciples: core.epistemicPrinciples,
    relationalPrinciples: core.relationalPrinciples,
    narrativeTheses: core.narrativeTheses,
    createdAt: core.createdAt
  })

export const assertAuthorSelfCoreRevision = (
  current: SelfCoreSnapshot,
  draft: SelfCoreAuthorRevisionDraft
): SelfCoreSnapshot => {
  const next = parseSelfCoreSnapshot(draft.next)
  if (draft.authority !== 'author' || draft.changeKind !== 'authored_narrative_replaced') {
    throw new Error('Unsupported Self Core author revision.')
  }
  if (draft.baseRevision !== current.revision || next.revision !== current.revision + 1) {
    throw new Error('Self Core revision must advance exactly once from its authoritative base.')
  }
  if (
    current.coreId !== next.coreId ||
    authorLockedCoreState(current) !== authorLockedCoreState(next)
  ) {
    throw new Error('Author narrative revision may only replace the authored narrative.')
  }
  if (next.identity.authoredNarrative === current.identity.authoredNarrative) {
    throw new Error('Author narrative revision must change the authored narrative.')
  }
  if (
    draft.sourceRefs.length !== 1 ||
    draft.sourceRefs[0] !== 'author:authored_narrative'
  ) {
    throw new Error('Author narrative revision requires its explicit author source.')
  }
  return next
}

export const assertSelfCoreRevision = (
  current: SelfCoreSnapshot,
  draft: SelfCoreRevisionDraft
): SelfCoreSnapshot =>
  draft.authority === 'author'
    ? assertAuthorSelfCoreRevision(current, draft)
    : assertExperienceSelfCoreRevision(current, draft)

export const createAuthoredNarrativeRevision = (
  current: SelfCoreSnapshot,
  authoredNarrative: string,
  nowIso = new Date().toISOString()
): SelfCoreAuthorRevisionDraft | null => {
  const normalized = authoredNarrative.trim()
  if (!normalized || normalized === current.identity.authoredNarrative) return null
  return {
    authority: 'author',
    changeKind: 'authored_narrative_replaced',
    baseRevision: current.revision,
    sourceRefs: ['author:authored_narrative'],
    next: {
      ...current,
      revision: current.revision + 1,
      identity: {
        ...current.identity,
        authoredNarrative: normalized
      },
      updatedAt: nowIso
    }
  }
}

export const createNarrativeThesisRevision = (
  current: SelfCoreSnapshot,
  input: {
    statement: string
    sourceExperienceIds: string[]
    confidence: number
    nowIso?: string
  }
): SelfCoreExperienceRevisionDraft | null => {
  const statement = normalizeStatement(input.statement)
  const sourceExperienceIds = parseStringArray(input.sourceExperienceIds)
  if (!statement || sourceExperienceIds.length === 0) return null
  if (current.narrativeTheses.some((thesis) => thesis.status === 'active' && thesis.statement === statement)) {
    return null
  }
  const nowIso = input.nowIso ?? new Date().toISOString()
  const thesis: SelfCoreNarrativeThesis = {
    id: randomUUID(),
    statement,
    sourceExperienceIds,
    confidence: Math.min(1, Math.max(0, input.confidence)),
    status: 'active',
    createdAt: nowIso,
    updatedAt: nowIso
  }
  return {
    authority: 'experience_integration',
    changeKind: 'narrative_thesis_added',
    baseRevision: current.revision,
    sourceRefs: thesis.sourceExperienceIds.map((id) => `self_experience:${id}`),
    next: {
      ...current,
      revision: current.revision + 1,
      narrativeTheses: [...current.narrativeTheses, thesis],
      updatedAt: nowIso
    }
  }
}
