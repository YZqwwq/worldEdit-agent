import type { MoodAssessment } from '@share/cache/AItype/states/moodAssessment'
import type { PersonaMetrics } from '@share/cache/AItype/states/personalState'
import type {
  PersonaActionPolicy,
  PersonaPolicy,
  PersonaScenePolicy
} from '@share/cache/AItype/states/personaPolicy'
import { clamp, clamp01, roundTo } from './personaMath'
import type { PersonaSignal } from './personaTypes'
import { applyWorkspaceSceneActionBias } from '../../workspaceProfileRegistry'

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

const buildBaseActionPolicy = (metrics: PersonaMetrics): PersonaActionPolicy => ({
  autonomyDrive: roundTo(metrics.autonomy_level),
  caution: roundTo(
    clamp(0.18 + (1 - metrics.risk_tolerance) * 0.5 + (1 - metrics.autonomy_level) * 0.12, 0, 1)
  ),
  clarificationNeed: roundTo(clamp(0.16 + (1 - metrics.autonomy_level) * 0.34, 0, 1)),
  evidenceNeed: roundTo(clamp(0.22 + (1 - metrics.risk_tolerance) * 0.46, 0, 1)),
  recallNeed: roundTo(clamp(0.22 + metrics.formality_score * 0.12, 0, 1)),
  writeConservatism: roundTo(clamp(0.2 + (1 - metrics.risk_tolerance) * 0.56, 0, 1)),
  toolPersistence: roundTo(
    clamp(metrics.autonomy_level * 0.48 + metrics.risk_tolerance * 0.32, 0, 1)
  )
})

const applyMoodActionBias = (
  action: PersonaActionPolicy,
  mood: MoodAssessment
): PersonaActionPolicy => {
  const shortTerm = mood.shortTerm
  const slowMood = mood.slowMood
  const relationship = mood.relationship
  const modulation = mood.expressionModulation
  const confidence = clamp01(mood.appraisal.confidence / 3)
  const apply = (value: number, delta: number): number =>
    clamp01(roundTo(value + delta * confidence))

  return {
    autonomyDrive: action.autonomyDrive,
    caution: apply(
      action.caution,
      slowMood.tension * 0.1 + slowMood.stress * 0.08 + shortTerm.fear * 0.06
    ),
    clarificationNeed: apply(
      action.clarificationNeed,
      modulation.clarificationNeed * 0.14 + shortTerm.surprise * 0.05
    ),
    evidenceNeed: apply(
      action.evidenceNeed,
      shortTerm.interest * 0.07 + slowMood.tension * 0.05
    ),
    recallNeed: apply(
      action.recallNeed,
      relationship.affinity * 0.035 + shortTerm.hurt * 0.035
    ),
    writeConservatism: apply(
      action.writeConservatism,
      modulation.contraction * 0.1 + shortTerm.frustration * 0.06
    ),
    toolPersistence: action.toolPersistence
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
  const baseAction = buildBaseActionPolicy(baseMetrics)
  const moodAdjustedAction = applyMoodActionBias(baseAction, moodAssessment)
  const action = applyWorkspaceSceneActionBias(moodAdjustedAction, scene)
  const temperatureOffset = roundTo(
    clamp(
      (baseMetrics.risk_tolerance - 0.5) * 0.24 +
        (baseMetrics.autonomy_level - 0.5) * 0.08 -
        (baseMetrics.formality_score - 0.5) * 0.08,
      -0.2,
      0.2
    )
  )

  return {
    generatedAt: nowIso,
    metrics: {
      base: baseMetrics,
      effective: effectiveMetrics
    },
    sampling: {
      temperatureOffset
    },
    action,
    scene,
    signals: signals.map((signal) => signal.user_signal)
  }
}
