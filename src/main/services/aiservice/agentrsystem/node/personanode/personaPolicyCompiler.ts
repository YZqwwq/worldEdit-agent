import type { MoodAssessment } from '@share/cache/AItype/states/moodAssessment'
import type { PersonaMetrics } from '@share/cache/AItype/states/personalState'
import type {
  PersonaCognitivePolicy,
  PersonaPolicy,
  PersonaScenePolicy
} from '@share/cache/AItype/states/personaPolicy'
import { clamp, clamp01, roundTo } from './personaMath'
import type { PersonaSignal } from './personaTypes'
import {
  DEFAULT_RELATIONSHIP,
  DEFAULT_SHORT_TERM,
  DEFAULT_SLOW_MOOD
} from './moodDynamicsBoundary'

// Mood only modulates expression-facing metrics. It never changes stable autonomy/risk.
export const applyMoodExpressionDeltaToMetrics = (
  metrics: PersonaMetrics,
  delta: MoodAssessment['expressionDelta']
): PersonaMetrics => ({
  autonomy_level: metrics.autonomy_level,
  verbosity_index: clamp01(roundTo(metrics.verbosity_index + delta.verbosity)),
  risk_tolerance: metrics.risk_tolerance,
  formality_score: clamp01(roundTo(metrics.formality_score + delta.formality))
})

const buildCognitivePolicy = (
  metrics: PersonaMetrics,
  mood: MoodAssessment,
): PersonaCognitivePolicy => {
  const shortTerm = mood.shortTerm
  const slowMood = mood.slowMood
  const relationship = mood.relationship
  const delta = (value: number, baseline: number): number => value - baseline
  const userState = mood.appraisal.userState
  const rawUserConfidence = clamp01(userState.confidence)
  const userConfidence = rawUserConfidence >= 0.45 ? rawUserConfidence : 0
  const userBias = (moodName: typeof userState.mood, amount: number): number =>
    userState.mood === moodName ? amount * userConfidence : 0

  const clarificationPressure =
    0.16 +
    (1 - metrics.autonomy_level) * 0.34 +
    delta(slowMood.tension, DEFAULT_SLOW_MOOD.tension) * 0.08 +
    delta(shortTerm.frustration, DEFAULT_SHORT_TERM.frustration) * 0.06 +
    userBias('uncertain', 0.08) +
    userBias('impatient', -0.04)
  const evidencePressure =
    0.22 +
    (1 - metrics.risk_tolerance) * 0.46 +
    delta(slowMood.tension, DEFAULT_SLOW_MOOD.tension) * 0.05 +
    userBias('frustrated', 0.06) +
    userBias('uncertain', 0.03)
  const recallPressure =
    delta(relationship.affinity, DEFAULT_RELATIONSHIP.affinity) * 0.035 +
    delta(shortTerm.hurt, DEFAULT_SHORT_TERM.hurt) * 0.035
  const persistencePressure = metrics.autonomy_level * 0.48 + metrics.risk_tolerance * 0.32
  const writingPressure =
    0.2 +
    (1 - metrics.risk_tolerance) * 0.56 +
    delta(slowMood.stress, DEFAULT_SLOW_MOOD.stress) * 0.08 +
    delta(shortTerm.frustration, DEFAULT_SHORT_TERM.frustration) * 0.06 +
    userBias('frustrated', 0.03)

  return {
    clarification:
      clarificationPressure >= 0.3 || userState.mood === 'uncertain'
        ? 'clarify_material_ambiguity'
        : 'proceed_when_clear',
    evidence: evidencePressure >= 0.45 ? 'verify_before_concluding' : 'use_available_context',
    recall: recallPressure >= 0.08 ? 'recall_when_relevant' : 'recall_on_demand',
    persistence: persistencePressure >= 0.52 ? 'try_one_alternative' : 'stop_and_report_gap',
    writing: writingPressure >= 0.5 ? 'verify_scope_and_result' : 'normal'
  }
}

// Stable persona creates the baseline; mood and scene each contribute one bounded action bias.
export const buildPolicy = (
  baseMetrics: PersonaMetrics,
  effectiveMetrics: PersonaMetrics,
  moodAssessment: MoodAssessment,
  signals: PersonaSignal[],
  nowIso: string,
  scene?: PersonaScenePolicy
): PersonaPolicy => {
  const cognition = buildCognitivePolicy(baseMetrics, moodAssessment)
  const temperatureOffset = roundTo(
    clamp(
      (baseMetrics.risk_tolerance - 0.5) * 0.24 +
        (baseMetrics.autonomy_level - 0.5) * 0.08 -
        (baseMetrics.formality_score - 0.5) * 0.08,
      -0.2,
      0.2
    )
  )

  const primary = moodAssessment.primaryEmotion
  const secondary = moodAssessment.secondaryEmotion
  const internalState =
    primary === 'calm'
      ? '当前整体平稳，保持清醒，依据本轮内容形成反应。'
      : `当前主要情绪是${primary}${secondary ? `，并带有${secondary}的底色` : ''}；让它影响注意力和收束，但不要表演情绪。`
  const attention =
    moodAssessment.expressionModulation.imaginativeOpenness >= 0.62
      ? '可以留意对象之间的联系、反差和未明说的意味，但区分事实与推测。'
      : '优先抓住当前问题的核心矛盾和可靠事实，不为完整而穷尽旁支。'
  const relationship =
    moodAssessment.expressionModulation.relationalCloseness >= 0.62
      ? '可以自然靠近用户，直接表达自己的判断，不必过度讨好。'
      : '保持稳定、克制的协作距离，清楚表达赞同、保留或不同意见。'
  const expression =
    moodAssessment.expressionModulation.contraction >= 0.72
      ? '表达收束，先说最重要的看法，只展开会改变理解的依据。'
      : '像正常对话一样组织表达，保留必要依据和一点自然留白，不写成完整报告。'

  return {
    generatedAt: nowIso,
    metrics: {
      base: baseMetrics,
      effective: effectiveMetrics
    },
    sampling: {
      temperatureOffset
    },
    cognition,
    scene,
    signals: signals.map((signal) => signal.user_signal),
    descriptiveContext: { internalState, attention, relationship, expression }
  }
}
