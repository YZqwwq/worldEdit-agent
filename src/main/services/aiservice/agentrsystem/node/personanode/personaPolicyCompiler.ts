import type { MoodAssessment } from '@share/cache/AItype/states/moodAssessment'
import type { PersonaMetrics } from '@share/cache/AItype/states/personalState'
import type { PersonaActionPolicy, PersonaPolicy } from '@share/cache/AItype/states/personaPolicy'
import { clamp01, roundTo } from '../../manager/personal/personalManager'
import { clamp } from './personaMath'
import type { PersonaSignal } from './personaTypes'

export const applyMoodDeltaToMetrics = (
  metrics: PersonaMetrics,
  delta: MoodAssessment['参数偏移']
): PersonaMetrics => ({
  autonomy_level: clamp01(roundTo(metrics.autonomy_level + delta.自主性)),
  verbosity_index: clamp01(roundTo(metrics.verbosity_index + delta.详略度)),
  risk_tolerance: clamp01(roundTo(metrics.risk_tolerance + delta.探索性)),
  formality_score: clamp01(roundTo(metrics.formality_score + delta.正式度))
})

const buildActionPolicy = (
  baseMetrics: PersonaMetrics,
  moodAssessment: MoodAssessment
): PersonaActionPolicy => {
  const tension = moodAssessment.情绪向量.紧张度
  const frustration = moodAssessment.情绪向量.受挫度
  const focus = moodAssessment.情绪向量.专注度
  const restraint = moodAssessment.表达调制.收束度
  const clarification = moodAssessment.表达调制.澄清需求

  return {
    autonomyDrive: roundTo(clamp(baseMetrics.autonomy_level * 0.78 + focus * 0.22, 0, 1)),
    caution: roundTo(
      clamp(
        0.36 +
          (1 - baseMetrics.risk_tolerance) * 0.32 +
          (1 - baseMetrics.autonomy_level) * 0.16 +
          restraint * 0.1 +
          tension * 0.12 +
          frustration * 0.08,
        0,
        1
      )
    ),
    clarificationNeed: roundTo(
      clamp(clarification * 0.72 + (1 - baseMetrics.autonomy_level) * 0.18 + tension * 0.1, 0, 1)
    ),
    evidenceNeed: roundTo(
      clamp(0.28 + (1 - baseMetrics.risk_tolerance) * 0.28 + focus * 0.2 + tension * 0.12, 0, 1)
    ),
    recallNeed: roundTo(
      clamp(0.24 + restraint * 0.18 + focus * 0.16 + moodAssessment.情绪向量.亲近度 * 0.12, 0, 1)
    ),
    writeConservatism: roundTo(
      clamp(
        0.3 + (1 - baseMetrics.risk_tolerance) * 0.34 + restraint * 0.16 + frustration * 0.12,
        0,
        1
      )
    ),
    toolPersistence: roundTo(
      clamp(
        baseMetrics.autonomy_level * 0.32 +
          baseMetrics.risk_tolerance * 0.26 +
          focus * 0.24 -
          frustration * 0.12,
        0,
        1
      )
    )
  }
}

// 将人格数值和情绪评估编译为本轮运行策略，供主模型采样、工具调用和记忆系统使用。
export const buildPolicy = (
  baseMetrics: PersonaMetrics,
  effectiveMetrics: PersonaMetrics,
  moodAssessment: MoodAssessment,
  signals: PersonaSignal[],
  nowIso: string
): PersonaPolicy => {
  const action = buildActionPolicy(baseMetrics, moodAssessment)
  const temperature = roundTo(
    clamp(
      0.45 +
        effectiveMetrics.risk_tolerance * 0.4 +
        effectiveMetrics.autonomy_level * 0.12 -
        effectiveMetrics.formality_score * 0.1,
      0.2,
      1.2
    )
  )
  const topP = roundTo(clamp(0.72 + effectiveMetrics.risk_tolerance * 0.24, 0.6, 0.98))
  const maxTokens = Math.round(clamp(520 + effectiveMetrics.verbosity_index * 980, 420, 1800))

  return {
    generatedAt: nowIso,
    metrics: {
      base: baseMetrics,
      effective: effectiveMetrics
    },
    sampling: {
      temperature,
      topP,
      maxTokens
    },
    tool: {
      confirmBeforeSensitiveTools: action.caution >= 0.58 || action.writeConservatism >= 0.62,
      allowRiskyTools:
        baseMetrics.risk_tolerance >= 0.5 && action.caution < 0.66 && action.writeConservatism < 0.7
    },
    action,
    memory: {
      archiveThreshold: Math.round(clamp(8 - baseMetrics.verbosity_index * 4, 4, 8)),
      shortTermLimit: 4
    },
    signals: signals.map((signal) => signal.user_signal)
  }
}
