import assert from 'node:assert/strict'
import test from 'node:test'
import type { MoodEventAppraisal } from '@share/cache/AItype/states/moodAssessment'
import type { CharacterMoodBoundary } from '@share/cache/AItype/states/characterMoodBoundary'
import type { InteractionObservationSnapshot } from '@share/cache/AItype/states/interactionObservation'
import type { PersonaActionPolicy } from '@share/cache/AItype/states/personaPolicy'
import { buildActionPolicyPrompt } from '../../prompt/main_agent/persona/actionPolicyPrompt'
import { buildPersonaAssemblyPromptParts } from '../../prompt/main_agent/persona/personaAssemblyPrompt'
import { buildSceneCharacterPrompt } from '../../prompt/main_agent/persona/sceneCharacterPrompt'
import {
  DEFAULT_RELATIONSHIP,
  DEFAULT_SHORT_TERM,
  DEFAULT_SLOW_MOOD,
  FAMILA_CHARACTER_MOOD_BOUNDARY
} from '../../agentrsystem/node/personanode/moodDynamicsBoundary'
import {
  compileMoodAssessment,
  NEUTRAL_MOOD_APPRAISAL
} from '../../agentrsystem/node/personanode/emotionDynamicsCompiler'
import {
  applyMoodExpressionDeltaToMetrics,
  buildPolicy
} from '../../agentrsystem/node/personanode/personaPolicyCompiler'
import { resolveWorkspaceProfile } from '../../agentrsystem/workspaceProfileRegistry'
import { buildMoodAppraisalPrompt } from '../../agentrsystem/node/personanode/moodAppraisalPrompt'
import { projectUserMoodSlot } from '../../agentrsystem/node/personanode/userMoodProjection'
import { getExpressionPromptProfileById } from '../../prompt/main_agent/persona/expressionPromptProfiles'
import {
  applyObservationToMemorySlots,
  createDefaultMemorySlots
} from '../../agentrsystem/manager/memory/memoryWritePolicy'

const appraisal = (overrides: Partial<MoodEventAppraisal> = {}): MoodEventAppraisal => ({
  ...NEUTRAL_MOOD_APPRAISAL,
  ...overrides
})

const compile = (
  event: MoodEventAppraisal,
  previousMood?: ReturnType<typeof compileMoodAssessment>,
  nowIso = '2026-08-16T00:00:00.000Z',
  boundary: CharacterMoodBoundary = FAMILA_CHARACTER_MOOD_BOUNDARY
) => compileMoodAssessment({ appraisal: event, previousMood, nowIso, boundary })

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
    recentHistory: [{ role: 'assistant', text: '我先继续说明。' }]
  })

  assert.match(prompt, /用户要求中断当前回答/)
  assert.doesNotMatch(prompt, /internal tool result must stay out of mood/)
  assert.equal(prompt.match(/先停一下。/g)?.length, 1)
  assert.match(prompt, /userState/)
  assert.match(prompt, /用户讨论负面题材、角色愤怒或故事冲突，不代表用户本人负面/)
})

test('task results do not synthesize a user mood without user evidence', () => {
  const slots = applyObservationToMemorySlots(createDefaultMemorySlots(), {
    id: 7,
    type: 'task_completed',
    source: 'task_queue',
    summary: '后台任务完成',
    payload: {},
    createdAt: '2026-08-16T00:00:00.000Z'
  })

  assert.deepEqual(slots.user_mood, { confidence: 0 })
  assert.equal(slots.lastObservationId, 7)
})

test('one appraisal projects user state into memory and bounded response behavior', () => {
  const uncertainAppraisal = appraisal({
    userState: {
      mood: 'uncertain',
      valence: -0.2,
      confidence: 0.8
    }
  })
  const uncertainMood = compile(uncertainAppraisal)
  const calmMood = compile(NEUTRAL_MOOD_APPRAISAL)
  const metrics = {
    autonomy_level: 0.5,
    verbosity_index: 0.5,
    risk_tolerance: 0.5,
    formality_score: 0.5
  }
  const uncertainPolicy = buildPolicy(
    metrics,
    metrics,
    uncertainMood,
    [],
    '2026-08-16T00:00:00.000Z'
  )
  const calmPolicy = buildPolicy(metrics, metrics, calmMood, [], '2026-08-16T00:00:00.000Z')
  const slot = projectUserMoodSlot(uncertainAppraisal, {
    observationId: 12,
    retentionObservations: 3,
    nowIso: '2026-08-16T00:00:00.000Z'
  })
  const parts = buildPersonaAssemblyPromptParts({
    characterPrompt: '保持稳定人格。',
    expressionPrompt: '自然表达。',
    moodAssessment: uncertainMood,
    effectiveMetrics: metrics
  })

  assert.deepEqual(slot, {
    current_mood: 'uncertain',
    valence: -0.2,
    confidence: 0.8,
    updatedAt: '2026-08-16T00:00:00.000Z',
    expiresAfterObservationId: 15
  })
  assert.ok(uncertainPolicy.action.clarificationNeed > calmPolicy.action.clarificationNeed)
  assert.ok(uncertainPolicy.action.evidenceNeed > calmPolicy.action.evidenceNeed)
  assert.equal(uncertainPolicy.action.autonomyDrive, calmPolicy.action.autonomyDrive)
  assert.equal(uncertainPolicy.action.toolPersistence, calmPolicy.action.toolPersistence)
  assert.equal(uncertainPolicy.metrics.base.risk_tolerance, calmPolicy.metrics.base.risk_tolerance)
  assert.match(parts.instruction, /关键前提和不确定边界说清楚/)
  assert.doesNotMatch(parts.instruction, /userState|uncertain|confidence.*0\.8/)
})

test('low-confidence perceived user state does not steer memory or behavior', () => {
  const lowConfidence = appraisal({
    userState: {
      mood: 'frustrated',
      valence: -1,
      confidence: 0.2
    }
  })
  const slot = projectUserMoodSlot(lowConfidence, {
    observationId: 4,
    retentionObservations: 3,
    nowIso: '2026-08-16T00:00:00.000Z'
  })
  const parts = buildPersonaAssemblyPromptParts({
    characterPrompt: '保持稳定人格。',
    expressionPrompt: '自然表达。',
    moodAssessment: compile(lowConfidence),
    effectiveMetrics: {
      autonomy_level: 0.5,
      verbosity_index: 0.5,
      risk_tolerance: 0.5,
      formality_score: 0.5
    }
  })

  assert.deepEqual(slot, {
    confidence: 0,
    updatedAt: '2026-08-16T00:00:00.000Z'
  })
  const metrics = {
    autonomy_level: 0.5,
    verbosity_index: 0.5,
    risk_tolerance: 0.5,
    formality_score: 0.5
  }
  assert.deepEqual(
    buildPolicy(metrics, metrics, compile(lowConfidence), [], '2026-08-16T00:00:00.000Z').action,
    buildPolicy(metrics, metrics, compile(NEUTRAL_MOOD_APPRAISAL), [], '2026-08-16T00:00:00.000Z')
      .action
  )
  assert.doesNotMatch(parts.instruction, /受挫点/)
})

test('character boundary is applied before every derived mood projection', () => {
  const lockRanges = <T extends object>(
    state: T
  ): { [K in keyof T]: { min: number; max: number } } => {
    const ranges = {} as { [K in keyof T]: { min: number; max: number } }
    for (const key of Object.keys(state) as Array<keyof T>) {
      const value = state[key]
      if (typeof value !== 'number') throw new Error(`Mood state ${String(key)} must be numeric`)
      ranges[key] = { min: value, max: value }
    }
    return ranges
  }
  const lockedBoundary: CharacterMoodBoundary = {
    ...FAMILA_CHARACTER_MOOD_BOUNDARY,
    shortTermBounds: lockRanges(DEFAULT_SHORT_TERM),
    slowMoodBounds: lockRanges(DEFAULT_SLOW_MOOD),
    relationshipBounds: lockRanges(DEFAULT_RELATIONSHIP)
  }
  const severe = compile(
    appraisal({
      eventKind: 'obstacle',
      valence: -2,
      salience: 3,
      novelty: 3,
      futureProspect: -2,
      agency: 'user',
      confidence: 3
    }),
    undefined,
    '2026-08-16T00:00:00.000Z',
    lockedBoundary
  )
  const baseline = compile(
    NEUTRAL_MOOD_APPRAISAL,
    undefined,
    '2026-08-16T00:00:00.000Z',
    lockedBoundary
  )

  assert.deepEqual(severe.shortTerm, DEFAULT_SHORT_TERM)
  assert.deepEqual(severe.slowMood, DEFAULT_SLOW_MOOD)
  assert.deepEqual(severe.relationship, DEFAULT_RELATIONSHIP)
  assert.deepEqual(
    {
      primaryEmotion: severe.primaryEmotion,
      secondaryEmotion: severe.secondaryEmotion,
      intensity: severe.intensity,
      narrative: severe.narrative,
      expressionDelta: severe.expressionDelta,
      expressionModulation: severe.expressionModulation
    },
    {
      primaryEmotion: baseline.primaryEmotion,
      secondaryEmotion: baseline.secondaryEmotion,
      intensity: baseline.intensity,
      narrative: baseline.narrative,
      expressionDelta: baseline.expressionDelta,
      expressionModulation: baseline.expressionModulation
    }
  )
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

test('accumulated slow mood still affects action after a low-confidence ordinary message', () => {
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
  const stressed = compile(failure, first, '2026-08-16T00:01:00.000Z')
  const ordinary = compile(NEUTRAL_MOOD_APPRAISAL, stressed, '2026-08-16T00:02:00.000Z')
  const baseline = compile(NEUTRAL_MOOD_APPRAISAL)
  const metrics = {
    autonomy_level: 0.5,
    verbosity_index: 0.5,
    risk_tolerance: 0.5,
    formality_score: 0.5
  }
  const ordinaryPolicy = buildPolicy(metrics, metrics, ordinary, [], '2026-08-16T00:02:00.000Z')
  const baselinePolicy = buildPolicy(metrics, metrics, baseline, [], '2026-08-16T00:00:00.000Z')

  assert.equal(ordinary.appraisal.confidence, 0)
  assert.ok(ordinary.slowMood.stress > DEFAULT_SLOW_MOOD.stress)
  assert.ok(ordinaryPolicy.action.caution > baselinePolicy.action.caution)
  assert.ok(ordinaryPolicy.action.writeConservatism > baselinePolicy.action.writeConservatism)
})

test('ordinary neutral dialogue does not accumulate boredom', () => {
  const ordinary = appraisal({ eventKind: 'neutral', salience: 1, novelty: 0, confidence: 3 })
  let mood = compile(ordinary)
  for (let index = 1; index < 12; index += 1) {
    mood = compile(ordinary, mood, `2026-08-16T00:${String(index).padStart(2, '0')}:00.000Z`)
  }

  assert.deepEqual(mood.slowMood, DEFAULT_SLOW_MOOD)
  assert.deepEqual(mood.expressionDelta, { verbosity: 0, formality: 0 })
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

test('formality remains an expression metric and does not change recall behavior', () => {
  const mood = compile(NEUTRAL_MOOD_APPRAISAL)
  const informal = {
    autonomy_level: 0.5,
    verbosity_index: 0.5,
    risk_tolerance: 0.5,
    formality_score: 0.1
  }
  const formal = { ...informal, formality_score: 0.9 }

  assert.equal(
    buildPolicy(informal, informal, mood, [], '2026-08-16T00:00:00.000Z').action.recallNeed,
    buildPolicy(formal, formal, mood, [], '2026-08-16T00:00:00.000Z').action.recallNeed
  )
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

test('expression profiles only describe presentation and do not steer cognition or action', () => {
  const reflective = getExpressionPromptProfileById('reflective_discussion').prompt

  assert.doesNotMatch(reflective, /思考会更加深入|更乐观一点|更偏代价|分题材提示|尽量不会提出意见/)
  assert.match(reflective, /措辞|表达|呈现|节奏/)
  assert.match(reflective, /不改变观点所依据的事实与推理/)
})
