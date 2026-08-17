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

const buildBaseActionPolicy = (metrics: PersonaMetrics): PersonaActionPolicy => ({
  autonomyDrive: roundTo(metrics.autonomy_level),
  caution: roundTo(
    clamp(0.18 + (1 - metrics.risk_tolerance) * 0.5 + (1 - metrics.autonomy_level) * 0.12, 0, 1)
  ),
  clarificationNeed: roundTo(clamp(0.16 + (1 - metrics.autonomy_level) * 0.34, 0, 1)),
  evidenceNeed: roundTo(clamp(0.22 + (1 - metrics.risk_tolerance) * 0.46, 0, 1)),
  recallNeed: 0.28,
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
  const delta = (value: number, baseline: number): number => value - baseline
  const apply = (value: number, adjustment: number): number =>
    clamp01(roundTo(value + adjustment))

  return {
    autonomyDrive: action.autonomyDrive,
    caution: apply(
      action.caution,
      delta(slowMood.tension, DEFAULT_SLOW_MOOD.tension) * 0.1 +
        delta(slowMood.stress, DEFAULT_SLOW_MOOD.stress) * 0.08 +
        delta(shortTerm.fear, DEFAULT_SHORT_TERM.fear) * 0.06
    ),
    clarificationNeed: apply(
      action.clarificationNeed,
      delta(slowMood.tension, DEFAULT_SLOW_MOOD.tension) * 0.08 +
        delta(shortTerm.frustration, DEFAULT_SHORT_TERM.frustration) * 0.06 +
        delta(shortTerm.surprise, DEFAULT_SHORT_TERM.surprise) * 0.05
    ),
    evidenceNeed: apply(
      action.evidenceNeed,
      delta(shortTerm.interest, DEFAULT_SHORT_TERM.interest) * 0.07 +
        delta(slowMood.tension, DEFAULT_SLOW_MOOD.tension) * 0.05
    ),
    recallNeed: apply(
      action.recallNeed,
      delta(relationship.affinity, DEFAULT_RELATIONSHIP.affinity) * 0.035 +
        delta(shortTerm.hurt, DEFAULT_SHORT_TERM.hurt) * 0.035
    ),
    writeConservatism: apply(
      action.writeConservatism,
      delta(slowMood.stress, DEFAULT_SLOW_MOOD.stress) * 0.08 +
        delta(shortTerm.frustration, DEFAULT_SHORT_TERM.frustration) * 0.06
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
