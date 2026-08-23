import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSelfExperienceDraft,
  foldOpenSelfModelItems
} from '../../agentrsystem/cognition/selfExperienceIntegration'
import type { SelfExperienceSnapshot } from '@share/cache/AItype/states/selfModel'
import type { ResponseOrientation, TurnCognitiveState } from '@share/cache/AItype/states/turnWorkspace'

const cognition = (overrides: Partial<TurnCognitiveState> = {}): TurnCognitiveState => ({
  objective: '回应用户',
  understanding: '用户在询问一个普通事实。',
  selfPosition: '以熟悉且坦率的关系位置回应。',
  evidenceRefs: [],
  unresolvedQuestions: [],
  phase: 'ready',
  revision: 1,
  updatedAt: '2026-08-22T00:00:00.000Z',
  ...overrides
})

const orientation = (overrides: Partial<ResponseOrientation> = {}): ResponseOrientation => ({
  mode: 'answer',
  coreResponse: '这是一个普通回答。',
  selfPosition: '以熟悉且坦率的关系位置回应。',
  expressionAffect: 'natural',
  basis: [],
  selectedPoints: [],
  depth: 'brief',
  ...overrides
})

test('ordinary transactional replies do not become self experiences', () => {
  assert.equal(
    buildSelfExperienceDraft({ cognition: cognition(), orientation: orientation() }),
    undefined
  )
})

test('personal meaning and explicit commitments form one revisable experience draft', () => {
  const draft = buildSelfExperienceDraft({
    cognition: cognition({
      personalMeaning: '我在意自己是否真正理解了用户的顾虑。',
      provisionalStance: '不应为了快速结束而忽略这个顾虑。',
      evidenceRefs: ['message:12']
    }),
    orientation: orientation({
      coreResponse: '我会继续留意这个问题，而不是把它当作一次性的答复。',
      experienceIntent: {
        relationshipMeaning: '用户允许我表达自己的保留。',
        commitmentUpdates: [{ content: '继续追踪这个问题', status: 'open' }],
        concernUpdates: [{ content: '是否真正理解用户的顾虑', status: 'open' }],
        confidence: 0.8
      }
    })
  })

  assert.equal(draft?.kind, 'dialogue')
  assert.equal(draft?.confidence, 0.8)
  assert.deepEqual(draft?.evidenceRefs, ['message:12'])
  assert.deepEqual(draft?.commitmentUpdates, [
    { content: '继续追踪这个问题', status: 'open' }
  ])
})

test('task results always become subject-owned acceptance experiences', () => {
  const draft = buildSelfExperienceDraft({
    cognition: cognition({ understanding: '子 Agent 已完成检查，但仍有一处冲突。' }),
    orientation: orientation({ coreResponse: '检查结束了，我不认可那处冲突。' }),
    runtimeEvent: { kind: 'task_notification', taskEvent: {} as never }
  })

  assert.equal(draft?.kind, 'task_result')
  assert.equal(draft?.summary, '检查结束了，我不认可那处冲突。')
})

test('later commitment updates close earlier open commitments without rewriting history', () => {
  const base = {
    eventId: 'event',
    turnId: 1,
    sessionId: 'default',
    kind: 'dialogue' as const,
    summary: '',
    understanding: '',
    selfPosition: '',
    commitmentUpdates: [],
    concernUpdates: [],
    evidenceRefs: [],
    confidence: 0.8,
    revision: 1,
    occurredAt: '2026-08-22T00:00:00.000Z',
    createdAt: '2026-08-22T00:00:00.000Z'
  }
  const experiences: SelfExperienceSnapshot[] = [
    {
      ...base,
      id: 'newer',
      turnId: 2,
      commitmentUpdates: [{ content: '核对人物时间线', status: 'fulfilled' }]
    },
    {
      ...base,
      id: 'older',
      commitmentUpdates: [
        { content: '核对人物时间线', status: 'open' },
        { content: '继续理解用户的偏好', status: 'open' }
      ]
    }
  ]

  assert.deepEqual(
    foldOpenSelfModelItems(experiences, (item) => item.commitmentUpdates),
    ['继续理解用户的偏好']
  )
})
