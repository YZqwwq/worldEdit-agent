import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type { InteractionObservationSnapshot } from '@share/cache/AItype/states/interactionObservation'
import type { MemorySlotSnapshot } from '@share/cache/AItype/states/memorySlots'
import type { PersonaState } from '@share/cache/AItype/states/personalState'
import type { MoodAssessment } from '@share/cache/AItype/states/moodAssessment'
import { contentToText } from '../../../messageoutput/transformRespones'
import { getQuickModel } from '../../modelwithtool/quick-base-model'
import { extractJsonObject } from './personaJsonUtils'
import { getObservationText } from './personaObservationUtils'
import type { PersonaSignal } from './personaTypes'
import { 默认情绪向量, normalizeEmotionVector, projectMoodLabels } from './characterMoodBoundary'
import { roundSigned, roundUnit } from './personaMath'

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

// 生成 AI 侧“当前阶段情绪”，供表达和策略调制使用；它不是用户情绪报告。
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

export const inferMoodAssessment = async (input: {
  moodPrompt: string
  observations: InteractionObservationSnapshot[]
  slots: MemorySlotSnapshot
  state: PersonaState
  signals: PersonaSignal[]
  previousMood?: MoodAssessment | null | undefined
  nowIso: string
}): Promise<MoodAssessment> => {
  try {
    return await inferMoodAssessmentWithModel(input)
  } catch {
    return buildFallbackMoodAssessment({
      nowIso: input.nowIso,
      slots: input.slots,
      signals: input.signals
    })
  }
}
