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
  PersonaPolicy
} from '@share/cache/AItype/states/personaPolicy'
import type {
  MoodAssessment,
  情绪向量,
  情绪标签
} from '@share/cache/AItype/states/moodAssessment'
import { contentToText } from '../../../messageoutput/transformRespones'
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
import {
  traceArtifact,
  traceDecision,
  traceState
} from '../../../../log/trace/agentTraceEmitter'
import { MessagesState } from '../../state/messageState'
import {
  loadExpressionPromptProfile,
  loadMoodPrompt,
  resolveExpressionPromptProfile
} from '../../../prompt/main_agent/agentPromptService'

type SignalCategory = PersonaSignalCategory

type PersonaSignal = {
  category: SignalCategory
  user_signal: string
  impact: string
  delta: number
}

const PERSONA_SIGNAL_CATEGORIES = ['自主性', '详略度', '探索性', '正式度'] as const

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

const moodAssessmentResponseSchema = z.object({
  情绪向量: z.object({
    愉悦度: z.number().finite().min(0).max(1),
    激活度: z.number().finite().min(0).max(1),
    紧张度: z.number().finite().min(0).max(1),
    受挫度: z.number().finite().min(0).max(1),
    亲近度: z.number().finite().min(0).max(1),
    专注度: z.number().finite().min(0).max(1)
  }),
  强度: z.number().finite().min(0).max(1),
  置信度: z.number().finite().min(0).max(1),
  行为叙事: z.string().trim().min(1).max(240),
  参数偏移: z.object({
    自主性: z.number().finite().min(-0.18).max(0.18),
    详略度: z.number().finite().min(-0.18).max(0.18),
    探索性: z.number().finite().min(-0.18).max(0.18),
    正式度: z.number().finite().min(-0.18).max(0.18)
  }),
  表达调制: z.object({
    关系靠近度: z.number().finite().min(0).max(1),
    表达温度: z.number().finite().min(0).max(1),
    收束度: z.number().finite().min(0).max(1),
    想象开放度: z.number().finite().min(0).max(1),
    澄清需求: z.number().finite().min(0).max(1)
  })
})

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

const 默认情绪向量: 情绪向量 = {
  愉悦度: 0.52,
  激活度: 0.36,
  紧张度: 0.22,
  受挫度: 0.18,
  亲近度: 0.52,
  专注度: 0.48
}

// 法弥拉的情绪硬边界：
// 这一层不负责“生成情绪”，只负责对原始 MoodAssessment 做人格边界裁剪，
// 防止情绪波动把法弥拉推成过热、过刺、失控或失去边界感的状态。
const FAMILA_CHARACTER_MOOD_BOUNDARY: CharacterMoodBoundary = {
  baseline: {
    静息主情绪: '平淡',
    偏好正向主带宽: '轻愉悦',
    默认存在感: '克制稳定',
    默认向量: 默认情绪向量
  },
  vectorBounds: {
    愉悦度: { min: 0.08, max: 0.88 },
    激活度: { min: 0.12, max: 0.82 },
    紧张度: { min: 0.06, max: 0.78 },
    受挫度: { min: 0.04, max: 0.76 },
    亲近度: { min: 0.36, max: 0.74 },
    专注度: { min: 0.28, max: 0.86 }
  },
  modulationBounds: {
    关系靠近度: { min: 0.42, max: 0.74 },
    表达温度: { min: 0.4, max: 0.72 },
    收束度: { min: 0.58, max: 0.92 },
    想象开放度: { min: 0.3, max: 0.72 },
    澄清需求: { min: 0.2, max: 0.82 }
  },
  deltaBounds: {
    自主性: { min: -0.12, max: 0.1 },
    详略度: { min: -0.1, max: 0.12 },
    探索性: { min: -0.14, max: 0.08 },
    正式度: { min: -0.06, max: 0.1 }
  },
  suppressedLabels: ['悲伤', '愤怒'],
  hardRules: [
    '不投射攻击性',
    '不滑向戏剧化表演',
    '不因为短时靠近而失去边界',
    '在压力下仍保持平静收束',
    '负向情绪可以收短但不能变刺',
    '正向情绪可以变松但不能失稳'
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
- 自主性：是否希望助手更主动还是更先确认
- 详略度：是否希望助手更详细还是更精简
- 探索性：是否希望助手更大胆探索还是更保守稳妥
- 正式度：是否希望助手更正式还是更自然随意

当前人格参数：
${JSON.stringify(metrics, null, 2)}

用户最新输入：
${userInput}

请只输出 JSON，不要输出解释，不要使用 Markdown 代码块。格式如下：
{
  "signals": [
    {
      "category": "详略度",
      "user_signal": "user_requests_more_detail",
      "delta": 0.08
    }
  ]
}

规则：
1. 只根据用户对助手行为风格的偏好来调参，不要因为任务主题本身就误判。
2. 没有明显偏好时返回 {"signals":[]}
3. 每个分类最多返回一条。
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
    return result.signals
  } catch (error) {
    const fallbackSignals = inferSignalsByRules(userInput, config)
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
      主情绪: mood.主情绪,
      副情绪: mood.副情绪 ?? null,
      强度: mood.强度,
      行为叙事: mood.行为叙事,
      情绪向量: mood.情绪向量
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

  return `你是一个情绪评估编译器。

任务：
根据统一的情绪规则、近期观测、用户侧短期状态、当前人格参数与上一轮情绪，
输出一份结构化的 AI 侧阶段情绪结果。

重要边界：
1. 你输出的是 AI 侧阶段状态，不是用户状态报告。
2. 你必须严格遵守情绪规则中的角色锚点与情绪边界。
3. 参数偏移表示本轮阶段性偏移建议，只影响当前阶段选择与表达，不重写长期人格。
4. 表达调制反映最终可见表达的内部调制方向。
5. 不要输出解释，不要输出 Markdown，只输出 JSON。

情绪规则：
${input.moodPrompt.trim() || '(empty)'}

近期观测：
${observationDigest}

用户侧状态：
${userState}

当前人格参数：
${metricsDigest}

当前 transient_state：
${transientDigest}

当前 session_hormones：
${sessionDigest}

已应用的人格信号：
${signalDigest}

上一轮情绪：
${buildPreviousMoodDigest(input.previousMood)}

输出 JSON 格式：
{
  "情绪向量": {
    "愉悦度": 0.0,
    "激活度": 0.0,
    "紧张度": 0.0,
    "受挫度": 0.0,
    "亲近度": 0.0,
    "专注度": 0.0
  },
  "强度": 0.0,
  "置信度": 0.0,
  "行为叙事": "不超过120字，描述这一阶段会如何影响当前表达与承接",
  "参数偏移": {
    "自主性": 0.0,
    "详略度": 0.0,
    "探索性": 0.0,
    "正式度": 0.0
  },
  "表达调制": {
    "关系靠近度": 0.0,
    "表达温度": 0.0,
    "收束度": 0.0,
    "想象开放度": 0.0,
    "澄清需求": 0.0
  }
}`
}

const normalizeEmotionVector = (vector: 情绪向量): 情绪向量 => ({
  愉悦度: roundUnit(vector.愉悦度),
  激活度: roundUnit(vector.激活度),
  紧张度: roundUnit(vector.紧张度),
  受挫度: roundUnit(vector.受挫度),
  亲近度: roundUnit(vector.亲近度),
  专注度: roundUnit(vector.专注度)
})

const downgradeSuppressedLabel = (label: 情绪标签): 情绪标签 => {
  if (label === '愤怒') return '受挫'
  if (label === '悲伤') return '轻度伤感'
  return label
}

const projectMoodLabels = (
  vector: 情绪向量,
  boundary?: CharacterMoodBoundary
): Pick<MoodAssessment, '主情绪' | '副情绪'> => {
  const next = normalizeEmotionVector(vector)
  let 主情绪: 情绪标签 = '平淡'

  if (next.受挫度 >= 0.72 && next.激活度 >= 0.58 && next.愉悦度 <= 0.24) {
    主情绪 = '愤怒'
  } else if (next.紧张度 >= 0.72 && next.激活度 >= 0.58) {
    主情绪 = '焦虑'
  } else if (next.受挫度 >= 0.66 && next.愉悦度 <= 0.28) {
    主情绪 = '受挫'
  } else if (next.愉悦度 <= 0.18 && next.受挫度 >= 0.58 && next.激活度 <= 0.34) {
    主情绪 = '悲伤'
  } else if (next.愉悦度 <= 0.32 && next.受挫度 >= 0.44 && next.激活度 <= 0.46) {
    主情绪 = '轻度伤感'
  } else if (next.紧张度 >= 0.58) {
    主情绪 = '紧张'
  } else if (
    next.激活度 >= 0.82 &&
    Math.abs(next.愉悦度 - 0.5) <= 0.18 &&
    next.紧张度 < 0.55 &&
    next.受挫度 < 0.48
  ) {
    主情绪 = '惊讶'
  } else if (next.愉悦度 >= 0.78 && next.激活度 >= 0.72) {
    主情绪 = '兴奋'
  } else if (next.愉悦度 >= 0.7 && next.激活度 >= 0.58) {
    主情绪 = '轻兴奋'
  } else if (next.愉悦度 >= 0.68) {
    主情绪 = '高兴'
  } else if (next.愉悦度 >= 0.56) {
    主情绪 = '轻愉悦'
  }

  if (boundary?.suppressedLabels.includes(主情绪)) {
    主情绪 = downgradeSuppressedLabel(主情绪)
  }

  const 候选副情绪: 情绪标签[] = []
  if ((主情绪 === '兴奋' || 主情绪 === '轻兴奋') && next.愉悦度 >= 0.68) {
    候选副情绪.push('高兴')
  }
  if ((主情绪 === '焦虑' || 主情绪 === '紧张') && next.受挫度 >= 0.52) {
    候选副情绪.push('受挫')
  }
  if ((主情绪 === '受挫' || 主情绪 === '愤怒') && next.紧张度 >= 0.56) {
    候选副情绪.push('紧张')
  }
  if ((主情绪 === '受挫' || 主情绪 === '轻度伤感') && next.愉悦度 <= 0.28 && next.激活度 <= 0.44) {
    候选副情绪.push('轻度伤感')
  }
  if ((主情绪 === '高兴' || 主情绪 === '轻愉悦') && next.激活度 >= 0.58) {
    候选副情绪.push('轻兴奋')
  }
  if (主情绪 === '平淡' && next.愉悦度 >= 0.58) {
    候选副情绪.push('轻愉悦')
  }
  if (主情绪 === '平淡' && next.专注度 >= 0.7 && next.紧张度 >= 0.5) {
    候选副情绪.push('紧张')
  }
  if (主情绪 === '惊讶' && next.愉悦度 >= 0.62) {
    候选副情绪.push('高兴')
  }

  const 副情绪 = 候选副情绪.find((item) => {
    const label = boundary?.suppressedLabels.includes(item) ? downgradeSuppressedLabel(item) : item
    return label !== 主情绪
  })

  return {
    主情绪,
    副情绪: 副情绪
      ? boundary?.suppressedLabels.includes(副情绪)
        ? downgradeSuppressedLabel(副情绪)
        : 副情绪
      : undefined
  }
}

const normalizeMoodAssessment = (
  parsed: z.infer<typeof moodAssessmentResponseSchema>,
  input: {
    nowIso: string
    slots: MemorySlotSnapshot
    signals: PersonaSignal[]
  }
): MoodAssessment => {
  const 情绪向量 = normalizeEmotionVector(parsed.情绪向量)
  const { 主情绪, 副情绪 } = projectMoodLabels(情绪向量)

  return {
    生成时间: input.nowIso,
    主情绪,
    副情绪,
    情绪向量,
    强度: roundUnit(parsed.强度),
    置信度: roundUnit(parsed.置信度),
    行为叙事: parsed.行为叙事.trim(),
    参数偏移: {
      自主性: roundSigned(parsed.参数偏移.自主性),
      详略度: roundSigned(parsed.参数偏移.详略度),
      探索性: roundSigned(parsed.参数偏移.探索性),
      正式度: roundSigned(parsed.参数偏移.正式度)
    },
    表达调制: {
      关系靠近度: roundUnit(parsed.表达调制.关系靠近度),
      表达温度: roundUnit(parsed.表达调制.表达温度),
      收束度: roundUnit(parsed.表达调制.收束度),
      想象开放度: roundUnit(parsed.表达调制.想象开放度),
      澄清需求: roundUnit(parsed.表达调制.澄清需求)
    },
    来源: {
      用户情绪: input.slots.user_mood.current_mood,
      对话模式: input.slots.conversation_state.conversation_mode,
      交互状态: input.slots.conversation_state.interaction_state,
      信号: input.signals.map((signal) => signal.user_signal)
    }
  }
}

const clampWithRange = (value: number, range: { min: number; max: number }): number =>
  roundTo(clamp(value, range.min, range.max))

const applyCharacterMoodBoundary = (
  assessment: MoodAssessment,
  boundary: CharacterMoodBoundary,
  slots: MemorySlotSnapshot
): MoodAssessment => {
  const next: MoodAssessment = {
    ...assessment,
    情绪向量: {
      愉悦度: clampWithRange(assessment.情绪向量.愉悦度, boundary.vectorBounds.愉悦度),
      激活度: clampWithRange(assessment.情绪向量.激活度, boundary.vectorBounds.激活度),
      紧张度: clampWithRange(assessment.情绪向量.紧张度, boundary.vectorBounds.紧张度),
      受挫度: clampWithRange(assessment.情绪向量.受挫度, boundary.vectorBounds.受挫度),
      亲近度: clampWithRange(assessment.情绪向量.亲近度, boundary.vectorBounds.亲近度),
      专注度: clampWithRange(assessment.情绪向量.专注度, boundary.vectorBounds.专注度)
    },
    表达调制: {
      关系靠近度: clampWithRange(assessment.表达调制.关系靠近度, boundary.modulationBounds.关系靠近度),
      表达温度: clampWithRange(assessment.表达调制.表达温度, boundary.modulationBounds.表达温度),
      收束度: clampWithRange(assessment.表达调制.收束度, boundary.modulationBounds.收束度),
      想象开放度: clampWithRange(assessment.表达调制.想象开放度, boundary.modulationBounds.想象开放度),
      澄清需求: clampWithRange(assessment.表达调制.澄清需求, boundary.modulationBounds.澄清需求)
    },
    参数偏移: {
      自主性: clampWithRange(assessment.参数偏移.自主性, boundary.deltaBounds.自主性),
      详略度: clampWithRange(assessment.参数偏移.详略度, boundary.deltaBounds.详略度),
      探索性: clampWithRange(assessment.参数偏移.探索性, boundary.deltaBounds.探索性),
      正式度: clampWithRange(assessment.参数偏移.正式度, boundary.deltaBounds.正式度)
    }
  }

  let { 主情绪, 副情绪 } = projectMoodLabels(next.情绪向量, boundary)

  if (主情绪 === '受挫' || 主情绪 === '轻度伤感') {
    next.表达调制.收束度 = Math.max(next.表达调制.收束度, 0.76)
    next.表达调制.表达温度 = Math.max(next.表达调制.表达温度, 0.46)
    next.参数偏移.自主性 = Math.min(next.参数偏移.自主性, 0)
    next.参数偏移.详略度 = Math.min(next.参数偏移.详略度, 0)
    next.参数偏移.探索性 = Math.min(next.参数偏移.探索性, 0)
    next.参数偏移.正式度 = Math.max(next.参数偏移.正式度, 0.02)
  }

  if (主情绪 === '紧张' || 主情绪 === '焦虑') {
    next.表达调制.收束度 = Math.max(next.表达调制.收束度, 0.72)
    next.参数偏移.探索性 = Math.min(next.参数偏移.探索性, 0)
    next.参数偏移.正式度 = Math.max(next.参数偏移.正式度, 0)
  }

  if (主情绪 === '轻兴奋' || 主情绪 === '兴奋') {
    next.表达调制.收束度 = Math.max(next.表达调制.收束度, 0.62)
    next.表达调制.关系靠近度 = Math.min(next.表达调制.关系靠近度, 0.68)
    next.表达调制.想象开放度 = Math.min(next.表达调制.想象开放度, 0.68)
    next.参数偏移.自主性 = Math.min(next.参数偏移.自主性, 0.08)
    next.参数偏移.详略度 = Math.min(next.参数偏移.详略度, 0.08)
    next.参数偏移.探索性 = Math.min(next.参数偏移.探索性, 0.06)
  }

  if (主情绪 === boundary.baseline.偏好正向主带宽 || 主情绪 === '高兴') {
    next.表达调制.收束度 = Math.max(next.表达调制.收束度, 0.64)
    next.表达调制.关系靠近度 = Math.min(next.表达调制.关系靠近度, 0.7)
  }

  if (slots.conversation_state.interaction_state === 'teasing') {
    next.表达调制.关系靠近度 = Math.min(next.表达调制.关系靠近度, 0.64)
    next.表达调制.表达温度 = Math.min(next.表达调制.表达温度, 0.68)
  }

  next.参数偏移 = {
    自主性: clampWithRange(next.参数偏移.自主性, boundary.deltaBounds.自主性),
    详略度: clampWithRange(next.参数偏移.详略度, boundary.deltaBounds.详略度),
    探索性: clampWithRange(next.参数偏移.探索性, boundary.deltaBounds.探索性),
    正式度: clampWithRange(next.参数偏移.正式度, boundary.deltaBounds.正式度)
  }

  next.表达调制 = {
    关系靠近度: clampWithRange(next.表达调制.关系靠近度, boundary.modulationBounds.关系靠近度),
    表达温度: clampWithRange(next.表达调制.表达温度, boundary.modulationBounds.表达温度),
    收束度: clampWithRange(next.表达调制.收束度, boundary.modulationBounds.收束度),
    想象开放度: clampWithRange(next.表达调制.想象开放度, boundary.modulationBounds.想象开放度),
    澄清需求: clampWithRange(next.表达调制.澄清需求, boundary.modulationBounds.澄清需求)
  }

  ;({ 主情绪, 副情绪 } = projectMoodLabels(next.情绪向量, boundary))
  next.主情绪 = 主情绪
  next.副情绪 = 副情绪

  return next
}

const buildFallbackMoodAssessment = (input: {
  nowIso: string
  slots: MemorySlotSnapshot
  signals: PersonaSignal[]
}): MoodAssessment => ({
  生成时间: input.nowIso,
  主情绪: '平淡',
  副情绪: '轻愉悦',
  情绪向量: { ...默认情绪向量 },
  强度: 0.18,
  置信度: 0.24,
  行为叙事: '当前信息不足，保持平淡、克制、可信的在场方式。',
  参数偏移: {
    自主性: 0,
    详略度: 0,
    探索性: 0,
    正式度: 0
  },
  表达调制: {
    关系靠近度: 0.56,
    表达温度: 0.52,
    收束度: 0.72,
    想象开放度: 0.42,
    澄清需求: 0.34
  },
  来源: {
    用户情绪: input.slots.user_mood.current_mood,
    对话模式: input.slots.conversation_state.conversation_mode,
    交互状态: input.slots.conversation_state.interaction_state,
    信号: input.signals.map((signal) => signal.user_signal)
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
    return moodAssessment
  } catch (error) {
    const fallbackMoodAssessment = buildFallbackMoodAssessment({
      nowIso: input.nowIso,
      slots: input.slots,
      signals: input.signals
    })
    return fallbackMoodAssessment
  }
}

const addMetricDelta = (
  delta: PersonaMetricDelta,
  category: SignalCategory,
  amount: number
): PersonaMetricDelta => {
  if (category === '自主性') {
    delta.autonomy_level = clamp(roundTo(delta.autonomy_level + amount), -1, 1)
  } else if (category === '详略度') {
    delta.verbosity_index = clamp(roundTo(delta.verbosity_index + amount), -1, 1)
  } else if (category === '探索性') {
    delta.risk_tolerance = clamp(roundTo(delta.risk_tolerance + amount), -1, 1)
  } else if (category === '正式度') {
    delta.formality_score = clamp(roundTo(delta.formality_score + amount), -1, 1)
  }
  return delta
}

const addStableMetric = (
  metrics: PersonaMetrics,
  category: SignalCategory,
  amount: number
): PersonaMetrics => {
  if (category === '自主性') {
    metrics.autonomy_level = clamp01(roundTo(metrics.autonomy_level + amount))
  } else if (category === '详略度') {
    metrics.verbosity_index = clamp01(roundTo(metrics.verbosity_index + amount))
  } else if (category === '探索性') {
    metrics.risk_tolerance = clamp01(roundTo(metrics.risk_tolerance + amount))
  } else if (category === '正式度') {
    metrics.formality_score = clamp01(roundTo(metrics.formality_score + amount))
  }
  return metrics
}

const applyMoodDeltaToMetrics = (
  metrics: PersonaMetrics,
  delta: MoodAssessment['参数偏移']
): PersonaMetrics => ({
  autonomy_level: clamp01(roundTo(metrics.autonomy_level + delta.自主性)),
  verbosity_index: clamp01(roundTo(metrics.verbosity_index + delta.详略度)),
  risk_tolerance: clamp01(roundTo(metrics.risk_tolerance + delta.探索性)),
  formality_score: clamp01(roundTo(metrics.formality_score + delta.正式度))
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
    memory: {
      archiveThreshold: Math.round(clamp(8 - metrics.verbosity_index * 4, 4, 8)),
      shortTermLimit: 4
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
        '详略度',
        -input.config.learningRates.transientFromInterrupt
      )
      addMetricDelta(
        next.transient_state,
        '自主性',
        -input.config.learningRates.transientFromInterrupt * 0.5
      )
    } else if (observation.type === 'user_revert') {
      addMetricDelta(
        next.transient_state,
        '探索性',
        -input.config.learningRates.transientFromRevert
      )
      addMetricDelta(
        next.transient_state,
        '详略度',
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

  next.metrics = synthesizeMetrics(
    next.stable_preferences,
    next.session_hormones,
    next.transient_state,
    input.config
  )
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
  const expressionProfileDefinition = resolveExpressionPromptProfile(slots)
  const expressionProfile = await loadExpressionPromptProfile(expressionProfileDefinition.id)
  traceState('personaNode', {
    title: '输入快照: personaNode',
    summary: `观测 ${observations.length} 条，slot 模式=${slots.conversation_state.conversation_mode || 'none'}，用户情绪=${slots.user_mood.current_mood || 'none'}`,
    data: {
      personaState,
      config,
      moodPrompt,
      expressionProfile,
      previousMood: state.moodAssessment ?? null,
      observations,
      slots
    }
  })
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
  const effectiveMetrics = applyMoodDeltaToMetrics(reconciled.state.metrics, moodAssessment.参数偏移)
  const policy = buildPolicy(effectiveMetrics, reconciled.appliedSignals, nowIso)

  traceDecision('personaNode', {
    title: '人格状态: personaNode',
    summary:
      `信号=${reconciled.appliedSignals.length}` +
      `，主情绪=${moodAssessment.主情绪}` +
      (moodAssessment.副情绪 ? `/${moodAssessment.副情绪}` : '') +
      `，强度=${moodAssessment.强度.toFixed(2)}`,
    data: {
      signalLabels: reconciled.appliedSignals.map((signal) => signal.user_signal),
      情绪状态: {
        主情绪: moodAssessment.主情绪,
        副情绪: moodAssessment.副情绪,
        强度: moodAssessment.强度,
        行为叙事: moodAssessment.行为叙事,
        情绪向量: moodAssessment.情绪向量
      }
    }
  })

  await memoryManager.applyAdaptiveConfig({
    archiveThreshold: policy.memory.archiveThreshold,
    shortTermLimit: policy.memory.shortTermLimit
  })

  traceArtifact('personaNode', {
    title: '行为倾向: personaNode',
    summary:
      `表达方案=${expressionProfile.id}` +
      `，温度=${policy.sampling.temperature.toFixed(2)}`,
    data: {
      effectiveMetrics,
      expressionProfile: {
        id: expressionProfile.id,
        title: expressionProfile.title,
        summary: expressionProfile.summary
      },
      sampling: policy.sampling,
      memory: policy.memory
    }
  })

  return {
    personaPolicy: policy,
    moodAssessment,
    expressionProfile
  }
}
