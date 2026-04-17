import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type { InteractionObservationSnapshot } from '@share/cache/AItype/states/interactionObservation'
import type { MemorySlotSnapshot } from '@share/cache/AItype/states/memorySlots'
import type { PersonaConfig, PersonaSignalCategory } from '@share/cache/AItype/states/personaConfig'
import type { CharacterMoodBoundary } from '@share/cache/AItype/states/characterMoodBoundary'
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
  MoodAssessment
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
import { loadMoodPrompt } from '../../../prompt/main_agent/agentPromptService'

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

const MOOD_STAGE_VALUES = ['flat', 'pleased', 'excited', 'tense', 'frustrated', 'fearful'] as const
const MOOD_HORIZON_VALUES = ['transient', 'session'] as const

const moodAssessmentResponseSchema = z.object({
  stageMood: z.enum(MOOD_STAGE_VALUES),
  intensity: z.number().finite().min(0).max(1),
  confidence: z.number().finite().min(0).max(1),
  valence: z.number().finite().min(-1).max(1),
  arousal: z.number().finite().min(0).max(1),
  horizon: z.enum(MOOD_HORIZON_VALUES),
  behavioralNarrative: z.string().trim().min(1).max(240),
  delta: z.object({
    autonomy: z.number().finite().min(-0.18).max(0.18),
    verbosity: z.number().finite().min(-0.18).max(0.18),
    risk: z.number().finite().min(-0.18).max(0.18),
    formality: z.number().finite().min(-0.18).max(0.18)
  }),
  modulation: z.object({
    relationalCloseness: z.number().finite().min(0).max(1),
    expressiveWarmth: z.number().finite().min(0).max(1),
    containment: z.number().finite().min(0).max(1),
    imaginativeOpenness: z.number().finite().min(0).max(1),
    clarificationNeed: z.number().finite().min(0).max(1)
  })
})

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

// 法弥拉的情绪硬边界：
// 这一层不负责“生成情绪”，只负责对原始 MoodAssessment 做人格边界裁剪，
// 防止情绪波动把法弥拉推成过热、过刺、失控或失去边界感的状态。
const FAMILA_CHARACTER_MOOD_BOUNDARY: CharacterMoodBoundary = {
  baseline: {
    // 自然静息态：默认回到平淡、稳定的基线
    restingStageMood: 'flat',
    // 正向主带宽：优先落在轻度愉悦，而不是高强度兴奋
    preferredPositiveBand: 'pleased',
    // 默认存在感：克制、稳定在场，而不是高热外放
    defaultPresence: 'restrained_stable'
  },
  stageCaps: {
    // 各阶段情绪的强度上下界
    flat: { min: 0.18, max: 0.62 },
    pleased: { min: 0.22, max: 0.64 },
    excited: { min: 0.24, max: 0.58 },
    tense: { min: 0.2, max: 0.56 },
    frustrated: { min: 0.18, max: 0.44 },
    fearful: { min: 0.16, max: 0.34 }
  },
  modulationBounds: {
    // 最终可见表达的调制边界
    // relationalCloseness: 关系亲近度
    relationalCloseness: { min: 0.42, max: 0.74 },
    // expressiveWarmth: 表达温度
    expressiveWarmth: { min: 0.4, max: 0.72 },
    // containment: 收束力 / 克制程度
    containment: { min: 0.58, max: 0.92 },
    // imaginativeOpenness: 想象开放度 / 发散程度
    imaginativeOpenness: { min: 0.3, max: 0.72 },
    // clarificationNeed: 澄清需求 / 确认边界倾向
    clarificationNeed: { min: 0.2, max: 0.82 }
  },
  deltaBounds: {
    // 情绪对四个行为参数的阶段性偏移边界
    // autonomy: 主动推进 vs 先确认
    autonomy: { min: -0.12, max: 0.1 },
    // verbosity: 简洁 vs 展开
    verbosity: { min: -0.1, max: 0.12 },
    // risk: 保守稳妥 vs 探索尝试
    risk: { min: -0.14, max: 0.08 },
    // formality: 自然随意 vs 正式克制
    formality: { min: -0.06, max: 0.1 }
  },
  hardRules: [
    'no_aggressive_projection', // 不允许负向状态投影成攻击性、刻薄、阴阳怪气
    'no_theatrical_overexpression', // 不允许正向状态滑向夸张、戏剧化、明显表演
    'no_overeager_intimacy', // 不允许因为短时信号迅速失去关系边界
    'retain_calm_containment_under_stress', // 在紧张、返工、受责备时仍保留平稳与收束
    'negative_mood_may_shorten_but_not_sharpen_response', // 负向状态可以更短、更收，但不能更刺
    'positive_mood_may_lighten_but_not_destabilize_tone' // 正向状态可以更松、更暖，但不能失稳
  ]
}

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

const buildObservationDigest = (observations: InteractionObservationSnapshot[]): string => {
  const recent = observations.slice(-6)
  if (!recent.length) return '(none)'

  return recent
    .map((observation) => {
      const text = getObservationText(observation).replace(/\s+/g, ' ').slice(0, 120) || '(no text)'
      return `- [${observation.type}] ${text}`
    })
    .join('\n')
}

const buildPreviousMoodDigest = (mood: MoodAssessment | null | undefined): string => {
  if (!mood) return '(none)'

  return JSON.stringify(
    {
      stageMood: mood.stageMood,
      intensity: mood.intensity,
      horizon: mood.horizon,
      behavioralNarrative: mood.behavioralNarrative
    },
    null,
    2
  )
}

const buildMoodInferencePrompt = (input: {
  moodPrompt: string
  observations: InteractionObservationSnapshot[]
  slots: MemorySlotSnapshot
  state: PersonaState
  signals: PersonaSignal[]
  previousMood?: MoodAssessment | null | undefined
}): string => {
  const observationDigest = buildObservationDigest(input.observations)
  const userState = JSON.stringify(
    {
      userMood: input.slots.user_mood.current_mood ?? null,
      conversationMode: input.slots.conversation_state.conversation_mode ?? null,
      interactionState: input.slots.conversation_state.interaction_state ?? null
    },
    null,
    2
  )
  const metricsDigest = JSON.stringify(input.state.metrics, null, 2)
  const transientDigest = JSON.stringify(input.state.transient_state, null, 2)
  const sessionDigest = JSON.stringify(input.state.session_hormones, null, 2)
  const signalDigest = input.signals.length
    ? input.signals.map((signal) => `- ${signal.user_signal}: ${signal.impact}`).join('\n')
    : '(none)'

  return `你是一个 MoodAssessment 编译器。

任务：
根据统一的 Mood 规则、近期 observation、用户侧 slot 状态、当前 persona metrics 与上一阶段 mood，
输出一份结构化的 AI 侧阶段情绪结果。

重要边界：
1. 你输出的是 AI 侧阶段状态，不是用户状态报告。
2. 你必须严格遵守 Mood 规则中的角色锚点与情绪边界。
3. delta 表示本轮阶段性偏移建议，只影响当前阶段选择与表达，不重写长期人格。
4. modulation 反映最终可见表达的内部调制方向。
5. 不要输出解释，不要输出 Markdown，只输出 JSON。

Mood rules:
${input.moodPrompt.trim() || '(empty)'}

Recent observations:
${observationDigest}

User-side state:
${userState}

Current persona metrics:
${metricsDigest}

Current transient_state:
${transientDigest}

Current session_hormones:
${sessionDigest}

Current behavioral narrative:
${input.state.current_behavioral_narrative || '(empty)'}

Applied persona signals:
${signalDigest}

Previous mood:
${buildPreviousMoodDigest(input.previousMood)}

输出 JSON 格式：
{
  "stageMood": "flat|pleased|excited|tense|frustrated|fearful",
  "intensity": 0.0,
  "confidence": 0.0,
  "valence": 0.0,
  "arousal": 0.0,
  "horizon": "transient|session",
  "behavioralNarrative": "不超过120字，描述这一阶段会如何影响当前表达与承接",
  "delta": {
    "autonomy": 0.0,
    "verbosity": 0.0,
    "risk": 0.0,
    "formality": 0.0
  },
  "modulation": {
    "relationalCloseness": 0.0,
    "expressiveWarmth": 0.0,
    "containment": 0.0,
    "imaginativeOpenness": 0.0,
    "clarificationNeed": 0.0
  }
}`
}

const normalizeMoodAssessment = (
  parsed: z.infer<typeof moodAssessmentResponseSchema>,
  input: {
    nowIso: string
    slots: MemorySlotSnapshot
    signals: PersonaSignal[]
  }
): MoodAssessment => ({
  generatedAt: input.nowIso,
  stageMood: parsed.stageMood,
  intensity: roundUnit(parsed.intensity),
  confidence: roundUnit(parsed.confidence),
  valence: roundSigned(parsed.valence),
  arousal: roundUnit(parsed.arousal),
  horizon: parsed.horizon,
  behavioralNarrative: parsed.behavioralNarrative.trim(),
  delta: {
    autonomy: roundSigned(parsed.delta.autonomy),
    verbosity: roundSigned(parsed.delta.verbosity),
    risk: roundSigned(parsed.delta.risk),
    formality: roundSigned(parsed.delta.formality)
  },
  modulation: {
    relationalCloseness: roundUnit(parsed.modulation.relationalCloseness),
    expressiveWarmth: roundUnit(parsed.modulation.expressiveWarmth),
    containment: roundUnit(parsed.modulation.containment),
    imaginativeOpenness: roundUnit(parsed.modulation.imaginativeOpenness),
    clarificationNeed: roundUnit(parsed.modulation.clarificationNeed)
  },
  sources: {
    userMood: input.slots.user_mood.current_mood,
    conversationMode: input.slots.conversation_state.conversation_mode,
    interactionState: input.slots.conversation_state.interaction_state,
    signals: input.signals.map((signal) => signal.user_signal)
  }
})

const clampWithRange = (value: number, range: { min: number; max: number }): number =>
  roundTo(clamp(value, range.min, range.max))

const applyCharacterMoodBoundary = (
  assessment: MoodAssessment,
  boundary: CharacterMoodBoundary,
  slots: MemorySlotSnapshot
): MoodAssessment => {
  const next: MoodAssessment = {
    ...assessment,
    intensity: clampWithRange(assessment.intensity, boundary.stageCaps[assessment.stageMood]),
    modulation: {
      relationalCloseness: clampWithRange(
        assessment.modulation.relationalCloseness,
        boundary.modulationBounds.relationalCloseness
      ),
      expressiveWarmth: clampWithRange(
        assessment.modulation.expressiveWarmth,
        boundary.modulationBounds.expressiveWarmth
      ),
      containment: clampWithRange(assessment.modulation.containment, boundary.modulationBounds.containment),
      imaginativeOpenness: clampWithRange(
        assessment.modulation.imaginativeOpenness,
        boundary.modulationBounds.imaginativeOpenness
      ),
      clarificationNeed: clampWithRange(
        assessment.modulation.clarificationNeed,
        boundary.modulationBounds.clarificationNeed
      )
    },
    delta: {
      autonomy: clampWithRange(assessment.delta.autonomy, boundary.deltaBounds.autonomy),
      verbosity: clampWithRange(assessment.delta.verbosity, boundary.deltaBounds.verbosity),
      risk: clampWithRange(assessment.delta.risk, boundary.deltaBounds.risk),
      formality: clampWithRange(assessment.delta.formality, boundary.deltaBounds.formality)
    }
  }

  if (next.stageMood === 'frustrated') {
    next.modulation.containment = Math.max(next.modulation.containment, 0.76)
    next.modulation.expressiveWarmth = Math.max(next.modulation.expressiveWarmth, 0.46)
    next.delta.autonomy = Math.min(next.delta.autonomy, 0)
    next.delta.verbosity = Math.min(next.delta.verbosity, 0)
    next.delta.risk = Math.min(next.delta.risk, 0)
    next.delta.formality = Math.max(next.delta.formality, 0.02)
  }

  if (next.stageMood === 'tense' || next.stageMood === 'fearful') {
    next.modulation.containment = Math.max(next.modulation.containment, 0.72)
    next.delta.risk = Math.min(next.delta.risk, 0)
    next.delta.formality = Math.max(next.delta.formality, 0)
  }

  if (next.stageMood === 'excited') {
    next.modulation.containment = Math.max(next.modulation.containment, 0.62)
    next.modulation.relationalCloseness = Math.min(next.modulation.relationalCloseness, 0.68)
    next.modulation.imaginativeOpenness = Math.min(next.modulation.imaginativeOpenness, 0.68)
    next.delta.autonomy = Math.min(next.delta.autonomy, 0.08)
    next.delta.verbosity = Math.min(next.delta.verbosity, 0.08)
    next.delta.risk = Math.min(next.delta.risk, 0.06)
  }

  if (next.stageMood === boundary.baseline.preferredPositiveBand) {
    next.modulation.containment = Math.max(next.modulation.containment, 0.64)
    next.modulation.relationalCloseness = Math.min(next.modulation.relationalCloseness, 0.7)
  }

  if (slots.conversation_state.interaction_state === 'teasing') {
    next.modulation.relationalCloseness = Math.min(next.modulation.relationalCloseness, 0.64)
    next.modulation.expressiveWarmth = Math.min(next.modulation.expressiveWarmth, 0.68)
  }

  next.delta = {
    autonomy: clampWithRange(next.delta.autonomy, boundary.deltaBounds.autonomy),
    verbosity: clampWithRange(next.delta.verbosity, boundary.deltaBounds.verbosity),
    risk: clampWithRange(next.delta.risk, boundary.deltaBounds.risk),
    formality: clampWithRange(next.delta.formality, boundary.deltaBounds.formality)
  }

  next.modulation = {
    relationalCloseness: clampWithRange(
      next.modulation.relationalCloseness,
      boundary.modulationBounds.relationalCloseness
    ),
    expressiveWarmth: clampWithRange(next.modulation.expressiveWarmth, boundary.modulationBounds.expressiveWarmth),
    containment: clampWithRange(next.modulation.containment, boundary.modulationBounds.containment),
    imaginativeOpenness: clampWithRange(
      next.modulation.imaginativeOpenness,
      boundary.modulationBounds.imaginativeOpenness
    ),
    clarificationNeed: clampWithRange(next.modulation.clarificationNeed, boundary.modulationBounds.clarificationNeed)
  }

  return next
}

const buildFallbackMoodAssessment = (input: {
  nowIso: string
  slots: MemorySlotSnapshot
  signals: PersonaSignal[]
}): MoodAssessment => ({
  generatedAt: input.nowIso,
  stageMood: 'flat',
  intensity: 0.18,
  confidence: 0.24,
  valence: 0,
  arousal: 0.28,
  horizon: 'transient',
  behavioralNarrative: '当前信息不足，保持平稳、克制、可信的在场方式。',
  delta: {
    autonomy: 0,
    verbosity: 0,
    risk: 0,
    formality: 0
  },
  modulation: {
    relationalCloseness: 0.56,
    expressiveWarmth: 0.52,
    containment: 0.72,
    imaginativeOpenness: 0.42,
    clarificationNeed: 0.34
  },
  sources: {
    userMood: input.slots.user_mood.current_mood,
    conversationMode: input.slots.conversation_state.conversation_mode,
    interactionState: input.slots.conversation_state.interaction_state,
    signals: input.signals.map((signal) => signal.user_signal)
  }
})

const inferMoodAssessmentWithModel = async (input: {
  moodPrompt: string
  observations: InteractionObservationSnapshot[]
  slots: MemorySlotSnapshot
  state: PersonaState
  signals: PersonaSignal[]
  previousMood?: MoodAssessment | null | undefined
  nowIso: string
}): Promise<MoodAssessment> => {
  const quickModel = await getQuickModel()
  const response = await quickModel.invoke(
    [
      new SystemMessage('你只负责返回合法 JSON。'),
      new HumanMessage(
        buildMoodInferencePrompt({
          moodPrompt: input.moodPrompt,
          observations: input.observations,
          slots: input.slots,
          state: input.state,
          signals: input.signals,
          previousMood: input.previousMood
        })
      )
    ],
    { signal: AbortSignal.timeout(12000) } as Record<string, unknown>
  )

  const text = contentToText(response.content).trim()
  const jsonText = extractJsonObject(text)
  if (!jsonText) {
    throw new Error('Mood model did not return valid JSON content')
  }

  const parsed = moodAssessmentResponseSchema.parse(JSON.parse(jsonText))
  return normalizeMoodAssessment(parsed, {
    nowIso: input.nowIso,
    slots: input.slots,
    signals: input.signals
  })
}

const inferMoodAssessment = async (input: {
  moodPrompt: string
  observations: InteractionObservationSnapshot[]
  slots: MemorySlotSnapshot
  state: PersonaState
  signals: PersonaSignal[]
  previousMood?: MoodAssessment | null | undefined
  nowIso: string
}): Promise<MoodAssessment> => {
  try {
    const moodAssessment = await inferMoodAssessmentWithModel(input)
    emitGraphThought(
      'personaNode',
      JSON.parse(
        JSON.stringify({
          stage: 'mood_assessment_inference',
          source: 'quick_model',
          moodAssessment
        })
      ) as any
    )
    return moodAssessment
  } catch (error) {
    const fallbackMoodAssessment = buildFallbackMoodAssessment({
      nowIso: input.nowIso,
      slots: input.slots,
      signals: input.signals
    })
    emitGraphThought(
      'personaNode',
      JSON.parse(
        JSON.stringify({
          stage: 'mood_assessment_inference',
          source: 'neutral_fallback',
          reason: toErrorMessage(error),
          moodAssessment: fallbackMoodAssessment
        })
      ) as any
    )
    return fallbackMoodAssessment
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

const applyMoodDeltaToMetrics = (
  metrics: PersonaMetrics,
  delta: MoodAssessment['delta']
): PersonaMetrics => ({
  autonomy_level: clamp01(roundTo(metrics.autonomy_level + delta.autonomy)),
  verbosity_index: clamp01(roundTo(metrics.verbosity_index + delta.verbosity)),
  risk_tolerance: clamp01(roundTo(metrics.risk_tolerance + delta.risk)),
  formality_score: clamp01(roundTo(metrics.formality_score + delta.formality))
})

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

const roundSigned = (value: number): number => roundTo(clamp(value, -1, 1))

const roundUnit = (value: number): number => roundTo(clamp(value, 0, 1))

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
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const personaState = await loadPersonaState()
  if (!personaState) {
    return {}
  }

  const config = await personaConfigService.getConfig()
  const moodPrompt = await loadMoodPrompt()
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
  const rawMoodAssessment = await inferMoodAssessment({
    moodPrompt,
    observations,
    previousMood: state.moodAssessment,
    state: reconciled.state,
    slots,
    signals: reconciled.appliedSignals,
    nowIso
  })
  const moodAssessment = applyCharacterMoodBoundary(
    rawMoodAssessment,
    FAMILA_CHARACTER_MOOD_BOUNDARY,
    slots
  )
  const effectiveMetrics = applyMoodDeltaToMetrics(reconciled.state.metrics, moodAssessment.delta)
  const policy = buildPolicy(effectiveMetrics, reconciled.appliedSignals, nowIso)

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
      effectiveMetrics,
      stablePreferences: reconciled.state.stable_preferences,
      sessionHormones: reconciled.state.session_hormones,
      transientState: reconciled.state.transient_state,
      characterMoodBoundary: FAMILA_CHARACTER_MOOD_BOUNDARY,
      slots: {
        userMood: slots.user_mood,
        conversationMode: slots.conversation_state.conversation_mode,
        interactionState: slots.conversation_state.interaction_state
      },
      rawMoodAssessment,
      moodAssessment
    })
  ) as Record<string, unknown>

  emitGraphThought('personaNode', debugPayload as any)

  return {
    personaPolicy: policy,
    moodAssessment
  }
}
