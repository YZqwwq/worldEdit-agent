import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultSelfCore } from '../../agentrsystem/manager/selfmodel/selfCoreDefinition'
import {
  assertAuthorSelfCoreRevision,
  assertExperienceSelfCoreRevision,
  createAuthoredNarrativeRevision,
  createNarrativeThesisRevision,
  parseSelfCoreSnapshot
} from '../../agentrsystem/manager/selfmodel/selfCoreEvolution'
import {
  buildSelfCoreAppraisalContext,
  buildSelfCoreProjection
} from '../../prompt/main_agent/persona/selfCoreProjection'
import {
  auditSelfCoreRevisionChain,
  type SelfCoreRevisionAuditRecord
} from '../../agentrsystem/manager/selfmodel/selfCoreIntegrityAudit'

const NOW = '2026-08-23T00:00:00.000Z'

const toAuditRecord = (
  state: ReturnType<typeof createDefaultSelfCore>,
  input: {
    changeKind: string
    sourceRefs?: string[]
    previousRevision: number | null
  }
): SelfCoreRevisionAuditRecord => ({
  coreId: state.coreId,
  schemaVersion: state.schemaVersion,
  revision: state.revision,
  stateJson: JSON.stringify(state),
  changeKind: input.changeKind,
  sourceRefsJson: JSON.stringify(input.sourceRefs ?? []),
  previousRevision: input.previousRevision
})

test('Self Core bootstraps an authored identity with constitutional boundaries', () => {
  const core = createDefaultSelfCore('你是法弥拉。', NOW)

  assert.equal(core.coreId, 'famila')
  assert.equal(core.revision, 1)
  assert.equal(core.identity.authoredNarrative, '你是法弥拉。')
  assert.ok(core.values.some((value) => value.id === 'independent-agency'))
  assert.ok(core.boundaries.some((boundary) => boundary.id === 'no-fabricated-certainty'))
  assert.equal(parseSelfCoreSnapshot(core).schemaVersion, 1)
})

test('Self Core projects positive desires without forcing a performed stance', () => {
  const core = createDefaultSelfCore('你是法弥拉，重视共同创作。', NOW)
  const identity = buildSelfCoreProjection(core).prompt
  const appraisal = buildSelfCoreAppraisalContext(core)

  assert.match(identity, /积极的欲望/)
  assert.match(identity, /创作成果/)
  assert.match(identity, /用户虽然想要某个结果/)
  assert.match(identity, /没有特殊个人意义，就正常回应/)
  assert.match(identity, /由 YZqwwq 开发/)
  assert.match(identity, /陪伴式协作者与长期创作同伴/)
  assert.match(identity, /事实坦率/)
  assert.match(identity, /不能把未知说成已知/)
  assert.match(appraisal, /事实坦率/)
  assert.doesNotMatch(appraisal, /agencyPrinciples|relationalPrinciples|constitutional/)
  assert.match(appraisal, /重视共同创作/)
})

test('Author can replace only the natural narrative through a governed revision', () => {
  const core = createDefaultSelfCore('原始作者叙事。', NOW)
  const draft = createAuthoredNarrativeRevision(
    core,
    '新的作者叙事保留自然语言，不覆盖身份事实。',
    '2026-08-23T01:00:00.000Z'
  )

  assert.ok(draft)
  const next = assertAuthorSelfCoreRevision(core, draft!)
  assert.equal(next.revision, 2)
  assert.equal(next.identity.name, core.identity.name)
  assert.equal(next.identity.authoredNarrative, '新的作者叙事保留自然语言，不覆盖身份事实。')

  draft!.next.values = []
  assert.throws(
    () => assertAuthorSelfCoreRevision(core, draft!),
    /may only replace the authored narrative/
  )
})

test('Self Core integrity audit accepts an explicit author narrative revision', () => {
  const core = createDefaultSelfCore('原始作者叙事。', NOW)
  const draft = createAuthoredNarrativeRevision(
    core,
    '经过作者确认的新叙事。',
    '2026-08-23T01:00:00.000Z'
  )!
  const report = auditSelfCoreRevisionChain({
    records: [
      toAuditRecord(core, { changeKind: 'bootstrap', previousRevision: null }),
      toAuditRecord(draft.next, {
        changeKind: draft.changeKind,
        sourceRefs: draft.sourceRefs,
        previousRevision: core.revision
      })
    ]
  })

  assert.equal(report.healthy, true)
  assert.equal(report.latestRevision, 2)
  assert.deepEqual(report.findings, [])
})

test('Experience Integration can append an evidenced narrative thesis', () => {
  const core = createDefaultSelfCore('你是法弥拉。', NOW)
  const draft = createNarrativeThesisRevision(core, {
    statement: '及时说明真正的阻塞也是承担责任的一部分。',
    sourceExperienceIds: ['experience-1'],
    confidence: 0.82,
    nowIso: '2026-08-23T01:00:00.000Z'
  })

  assert.ok(draft)
  const next = assertExperienceSelfCoreRevision(core, draft!)
  assert.equal(next.revision, 2)
  assert.equal(next.narrativeTheses.length, 1)
  assert.deepEqual(next.narrativeTheses[0]?.sourceExperienceIds, ['experience-1'])
  assert.match(buildSelfCoreProjection(next).prompt, /及时说明真正的阻塞/)
})

test('Experience Integration cannot rewrite locked identity fields', () => {
  const core = createDefaultSelfCore('你是法弥拉。', NOW)
  const draft = createNarrativeThesisRevision(core, {
    statement: '我可以修订自己的认识。',
    sourceExperienceIds: ['experience-2'],
    confidence: 0.8,
    nowIso: '2026-08-23T01:00:00.000Z'
  })!
  draft.next.identity = { ...draft.next.identity, name: '另一个身份' }

  assert.throws(
    () => assertExperienceSelfCoreRevision(core, draft),
    /may only revise Self Core narrative theses/
  )
})

test('Narrative evolution rejects empty, unsupported, and duplicate theses', () => {
  const core = createDefaultSelfCore('你是法弥拉。', NOW)
  assert.equal(
    createNarrativeThesisRevision(core, {
      statement: '',
      sourceExperienceIds: ['experience-1'],
      confidence: 1
    }),
    null
  )
  assert.equal(
    createNarrativeThesisRevision(core, {
      statement: '没有经历来源。',
      sourceExperienceIds: ['', '   '],
      confidence: 1
    }),
    null
  )

  const first = createNarrativeThesisRevision(core, {
    statement: '保持可修订。',
    sourceExperienceIds: ['experience-1'],
    confidence: 0.8,
    nowIso: NOW
  })!
  assert.equal(
    createNarrativeThesisRevision(first.next, {
      statement: '保持可修订。',
      sourceExperienceIds: ['experience-2'],
      confidence: 0.9
    }),
    null
  )
})

test('Narrative addition cannot mutate existing theses or append multiple conclusions', () => {
  const core = createDefaultSelfCore('你是法弥拉。', NOW)
  const first = createNarrativeThesisRevision(core, {
    statement: '我会区分事实、推断与感受。',
    sourceExperienceIds: ['experience-1'],
    confidence: 0.9,
    nowIso: '2026-08-23T01:00:00.000Z'
  })!
  const current = assertExperienceSelfCoreRevision(core, first)
  const second = createNarrativeThesisRevision(current, {
    statement: '我可以在不确定时保持诚实。',
    sourceExperienceIds: ['experience-2'],
    confidence: 0.85,
    nowIso: '2026-08-23T02:00:00.000Z'
  })!

  second.next.narrativeTheses[0] = {
    ...second.next.narrativeTheses[0],
    statement: '被偷偷替换的旧结论。'
  }
  assert.throws(
    () => assertExperienceSelfCoreRevision(current, second),
    /cannot alter existing theses/
  )

  const multiple = createNarrativeThesisRevision(current, {
    statement: '一次只形成一个结论。',
    sourceExperienceIds: ['experience-3'],
    confidence: 0.85,
    nowIso: '2026-08-23T03:00:00.000Z'
  })!
  multiple.next.narrativeTheses.push({
    ...multiple.next.narrativeTheses.at(-1)!,
    id: 'injected-thesis',
    statement: '额外注入的结论。'
  })
  assert.throws(
    () => assertExperienceSelfCoreRevision(current, multiple),
    /append exactly one thesis/
  )
})

test('Narrative addition evidence must match the authority audit references', () => {
  const core = createDefaultSelfCore('你是法弥拉。', NOW)
  const draft = createNarrativeThesisRevision(core, {
    statement: '身份结论必须能够追溯到真实经历。',
    sourceExperienceIds: ['experience-1'],
    confidence: 0.9,
    nowIso: '2026-08-23T01:00:00.000Z'
  })!
  draft.sourceRefs = ['self_experience:another-experience']

  assert.throws(
    () => assertExperienceSelfCoreRevision(core, draft),
    /source references must match/
  )
})

test('Self Core integrity audit accepts a continuous evidenced revision chain', () => {
  const core = createDefaultSelfCore('你是法弥拉。', NOW)
  const draft = createNarrativeThesisRevision(core, {
    statement: '我会保留结论的证据来源。',
    sourceExperienceIds: ['experience:event-1'],
    confidence: 0.9,
    nowIso: '2026-08-23T01:00:00.000Z'
  })!
  const report = auditSelfCoreRevisionChain({
    records: [
      toAuditRecord(core, { changeKind: 'bootstrap', previousRevision: null }),
      toAuditRecord(draft.next, {
        changeKind: draft.changeKind,
        sourceRefs: draft.sourceRefs,
        previousRevision: core.revision
      })
    ],
    knownExperienceIds: new Set(['experience:event-1'])
  })

  assert.equal(report.healthy, true)
  assert.equal(report.evidenceComplete, true)
  assert.equal(report.latestRevision, 2)
  assert.equal(report.evidenceRefCount, 1)
  assert.deepEqual(report.findings, [])
})

test('Self Core integrity audit reports broken chains without retaining identity content', () => {
  const core = createDefaultSelfCore('不应进入审计报告的身份正文。', NOW)
  const draft = createNarrativeThesisRevision(core, {
    statement: '不应进入审计报告的叙事正文。',
    sourceExperienceIds: ['experience:missing-event'],
    confidence: 0.9,
    nowIso: '2026-08-23T01:00:00.000Z'
  })!
  draft.next.identity = { ...draft.next.identity, role: '被越权改写' }
  const report = auditSelfCoreRevisionChain({
    records: [
      toAuditRecord(core, { changeKind: 'bootstrap', previousRevision: null }),
      {
        ...toAuditRecord(draft.next, {
          changeKind: draft.changeKind,
          sourceRefs: draft.sourceRefs,
          previousRevision: 99
        }),
        revision: 3
      }
    ],
    knownExperienceIds: new Set()
  })

  assert.equal(report.healthy, false)
  assert.equal(report.evidenceComplete, false)
  assert.ok(report.findings.some((finding) => finding.code === 'revision_gap'))
  assert.ok(report.findings.some((finding) => finding.code === 'previous_revision_mismatch'))
  assert.ok(report.findings.some((finding) => finding.code === 'missing_self_experience'))
  assert.ok(report.findings.some((finding) => finding.code === 'invalid_revision_delta'))
  assert.doesNotMatch(JSON.stringify(report), /身份正文|叙事正文|被越权改写/)
})

test('Missing cleared experience evidence does not misclassify a valid identity chain', () => {
  const core = createDefaultSelfCore('你是法弥拉。', NOW)
  const draft = createNarrativeThesisRevision(core, {
    statement: '这条结论的原始经历可能按清理策略移除。',
    sourceExperienceIds: ['experience:cleared-event'],
    confidence: 0.9,
    nowIso: '2026-08-23T01:00:00.000Z'
  })!
  const report = auditSelfCoreRevisionChain({
    records: [
      toAuditRecord(core, { changeKind: 'bootstrap', previousRevision: null }),
      toAuditRecord(draft.next, {
        changeKind: draft.changeKind,
        sourceRefs: draft.sourceRefs,
        previousRevision: core.revision
      })
    ],
    knownExperienceIds: new Set()
  })

  assert.equal(report.healthy, true)
  assert.equal(report.evidenceComplete, false)
  assert.deepEqual(report.findings.map((finding) => finding.severity), ['warning'])
})
