import assert from 'node:assert/strict'
import test from 'node:test'
import type { MoodEventAppraisal } from '@share/cache/AItype/states/moodAssessment'
import type { InteractionObservationSnapshot } from '@share/cache/AItype/states/interactionObservation'
import type { PersonaActionPolicy } from '@share/cache/AItype/states/personaPolicy'
import { buildActionPolicyPrompt } from '../prompt/main_agent/persona/actionPolicyPrompt'
import { buildPersonaAssemblyPromptParts } from '../prompt/main_agent/persona/personaAssemblyPrompt'
import { buildSceneCharacterPrompt } from '../prompt/main_agent/persona/sceneCharacterPrompt'
import {
  applyCharacterMoodBoundary,
  DEFAULT_SHORT_TERM,
  FAMILA_CHARACTER_MOOD_BOUNDARY
} from '../agentrsystem/node/personanode/moodDynamicsBoundary'
import {
  compileMoodAssessment,
  NEUTRAL_MOOD_APPRAISAL
} from '../agentrsystem/node/personanode/emotionDynamicsCompiler'
import {
  applyMoodExpressionDeltaToMetrics,
  buildPolicy
} from '../agentrsystem/node/personanode/personaPolicyCompiler'
import { resolveWorkspaceProfile } from '../agentrsystem/workspaceProfileRegistry'
import { buildMoodAppraisalPrompt } from '../agentrsystem/node/personanode/moodAppraisalPrompt'

const appraisal = (overrides: Partial<MoodEventAppraisal> = {}): MoodEventAppraisal => ({
  ...NEUTRAL_MOOD_APPRAISAL,
  ...overrides
})

const compile = (
  event: MoodEventAppraisal,
  previousMood?: ReturnType<typeof compileMoodAssessment>,
  nowIso = '2026-08-16T00:00:00.000Z'
) =>
  applyCharacterMoodBoundary(
    compileMoodAssessment({ appraisal: event, previousMood, nowIso }),
    FAMILA_CHARACTER_MOOD_BOUNDARY
  )

test('low-confidence appraisal cannot cause a sharp emotional jump', () => {
  const event = {
    eventKind: 'obstacle' as const,
    valence: -2 as const,
    salience: 3 as const,
    futureProspect: -1 as const,
    agency: 'user' as const,
    controlSignal: 'weakened' as const
  }
  const low = compile(appraisal({ ...event, confidence: 0 }))
  const high = compile(appraisal({ ...event, confidence: 3 }))

  assert.ok(low.shortTerm.frustration < high.shortTerm.frustration)
  assert.ok(low.intensity < high.intensity)
  assert.equal(low.primaryEmotion, 'calm')
})

test('appraisal prompt includes user interaction events and excludes task results', () => {
  const observations: InteractionObservationSnapshot[] = [
    {
      id: 1,
      type: 'task_completed',
      source: 'main_agent',
      payload: { text: 'internal tool result must stay out of mood' },
      createdAt: '2026-08-16T00:00:00.000Z'
    },
    {
      id: 2,
      type: 'user_interrupt',
      source: 'user',
      payload: { text: '用户要求中断当前回答' },
      createdAt: '2026-08-16T00:00:01.000Z'
    }
  ]
  const prompt = buildMoodAppraisalPrompt({
    moodPrompt: '保持低振幅。',
    observations,
    currentUserText: '先停一下。',
    recentDialogue: [{ role: 'user', text: '先停一下。' }]
  })

  assert.match(prompt, /用户要求中断当前回答/)
  assert.doesNotMatch(prompt, /internal tool result must stay out of mood/)
})

test('missing evidence decays short emotion toward baseline instead of resetting it', () => {
  const previous = compile(
    appraisal({
      eventKind: 'obstacle',
      valence: -2,
      salience: 3,
      futureProspect: -1,
      agency: 'user',
      confidence: 3
    })
  )
  const next = compile({ ...NEUTRAL_MOOD_APPRAISAL }, previous, '2026-08-16T00:01:00.000Z')

  assert.ok(next.shortTerm.frustration < previous.shortTerm.frustration)
  assert.ok(next.shortTerm.frustration > DEFAULT_SHORT_TERM.frustration)
})

test('repeated explicit failure feedback accumulates slow stress and helplessness', () => {
  const failure = appraisal({
    eventKind: 'obstacle',
    valence: -2,
    salience: 3,
    futureProspect: -2,
    agency: 'user',
    controlSignal: 'weakened',
    confidence: 3
  })
  const first = compile(failure)
  const second = compile(failure, first, '2026-08-16T00:01:00.000Z')
  const third = compile(failure, second, '2026-08-16T00:02:00.000Z')

  assert.ok(third.slowMood.stress > first.slowMood.stress)
  assert.ok(third.slowMood.helplessness > first.slowMood.helplessness)
})

test('relationship injury changes trust slowly and raises hurt', () => {
  const injury = appraisal({
    eventKind: 'relationship_event',
    valence: -2,
    salience: 3,
    agency: 'user',
    relationshipImpact: -2,
    confidence: 3
  })
  const first = compile(injury)
  const second = compile(injury, first, '2026-08-16T00:01:00.000Z')

  assert.ok(first.shortTerm.hurt > DEFAULT_SHORT_TERM.hurt)
  assert.ok(second.relationship.trust < first.relationship.trust)
  assert.ok(first.relationship.trust - second.relationship.trust < 0.1)
})

test('mood expression deltas never rewrite autonomy or risk', () => {
  const mood = compile(appraisal({ eventKind: 'gain', valence: 2, salience: 3, confidence: 3 }))
  const base = {
    autonomy_level: 0.1,
    verbosity_index: 0.5,
    risk_tolerance: 0.5,
    formality_score: 0.5
  }
  const effective = applyMoodExpressionDeltaToMetrics(base, mood.expressionDelta)
  const policy = buildPolicy(base, effective, mood, [], '2026-08-16T00:00:00.000Z')

  assert.equal(effective.autonomy_level, base.autonomy_level)
  assert.equal(effective.risk_tolerance, base.risk_tolerance)
  assert.equal(policy.action.toolPersistence, 0.208)
})

test('main-agent prompt receives semantic projection without raw state scores', () => {
  const mood = compile(
    appraisal({ eventKind: 'obstacle', valence: -2, salience: 3, agency: 'user', confidence: 3 })
  )
  const parts = buildPersonaAssemblyPromptParts({
    characterPrompt: '保持稳定人格。',
    expressionPrompt: '自然表达。',
    moodAssessment: mood,
    effectiveMetrics: {
      autonomy_level: 0.5,
      verbosity_index: 0.72,
      risk_tolerance: 0.5,
      formality_score: 0.72
    }
  })
  const prompt = `${parts.moodContext}\n${parts.instruction}`

  assert.doesNotMatch(prompt, /shortTerm|slowMood|relationshipImpact|confidence.*\d/)
  assert.match(prompt, /state_narrative/)
  assert.match(prompt, /受阻感|状态平稳/)
  assert.match(prompt, /较高正式度/)
  assert.match(prompt, /默认使用自然对话的篇幅/)
  assert.match(prompt, /active_expression_profile:\s+自然表达。/)
  assert.doesNotMatch(prompt, /publish_agent_artifact/)
})

test('action prompt hides scores and keeps tool permission separate', () => {
  const action: PersonaActionPolicy = {
    autonomyDrive: 0.74,
    caution: 0.72,
    clarificationNeed: 0.42,
    evidenceNeed: 0.7,
    recallNeed: 0.64,
    writeConservatism: 0.68,
    toolPersistence: 0.66
  }
  const prompt = buildActionPolicyPrompt(action)
  assert.doesNotMatch(prompt, /=\d/)
  assert.match(prompt, /主动推进/)
  assert.match(prompt, /不授予工具权限/)
})

test('document workspace still activates the registered scene policy', () => {
  const scene = resolveWorkspaceProfile({
    pageKind: 'document',
    routeName: 'WorldEntityDocumentEditor',
    capturedAt: '2026-08-16T00:00:00.000Z',
    document: { id: 'doc-1', title: '角色设定' }
  })
  const chatScene = resolveWorkspaceProfile({
    pageKind: 'chat',
    routeName: 'Chat',
    capturedAt: '2026-08-16T00:00:00.000Z'
  })

  assert.equal(scene?.scenePolicy?.id, 'document_editing')
  assert.equal(chatScene, undefined)
  const prompt = buildSceneCharacterPrompt(scene?.scenePolicy)
  assert.match(prompt, /当前场景人格姿态：文本编辑/)
  assert.match(prompt, /聚焦编辑/)
  assert.match(prompt, /一致性检查/)
  assert.match(prompt, /创作联想/)
  assert.match(prompt, /独立内容载体/)
  assert.doesNotMatch(prompt, /观点产物|publish_agent_artifact/)
})
