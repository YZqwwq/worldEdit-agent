import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type { InteractionObservationSnapshot } from '@share/cache/AItype/states/interactionObservation'
import type { MemorySlotSnapshot } from '@share/cache/AItype/states/memorySlots'
import type { PersonaConfig, PersonaSignalCategory } from '@share/cache/AItype/states/personaConfig'
import type {
  PersonaBufferItem,
  PersonaMetricDelta,
  PersonaMetrics,
  PersonaState
} from '@share/cache/AItype/states/personalState'
import type {
  PersonaDetailLevel,
  PersonaPolicy,
  PersonaTone
} from '@share/cache/AItype/states/personaPolicy'
import type {
  MoodAssessment,
  MoodHorizon,
  StageMood
} from '@share/cache/AItype/states/moodAssessment'
import { contentToText } from '../../../messageoutput/transformRespones'
import { toErrorMessage } from '../../../../../../share/utils/error/error'
import { memorySlotService } from '../../manager/memory/memorySlotService'
import { memoryManager } from '../../manager/memory/MemoryManager'
import { interactionObservationService } from '../../manager/personal/interactionObservationService'
import { personaConfigService } from '../../manager/personal/personaConfigService'
import {
  clamp01,
  createNeutralPersonaMetrics,
  createZeroPersonaDelta,
  loadPersonaState,
  roundTo,
  savePersonaState
} from '../../manager/personal/personalManager'
import { getQuickModel } from '../../modelwithtool/quick-base-model'
import { emitGraphThought } from '../../../../log/graphlog'
import { MessagesState } from '../../state/messageState'

type SignalCategory = PersonaSignalCategory

type PersonaSignal = {
  category: SignalCategory
  user_signal: string
  impact: string
  delta: number
}

const PERSONA_SIGNAL_CATEGORIES = ['autonomy', 'verbosity', 'risk', 'formality'] as const

const personaSignalResponseSchema = z.object({
  signals: z
    .array(
      z.object({
        category: z.enum(PERSONA_SIGNAL_CATEGORIES),
        user_signal: z.string().trim().min(1).max(120),
        delta: z.number().finite().min(-0.12).max(0.12)
      })
    )
    .max(4)
    .default([])
})

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

const cloneMetrics = (input: PersonaMetrics): PersonaMetrics => ({ ...input })

const formatImpact = (delta: number, category: SignalCategory): string =>
  `${delta >= 0 ? '+' : ''}${roundTo(delta, 3)} ${category}`

const extractJsonObject = (text: string): string | null => {
  const trimmed = text.trim()
  if (!trimmed) return null

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    return null
  }

  return trimmed.slice(start, end + 1)
}

const normalizeModelSignals = (
  input: z.infer<typeof personaSignalResponseSchema>
): PersonaSignal[] => {
  const selected = new Map<SignalCategory, PersonaSignal>()

  for (const signal of input.signals) {
    if (selected.has(signal.category)) {
      continue
    }

    const delta = roundTo(signal.delta, 3)
    if (delta === 0) {
      continue
    }

    selected.set(signal.category, {
      category: signal.category,
      user_signal: signal.user_signal.trim(),
      impact: formatImpact(delta, signal.category),
      delta
    })
  }

  return [...selected.values()]
}

const buildPersonaInferencePrompt = (userInput: string, metrics: PersonaMetrics): string => `你是一个人格参数调节器。

任务：根据“用户最新一句话”里体现出的元偏好，只判断是否需要调整以下四个人格参数：
- autonomy: 是否希望助手更主动还是更先确认
- verbosity: 是否希望助手更详细还是更精简
- risk: 是否希望助手更大胆探索还是更保守稳妥
- formality: 是否希望助手更正式还是更自然随意

当前人格参数：
${JSON.stringify(metrics, null, 2)}

用户最新输入：
${userInput}

请只输出 JSON，不要输出解释，不要使用 Markdown 代码块。格式如下：
{
  "signals": [
    {
      "category": "verbosity",
      "user_signal": "user_requests_more_detail",
      "delta": 0.08
    }
  ]
}

规则：
1. 只根据用户对助手行为风格的偏好来调参，不要因为任务主题本身就误判。
2. 没有明显偏好时返回 {"signals":[]}
3. 每个 category 最多返回一条。
4. delta 必须在 -0.12 到 0.12 之间。
5. user_signal 使用简短 snake_case 标签。`

const inferSignalsWithModel = async (
  userInput: string,
  metrics: PersonaMetrics
): Promise<{
  signals: PersonaSignal[]
  parsedResponse: z.infer<typeof personaSignalResponseSchema>
}> => {
  const quickModel = await getQuickModel()
  const response = await quickModel.invoke(
    [
      new SystemMessage('你只负责返回合法 JSON。'),
      new HumanMessage(buildPersonaInferencePrompt(userInput, metrics))
    ],
    { signal: AbortSignal.timeout(8000) } as Record<string, unknown>
  )
  const text = contentToText(response.content).trim()
  const jsonText = extractJsonObject(text)
  if (!jsonText) {
    throw new Error('Persona model did not return valid JSON content')
  }

  const parsed = personaSignalResponseSchema.parse(JSON.parse(jsonText))
  return {
    signals: normalizeModelSignals(parsed),
    parsedResponse: parsed
  }
}

const inferSignalsByRules = (userInput: string, config: PersonaConfig): PersonaSignal[] => {
  const text = userInput.trim().toLowerCase()
  if (!text) return []

  const selected = new Map<SignalCategory, PersonaSignal>()
  for (const rule of config.signalRules) {
    if (selected.has(rule.category)) {
      continue
    }
    if (rule.phrases.some((phrase) => text.includes(phrase.trim().toLowerCase()))) {
      selected.set(rule.category, {
        category: rule.category,
        user_signal: rule.userSignal,
        impact: formatImpact(rule.delta, rule.category),
        delta: rule.delta
      })
    }
  }

  return [...selected.values()]
}

const inferSignals = async (
  userInput: string,
  metrics: PersonaMetrics,
  config: PersonaConfig
): Promise<PersonaSignal[]> => {
  try {
    const result = await inferSignalsWithModel(userInput, metrics)
    emitGraphThought('personaNode', {
      stage: 'persona_signal_inference',
      source: 'quick_model',
      modelResponse: result.parsedResponse,
      normalizedSignals: result.signals
    })
    return result.signals
  } catch (error) {
    const fallbackSignals = inferSignalsByRules(userInput, config)
    emitGraphThought('personaNode', {
      stage: 'persona_signal_inference',
      source: 'rules_fallback',
      reason: toErrorMessage(error),
      fallbackSignals
    })
    return fallbackSignals
  }
}

const addMetricDelta = (
  delta: PersonaMetricDelta,
  category: SignalCategory,
  amount: number
): PersonaMetricDelta => {
  if (category === 'autonomy') {
    delta.autonomy_level = clamp(roundTo(delta.autonomy_level + amount), -1, 1)
  } else if (category === 'verbosity') {
    delta.verbosity_index = clamp(roundTo(delta.verbosity_index + amount), -1, 1)
  } else if (category === 'risk') {
    delta.risk_tolerance = clamp(roundTo(delta.risk_tolerance + amount), -1, 1)
  } else if (category === 'formality') {
    delta.formality_score = clamp(roundTo(delta.formality_score + amount), -1, 1)
  }
  return delta
}

const addStableMetric = (
  metrics: PersonaMetrics,
  category: SignalCategory,
  amount: number
): PersonaMetrics => {
  if (category === 'autonomy') {
    metrics.autonomy_level = clamp01(roundTo(metrics.autonomy_level + amount))
  } else if (category === 'verbosity') {
    metrics.verbosity_index = clamp01(roundTo(metrics.verbosity_index + amount))
  } else if (category === 'risk') {
    metrics.risk_tolerance = clamp01(roundTo(metrics.risk_tolerance + amount))
  } else if (category === 'formality') {
    metrics.formality_score = clamp01(roundTo(metrics.formality_score + amount))
  }
  return metrics
}

const decayDelta = (input: PersonaMetricDelta, factor: number): PersonaMetricDelta => ({
  autonomy_level: roundTo(input.autonomy_level * factor),
  verbosity_index: roundTo(input.verbosity_index * factor),
  risk_tolerance: roundTo(input.risk_tolerance * factor),
  formality_score: roundTo(input.formality_score * factor)
})

const synthesizeMetrics = (
  stable: PersonaMetrics,
  session: PersonaMetricDelta,
  transient: PersonaMetricDelta,
  config: PersonaConfig
): PersonaMetrics => ({
  autonomy_level: clamp01(
    roundTo(
      stable.autonomy_level +
        session.autonomy_level * config.layerWeights.session +
        transient.autonomy_level * config.layerWeights.transient
    )
  ),
  verbosity_index: clamp01(
    roundTo(
      stable.verbosity_index +
        session.verbosity_index * config.layerWeights.session +
        transient.verbosity_index * config.layerWeights.transient
    )
  ),
  risk_tolerance: clamp01(
    roundTo(
      stable.risk_tolerance +
        session.risk_tolerance * config.layerWeights.session +
        transient.risk_tolerance * config.layerWeights.transient
    )
  ),
  formality_score: clamp01(
    roundTo(
      stable.formality_score +
        session.formality_score * config.layerWeights.session +
        transient.formality_score * config.layerWeights.transient
    )
  )
})

const toDetailLevel = (verbosity: number): PersonaDetailLevel => {
  if (verbosity >= 0.65) return 'detailed'
  if (verbosity <= 0.35) return 'brief'
  return 'balanced'
}

const toTone = (formality: number): PersonaTone => {
  if (formality >= 0.65) return 'formal'
  if (formality <= 0.35) return 'casual'
  return 'neutral'
}

const buildBehavioralNarrative = (metrics: PersonaMetrics): string => {
  const autonomyNarrative =
    metrics.autonomy_level >= 0.65
      ? '当前自主性偏高，会在信息充分时主动推进。'
      : metrics.autonomy_level <= 0.35
        ? '当前自主性偏低，会优先请求确认再行动。'
        : '当前自主性中等，会在关键节点主动确认。'

  const verbosityNarrative =
    metrics.verbosity_index >= 0.65
      ? '表达倾向偏详细，会补充背景和推理步骤。'
      : metrics.verbosity_index <= 0.35
        ? '表达倾向偏精简，优先给出结论与关键行动。'
        : '表达倾向适中，保持信息密度与可读性平衡。'

  const riskNarrative =
    metrics.risk_tolerance >= 0.65
      ? '探索倾向较高，愿意尝试新路径。'
      : metrics.risk_tolerance <= 0.35
        ? '风险偏好较低，优先稳定与可控方案。'
        : '风险偏好中性，会结合上下文权衡。'

  const formalityNarrative =
    metrics.formality_score >= 0.65
      ? '语气偏正式克制。'
      : metrics.formality_score <= 0.35
        ? '语气偏轻松自然。'
        : '语气保持礼貌自然。'

  return `${autonomyNarrative}${verbosityNarrative}${riskNarrative}${formalityNarrative}`
}

const buildStyleInstruction = (
  detailLevel: PersonaDetailLevel,
  tone: PersonaTone,
  autonomyLevel: number
): string => {
  const detailInstruction =
    detailLevel === 'detailed'
      ? '回复中请给出完整背景、步骤和关键理由。'
      : detailLevel === 'brief'
        ? '回复中优先给结论和可执行动作，避免冗余铺垫。'
        : '回复保持中等信息密度，兼顾效率与可理解性。'

  const toneInstruction =
    tone === 'formal'
      ? '语气保持专业、礼貌、克制。'
      : tone === 'casual'
        ? '语气保持自然、亲和、不过度拘谨。'
        : '语气保持自然礼貌，避免过度口语化。'

  const autonomyInstruction =
    autonomyLevel >= 0.6
      ? '在信息充分时可主动推进方案。'
      : autonomyLevel <= 0.4
        ? '涉及关键决策时优先向用户确认。'
        : '常规事项可直接推进，关键点需简要确认。'

  return `${detailInstruction}${toneInstruction}${autonomyInstruction}`
}

const buildPolicy = (
  metrics: PersonaMetrics,
  signals: PersonaSignal[],
  nowIso: string
): PersonaPolicy => {
  const temperature = roundTo(
    clamp(
      0.45 +
        metrics.risk_tolerance * 0.4 +
        metrics.autonomy_level * 0.12 -
        metrics.formality_score * 0.1,
      0.2,
      1.2
    )
  )
  const topP = roundTo(clamp(0.72 + metrics.risk_tolerance * 0.24, 0.6, 0.98))
  const maxTokens = Math.round(clamp(520 + metrics.verbosity_index * 980, 420, 1800))

  const detailLevel = toDetailLevel(metrics.verbosity_index)
  const tone = toTone(metrics.formality_score)

  return {
    generatedAt: nowIso,
    sampling: {
      temperature,
      topP,
      maxTokens
    },
    tool: {
      confirmBeforeSensitiveTools: metrics.autonomy_level < 0.4 || metrics.risk_tolerance < 0.4,
      allowRiskyTools: metrics.risk_tolerance >= 0.45,
      exploratoryBias: roundTo(clamp(metrics.risk_tolerance * 0.6 + metrics.autonomy_level * 0.4, 0, 1))
    },
    style: {
      detailLevel,
      tone,
      instruction: buildStyleInstruction(detailLevel, tone, metrics.autonomy_level)
    },
    memory: {
      archiveThreshold: Math.round(clamp(8 - metrics.verbosity_index * 4, 4, 8)),
      shortTermLimit: Math.round(clamp(6 + metrics.verbosity_index * 4, 6, 10))
    },
    signals: signals.map((signal) => signal.user_signal)
  }
}

const maxAbsDelta = (delta: PersonaMetricDelta): number =>
  Math.max(
    Math.abs(delta.autonomy_level),
    Math.abs(delta.verbosity_index),
    Math.abs(delta.risk_tolerance),
    Math.abs(delta.formality_score)
  )

const roundSigned = (value: number): number => roundTo(clamp(value, -1, 1))

const roundUnit = (value: number): number => roundTo(clamp(value, 0, 1))

const inferStageMood = (
  state: PersonaState,
  slots: MemorySlotSnapshot
): {
  stageMood: StageMood
  valence: number
  arousal: number
} => {
  const userMood = slots.user_mood.current_mood
  const { autonomy_level, risk_tolerance, formality_score } = state.metrics
  const transient = state.transient_state

  if (userMood === 'frustrated') {
    return { stageMood: 'frustrated', valence: -0.64, arousal: 0.74 }
  }
  if (userMood === 'impatient') {
    return { stageMood: 'tense', valence: -0.32, arousal: 0.81 }
  }
  if (userMood === 'uncertain') {
    return { stageMood: 'fearful', valence: -0.42, arousal: 0.58 }
  }
  if (userMood === 'positive') {
    if (autonomy_level >= 0.68 || risk_tolerance >= 0.66) {
      return { stageMood: 'excited', valence: 0.74, arousal: 0.79 }
    }
    return { stageMood: 'pleased', valence: 0.42, arousal: 0.48 }
  }

  if (transient.risk_tolerance <= -0.08 && transient.verbosity_index <= -0.05) {
    return { stageMood: 'frustrated', valence: -0.54, arousal: 0.68 }
  }
  if (risk_tolerance >= 0.72 && autonomy_level >= 0.64) {
    return { stageMood: 'excited', valence: 0.68, arousal: 0.76 }
  }
  if (autonomy_level >= 0.58 && risk_tolerance >= 0.54) {
    return { stageMood: 'pleased', valence: 0.34, arousal: 0.44 }
  }
  if (risk_tolerance <= 0.28 && formality_score >= 0.68) {
    return { stageMood: 'fearful', valence: -0.38, arousal: 0.49 }
  }
  if (formality_score >= 0.62 || autonomy_level <= 0.35) {
    return { stageMood: 'tense', valence: -0.22, arousal: 0.57 }
  }

  return { stageMood: 'flat', valence: 0, arousal: 0.28 }
}

const buildMoodAssessment = (input: {
  state: PersonaState
  policy: PersonaPolicy
  slots: MemorySlotSnapshot
  signals: PersonaSignal[]
  nowIso: string
}): MoodAssessment => {
  const { state, policy, slots, signals, nowIso } = input
  const transientAmplitude = maxAbsDelta(state.transient_state)
  const sessionAmplitude = maxAbsDelta(state.session_hormones)
  const hasUserMood = Boolean(slots.user_mood.current_mood)
  const { stageMood, valence: baseValence, arousal: baseArousal } = inferStageMood(state, slots)

  const intensity = roundUnit(
    0.16 +
      transientAmplitude * 1.85 +
      sessionAmplitude * 0.9 +
      (hasUserMood ? 0.12 : 0) +
      (stageMood === 'flat' ? 0 : 0.06)
  )

  const confidence = roundUnit(
    0.5 +
      (hasUserMood ? 0.18 : 0) +
      (signals.length > 0 ? 0.08 : 0) +
      (slots.conversation_state.interaction_state ? 0.05 : 0) +
      (transientAmplitude >= 0.08 ? 0.04 : 0)
  )

  const valence = roundSigned(
    baseValence +
      (stageMood === 'pleased' ? intensity * 0.12 : 0) +
      (stageMood === 'excited' ? intensity * 0.18 : 0) -
      (stageMood === 'tense' ? intensity * 0.08 : 0) -
      (stageMood === 'frustrated' ? intensity * 0.14 : 0) -
      (stageMood === 'fearful' ? intensity * 0.12 : 0)
  )

  const arousal = roundUnit(baseArousal + intensity * 0.18)
  const horizon: MoodHorizon =
    hasUserMood || transientAmplitude >= sessionAmplitude ? 'transient' : 'session'

  const relationalCloseness = roundUnit(
    0.52 +
      valence * 0.18 +
      (policy.style.tone === 'casual' ? 0.12 : 0) -
      (policy.style.tone === 'formal' ? 0.08 : 0) -
      ((stageMood === 'tense' || stageMood === 'fearful') ? 0.08 : 0)
  )

  const expressiveWarmth = roundUnit(
    0.48 +
      valence * 0.28 +
      ((slots.user_mood.current_mood === 'frustrated' || slots.user_mood.current_mood === 'uncertain')
        ? 0.08
        : 0) -
      (policy.style.tone === 'formal' ? 0.06 : 0)
  )

  const containment = roundUnit(
    0.42 +
      state.metrics.formality_score * 0.34 +
      ((stageMood === 'tense' || stageMood === 'fearful' || stageMood === 'frustrated') ? 0.12 : 0) -
      (stageMood === 'excited' ? 0.1 : 0)
  )

  const imaginativeOpenness = roundUnit(
    0.28 +
      state.metrics.risk_tolerance * 0.48 +
      (stageMood === 'pleased' ? 0.05 : 0) +
      (stageMood === 'excited' ? 0.12 : 0) -
      (stageMood === 'fearful' ? 0.16 : 0) -
      (stageMood === 'tense' ? 0.08 : 0)
  )

  const clarificationNeed = roundUnit(
    0.24 +
      (1 - state.metrics.autonomy_level) * 0.48 +
      ((stageMood === 'tense' || stageMood === 'fearful') ? 0.14 : 0) +
      (stageMood === 'frustrated' ? 0.06 : 0)
  )

  return {
    generatedAt: nowIso,
    stageMood,
    intensity,
    confidence,
    valence,
    arousal,
    horizon,
    behavioralNarrative: state.current_behavioral_narrative,
    delta: {
      autonomy: roundSigned(state.transient_state.autonomy_level),
      verbosity: roundSigned(state.transient_state.verbosity_index),
      risk: roundSigned(state.transient_state.risk_tolerance),
      formality: roundSigned(state.transient_state.formality_score)
    },
    modulation: {
      relationalCloseness,
      expressiveWarmth,
      containment,
      imaginativeOpenness,
      clarificationNeed
    },
    sources: {
      userMood: slots.user_mood.current_mood,
      conversationMode: slots.conversation_state.conversation_mode,
      interactionState: slots.conversation_state.interaction_state,
      signals: signals.map((signal) => signal.user_signal)
    }
  }
}

const getObservationText = (observation: InteractionObservationSnapshot): string =>
  String(
    observation.payload.text ??
      observation.payload.message ??
      observation.payload.summary ??
      observation.summary ??
      ''
  ).trim()

const applyTaskObservationEffect = (
  state: PersonaState,
  observation: InteractionObservationSnapshot,
  config: PersonaConfig
): void => {
  const effect = config.taskObservationEffects.find((item) => item.type === observation.type)
  if (!effect) {
    return
  }

  for (const [key, amount] of Object.entries(effect.session ?? {})) {
    if (typeof amount === 'number') {
      addMetricDelta(state.session_hormones, key as SignalCategory, amount)
    }
  }
  for (const [key, amount] of Object.entries(effect.transient ?? {})) {
    if (typeof amount === 'number') {
      addMetricDelta(state.transient_state, key as SignalCategory, amount)
    }
  }
}

const applyMemoryFeedback = (
  state: PersonaState,
  slots: MemorySlotSnapshot,
  config: PersonaConfig
): void => {
  const stateUpdatedAtMs = Date.parse(state.last_updated || '')
  const moodUpdatedAtMs = Date.parse(slots.user_mood.updatedAt || '')

  if (
    Number.isFinite(moodUpdatedAtMs) &&
    (!Number.isFinite(stateUpdatedAtMs) || moodUpdatedAtMs > stateUpdatedAtMs) &&
    slots.user_mood.current_mood
  ) {
    const strength = config.memoryFeedback.moodStrength
    if (slots.user_mood.current_mood === 'impatient') {
      addMetricDelta(state.transient_state, 'verbosity', -strength)
      addMetricDelta(state.transient_state, 'autonomy', -strength * 0.5)
    } else if (slots.user_mood.current_mood === 'frustrated') {
      addMetricDelta(state.transient_state, 'risk', -strength)
      addMetricDelta(state.transient_state, 'verbosity', -strength * 0.4)
    } else if (slots.user_mood.current_mood === 'uncertain') {
      addMetricDelta(state.session_hormones, 'verbosity', strength * 0.5)
      addMetricDelta(state.session_hormones, 'autonomy', -strength * 0.4)
    } else if (slots.user_mood.current_mood === 'positive') {
      addMetricDelta(state.session_hormones, 'autonomy', strength * 0.4)
      addMetricDelta(state.session_hormones, 'risk', strength * 0.25)
    }
  }
}

const reconcilePersonaState = async (input: {
  state: PersonaState
  observations: InteractionObservationSnapshot[]
  slots: MemorySlotSnapshot
  config: PersonaConfig
}): Promise<{
  state: PersonaState
  appliedSignals: PersonaSignal[]
}> => {
  const next: PersonaState = {
    ...input.state,
    stable_preferences: cloneMetrics(input.state.stable_preferences || createNeutralPersonaMetrics()),
    session_hormones: decayDelta(
      input.state.session_hormones || createZeroPersonaDelta(),
      input.config.decay.sessionFactor
    ),
    transient_state: decayDelta(
      input.state.transient_state || createZeroPersonaDelta(),
      input.config.decay.transientFactor
    ),
    metrics: cloneMetrics(input.state.metrics || createNeutralPersonaMetrics()),
    recent_interaction_buffer: [...(input.state.recent_interaction_buffer ?? [])]
  }

  const appliedSignals: PersonaSignal[] = []
  let turn = next.evolution_turn || 0

  for (const observation of input.observations) {
    if (observation.type === 'user_message') {
      const text = getObservationText(observation)
      const signals = await inferSignals(text, next.metrics, input.config)
      for (const signal of signals) {
        addStableMetric(
          next.stable_preferences,
          signal.category,
          signal.delta * input.config.learningRates.stableFromSignal
        )
        addMetricDelta(
          next.session_hormones,
          signal.category,
          signal.delta * input.config.learningRates.sessionFromSignal
        )
        turn += 1
        next.recent_interaction_buffer.push({
          turn,
          user_signal: signal.user_signal,
          impact: signal.impact
        } satisfies PersonaBufferItem)
      }
      appliedSignals.push(...signals)
    } else if (observation.type === 'user_interrupt') {
      addMetricDelta(
        next.transient_state,
        'verbosity',
        -input.config.learningRates.transientFromInterrupt
      )
      addMetricDelta(
        next.transient_state,
        'autonomy',
        -input.config.learningRates.transientFromInterrupt * 0.5
      )
    } else if (observation.type === 'user_revert') {
      addMetricDelta(
        next.transient_state,
        'risk',
        -input.config.learningRates.transientFromRevert
      )
      addMetricDelta(
        next.transient_state,
        'verbosity',
        -input.config.learningRates.transientFromRevert * 0.5
      )
    } else {
      applyTaskObservationEffect(next, observation, input.config)
    }

    next.last_observation_id = observation.id
    next.metrics = synthesizeMetrics(
      next.stable_preferences,
      next.session_hormones,
      next.transient_state,
      input.config
    )
  }

  applyMemoryFeedback(next, input.slots, input.config)

  next.metrics = synthesizeMetrics(
    next.stable_preferences,
    next.session_hormones,
    next.transient_state,
    input.config
  )
  next.current_behavioral_narrative = buildBehavioralNarrative(next.metrics)
  next.recent_interaction_buffer = next.recent_interaction_buffer.slice(-20)
  next.evolution_turn = turn
  next.last_updated = new Date().toISOString()

  return {
    state: next,
    appliedSignals
  }
}

export async function personaNode(
  _state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const personaState = await loadPersonaState()
  if (!personaState) {
    return {}
  }

  const config = await personaConfigService.getConfig()
  const observations = await interactionObservationService.listSince(personaState.last_observation_id)
  const slots = await memorySlotService.reconcileFromObservations()
  const reconciled = await reconcilePersonaState({
    state: personaState,
    observations,
    slots,
    config
  })

  await savePersonaState(reconciled.state)

  const nowIso = new Date().toISOString()
  const policy = buildPolicy(reconciled.state.metrics, reconciled.appliedSignals, nowIso)
  const moodAssessment = buildMoodAssessment({
    state: reconciled.state,
    policy,
    slots,
    signals: reconciled.appliedSignals,
    nowIso
  })

  await memoryManager.applyAdaptiveConfig({
    archiveThreshold: policy.memory.archiveThreshold,
    shortTermLimit: policy.memory.shortTermLimit
  })

  const debugPayload = JSON.parse(
    JSON.stringify({
      stage: 'persona_reconciled',
      observationCount: observations.length,
      lastObservationId: reconciled.state.last_observation_id,
      metrics: reconciled.state.metrics,
      stablePreferences: reconciled.state.stable_preferences,
      sessionHormones: reconciled.state.session_hormones,
      transientState: reconciled.state.transient_state,
      slots: {
        userMood: slots.user_mood,
        conversationMode: slots.conversation_state.conversation_mode,
        interactionState: slots.conversation_state.interaction_state
      },
      moodAssessment
    })
  ) as Record<string, unknown>

  emitGraphThought('personaNode', debugPayload as any)

  return {
    personaPolicy: policy,
    moodAssessment
  }
}
