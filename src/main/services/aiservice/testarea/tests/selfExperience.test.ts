import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSelfCoreRevisionFromExperience, foldOpenSelfModelItems } from '../../agentrsystem/manager/selfmodel/selfExperienceIntegration'
import { createDefaultSelfCore } from '../../agentrsystem/manager/selfmodel/selfCoreDefinition'
import type { SelfExperienceDraft, SelfExperienceSnapshot } from '@share/cache/AItype/states/selfModel'

const experience = (overrides: Partial<SelfExperienceDraft> = {}): SelfExperienceDraft => ({
  kind: 'dialogue',
  summary: '一次经过治理的主体经历。',
  understanding: '我重新理解了自己在关系中的责任。',
  selfPosition: '作为会承担自己判断后果的主体。',
  commitmentUpdates: [],
  concernUpdates: [],
  evidenceRefs: ['turn:1'],
  confidence: 0.9,
  occurredAt: '2026-08-24T00:00:00.000Z',
  ...overrides
})

test('only a governed high-confidence self narrative proposes Self Core evolution', () => {
  const core = createDefaultSelfCore('2026-08-24T00:00:00.000Z')
  const proposed = buildSelfCoreRevisionFromExperience({
    core,
    experience: experience({ selfNarrative: '我愿意把忠实理解他人视为自己的长期责任。' }),
    experienceId: 'experience:1'
  })
  assert.equal(proposed?.baseRevision, core.revision)
  assert.deepEqual(proposed?.sourceRefs, ['self_experience:experience:1'])
  assert.equal(buildSelfCoreRevisionFromExperience({
    core,
    experience: experience({ selfNarrative: '我产生了一个暂时感受。', confidence: 0.6 }),
    experienceId: 'experience:2'
  }), undefined)
})

test('later governed updates close earlier open commitments without rewriting history', () => {
  const experiences = [
    experience({ commitmentUpdates: [{ content: '保留对人物动机的质疑', status: 'open' }], occurredAt: '2026-08-24T00:00:00.000Z' }),
    experience({ commitmentUpdates: [{ content: '继续核对人物时间线', status: 'fulfilled' }], occurredAt: '2026-08-23T00:00:00.000Z' }),
    experience({ commitmentUpdates: [{ content: '继续核对人物时间线', status: 'open' }], occurredAt: '2026-08-22T00:00:00.000Z' })
  ] as SelfExperienceSnapshot[]
  assert.deepEqual(foldOpenSelfModelItems(experiences, (item) => item.commitmentUpdates), ['保留对人物动机的质疑'])
})
