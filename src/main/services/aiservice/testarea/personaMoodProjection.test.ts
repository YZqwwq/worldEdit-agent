import assert from 'node:assert/strict'
import test from 'node:test'
import type { PersonaActionPolicy } from '@share/cache/AItype/states/personaPolicy'
import { buildActionPolicyPrompt } from '../prompt/main_agent/persona/actionPolicyPrompt'
import { buildPersonaAssemblyPromptParts } from '../prompt/main_agent/persona/personaAssemblyPrompt'
import { buildSceneCharacterPrompt } from '../prompt/main_agent/persona/sceneCharacterPrompt'
import { 默认情绪向量 } from '../agentrsystem/node/personanode/characterMoodBoundary'
import { compileMoodAssessment } from '../agentrsystem/node/personanode/moodStateCompiler'
import { buildPolicy } from '../agentrsystem/node/personanode/personaPolicyCompiler'
import {
  applySceneCharacterToMetrics,
  resolveSceneCharacter
} from '../agentrsystem/node/personanode/sceneCharacterRegistry'

const source = {
  信号: []
}

const activatedVector = {
  愉悦度: 0.82,
  激活度: 0.78,
  紧张度: 0.7,
  受挫度: 0.62,
  亲近度: 0.7,
  专注度: 0.82
}

test('low-confidence mood inference stays close to the character baseline', () => {
  const lowConfidence = compileMoodAssessment({
    inferred: {
      情绪向量: activatedVector,
      置信度: 0.1,
      行为叙事: '状态发生了非常明显的变化。'
    },
    nowIso: '2026-08-14T00:00:00.000Z',
    source
  })
  const highConfidence = compileMoodAssessment({
    inferred: {
      情绪向量: activatedVector,
      置信度: 1,
      行为叙事: '当前更专注，也更愿意推进。'
    },
    nowIso: '2026-08-14T00:00:00.000Z',
    source
  })

  assert.ok(
    Math.abs(lowConfidence.情绪向量.紧张度 - 默认情绪向量.紧张度) <
      Math.abs(highConfidence.情绪向量.紧张度 - 默认情绪向量.紧张度)
  )
  assert.ok(lowConfidence.强度 < highConfidence.强度)
  assert.match(lowConfidence.行为叙事, /信号较弱/)
})

test('missing mood evidence decays the previous state instead of resetting it', () => {
  const previous = compileMoodAssessment({
    inferred: {
      情绪向量: activatedVector,
      置信度: 1,
      行为叙事: '当前状态较强。'
    },
    nowIso: '2026-08-14T00:00:00.000Z',
    source
  })
  const next = compileMoodAssessment({
    inferred: {
      情绪向量: 默认情绪向量,
      置信度: 0,
      行为叙事: '没有足够信息。'
    },
    previousMood: previous,
    nowIso: '2026-08-14T00:01:00.000Z',
    source
  })

  assert.ok(next.情绪向量.激活度 < previous.情绪向量.激活度)
  assert.ok(next.情绪向量.激活度 > 默认情绪向量.激活度)
})

test('action policy consumes mood-adjusted effective metrics', () => {
  const mood = compileMoodAssessment({
    inferred: {
      情绪向量: 默认情绪向量,
      置信度: 1,
      行为叙事: '保持稳定。'
    },
    nowIso: '2026-08-14T00:00:00.000Z',
    source
  })
  const base = {
    autonomy_level: 0.1,
    verbosity_index: 0.5,
    risk_tolerance: 0.5,
    formality_score: 0.5
  }
  const effective = {
    ...base,
    autonomy_level: 0.9
  }
  const policy = buildPolicy(base, base, effective, mood, [], '2026-08-14T00:00:00.000Z')

  assert.ok(policy.action.autonomyDrive > 0.75)
})

test('main-agent persona prompts contain semantic projections instead of mood scores', () => {
  const mood = compileMoodAssessment({
    inferred: {
      情绪向量: activatedVector,
      置信度: 0.9,
      行为叙事: '当前更专注，表达应保持收束。'
    },
    nowIso: '2026-08-14T00:00:00.000Z',
    source
  })
  const parts = buildPersonaAssemblyPromptParts({
    characterPrompt: '保持稳定人格。',
    expressionPrompt: '自然表达。',
    moodAssessment: mood
  })
  const prompt = `${parts.moodContext}\n${parts.instruction}`

  assert.doesNotMatch(prompt, /(?:自主性|详略度|探索性|正式度)偏移/)
  assert.doesNotMatch(prompt, /(?:表达温度|收束度|关系靠近度|想象开放度|澄清需求):\s*\d/)
  assert.match(prompt, /current_expression_directions/)
  assert.match(prompt, /当前更专注，表达应保持收束/)
})

test('action prompt hides internal scores and keeps tool permission separate', () => {
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

test('document workspace activates the registered text-editing character scene', () => {
  const scene = resolveSceneCharacter({
    pageKind: 'document',
    routeName: 'WorldEntityDocumentEditor',
    capturedAt: '2026-08-14T00:00:00.000Z',
    document: { id: 'doc-1', title: '角色设定' }
  })
  const chatScene = resolveSceneCharacter({
    pageKind: 'chat',
    routeName: 'Chat',
    capturedAt: '2026-08-14T00:00:00.000Z'
  })

  assert.equal(scene?.policy.id, 'document_editing')
  assert.equal(chatScene, undefined)
  assert.match(buildSceneCharacterPrompt(scene?.policy), /当前场景人格姿态：文本编辑/)
  assert.match(buildSceneCharacterPrompt(scene?.policy), /不自动代表用户要求修改/)
})

test('text-editing scene affects mind and action without changing the persisted baseline', () => {
  const scene = resolveSceneCharacter({
    pageKind: 'document',
    routeName: 'WorldEntityDocumentEditor',
    capturedAt: '2026-08-14T00:00:00.000Z'
  })
  assert.ok(scene)

  const base = {
    autonomy_level: 0.5,
    verbosity_index: 0.5,
    risk_tolerance: 0.5,
    formality_score: 0.5
  }
  const sceneMetrics = applySceneCharacterToMetrics(base, scene)
  const mood = compileMoodAssessment({
    inferred: {
      情绪向量: 默认情绪向量,
      置信度: 1,
      行为叙事: '保持稳定。'
    },
    nowIso: '2026-08-14T00:00:00.000Z',
    source
  })
  const withoutScene = buildPolicy(base, base, base, mood, [], '2026-08-14T00:00:00.000Z')
  const withScene = buildPolicy(
    base,
    sceneMetrics,
    sceneMetrics,
    mood,
    [],
    '2026-08-14T00:00:00.000Z',
    scene.policy
  )

  assert.deepEqual(base, {
    autonomy_level: 0.5,
    verbosity_index: 0.5,
    risk_tolerance: 0.5,
    formality_score: 0.5
  })
  assert.ok(sceneMetrics.risk_tolerance < base.risk_tolerance)
  assert.ok(withScene.action.evidenceNeed > withoutScene.action.evidenceNeed)
  assert.ok(withScene.action.writeConservatism > withoutScene.action.writeConservatism)
  assert.equal(withScene.scene?.id, 'document_editing')
})
