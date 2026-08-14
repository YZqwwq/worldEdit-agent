import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type { InteractionObservationSnapshot } from '@share/cache/AItype/states/interactionObservation'
import type { MemorySlotSnapshot } from '@share/cache/AItype/states/memorySlots'
import type { PersonaState } from '@share/cache/AItype/states/personalState'
import type { MoodAssessment } from '@share/cache/AItype/states/moodAssessment'
import type { PersonaScenePolicy } from '@share/cache/AItype/states/personaPolicy'
import { contentToText } from '../../../messageoutput/transformRespones'
import { getQuickModel } from '../../modelwithtool/quick-base-model'
import { extractJsonObject } from './personaJsonUtils'
import { getObservationText } from './personaObservationUtils'
import type { PersonaSignal } from './personaTypes'
import { 默认情绪向量 } from './characterMoodBoundary'
import { compileMoodAssessment } from './moodStateCompiler'
import type { RecentDialogueMessage } from '../instantperceptionnode/instantPerceptionContext'

const moodAssessmentResponseSchema = z.object({
  情绪向量: z.object({
    愉悦度: z.number().finite().min(0).max(1),
    激活度: z.number().finite().min(0).max(1),
    紧张度: z.number().finite().min(0).max(1),
    受挫度: z.number().finite().min(0).max(1),
    亲近度: z.number().finite().min(0).max(1),
    专注度: z.number().finite().min(0).max(1)
  }),
  置信度: z.number().finite().min(0).max(1),
  行为叙事: z.string().trim().min(1).max(240)
})

const buildObservationDigest = (observations: InteractionObservationSnapshot[]): string => {
  // user_message 已包含在 recentDialogue；这里仅保留中断、回退和任务结果等新增事件，
  // 避免同一段用户文本以 observation 与 dialogue 两种形式重复影响情绪判断。
  const recent = observations.filter((observation) => observation.type !== 'user_message').slice(-6)
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

const buildSceneCharacterDigest = (scene: PersonaScenePolicy | null | undefined): string => {
  if (!scene) return '(none)'
  return [
    `场景：${scene.label} (${scene.id})`,
    ...scene.cognitiveDirections.map((direction) => `- 认知姿态：${direction}`),
    ...scene.actionDirections.map((direction) => `- 行动姿态：${direction}`)
  ].join('\n')
}

// 生成 AI 侧“当前阶段情绪”，供表达和策略调制使用；它不是用户情绪报告。
const buildMoodInferencePrompt = (input: {
  moodPrompt: string
  observations: InteractionObservationSnapshot[]
  recentDialogue: RecentDialogueMessage[]
  slots: MemorySlotSnapshot
  state: PersonaState
  signals: PersonaSignal[]
  scene?: PersonaScenePolicy
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

  return `你是一个情绪评估编译器。

任务：
根据统一的情绪规则、本轮新增事件、最近对话、用户侧短期状态、当前有效人格与上一轮情绪，
识别一份紧凑的 AI 侧情绪目标状态。

重要边界：
1. 你输出的是 AI 侧阶段状态，不是用户状态报告。
2. 你必须严格遵守情绪规则中的角色锚点与情绪边界。
3. 只识别核心情绪向量、判断置信度和情境叙事；不要生成行为参数或表达参数。
4. 置信度表示你对本轮出现这种情绪变化的把握，而不是情绪强度。
5. 行为叙事描述这种状态在当前场景中的自然含义，不列数值，不复述用户情绪。
6. 不要输出解释，不要输出 Markdown，只输出 JSON。

情绪规则：
${input.moodPrompt.trim() || '(empty)'}

本轮新增非对话事件：
${observationDigest}

最近对话背景：
${input.recentDialogue.length > 0 ? JSON.stringify(input.recentDialogue, null, 2) : '(none)'}

最近对话只用于理解本轮互动、指代和情绪变化，不表示这些旧消息产生了新的观测或人格信号。

用户侧状态：
${userState}

当前有效人格参数（稳定、会话与瞬时层已经合成）：
${metricsDigest}

当前场景人格姿态：
${buildSceneCharacterDigest(input.scene)}

场景人格只用于理解同一种情绪在当前工作状态中的自然表现，不能把场景规则误判成已经发生的情绪。

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
  "置信度": 0.0,
  "行为叙事": "不超过120字，描述这一状态在当前场景中意味着什么"
}`
}

const buildFallbackMoodAssessment = (input: {
  nowIso: string
  slots: MemorySlotSnapshot
  signals: PersonaSignal[]
  scene?: PersonaScenePolicy
  previousMood?: MoodAssessment | null | undefined
}): MoodAssessment =>
  compileMoodAssessment({
    inferred: {
      情绪向量: { ...默认情绪向量 },
      置信度: 0,
      行为叙事: '当前信息不足，保持平淡、克制、可信的在场方式。'
    },
    previousMood: input.previousMood,
    nowIso: input.nowIso,
    source: {
      用户情绪: input.slots.user_mood.current_mood,
      对话模式: input.slots.conversation_state.conversation_mode,
      交互状态: input.slots.conversation_state.interaction_state,
      信号: input.signals.map((signal) => signal.user_signal)
    }
  })

const inferMoodAssessmentWithModel = async (input: {
  moodPrompt: string
  observations: InteractionObservationSnapshot[]
  recentDialogue: RecentDialogueMessage[]
  slots: MemorySlotSnapshot
  state: PersonaState
  signals: PersonaSignal[]
  scene?: PersonaScenePolicy
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
          recentDialogue: input.recentDialogue,
          slots: input.slots,
          state: input.state,
          signals: input.signals,
          scene: input.scene,
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
  return compileMoodAssessment({
    inferred: parsed,
    previousMood: input.previousMood,
    nowIso: input.nowIso,
    source: {
      用户情绪: input.slots.user_mood.current_mood,
      对话模式: input.slots.conversation_state.conversation_mode,
      交互状态: input.slots.conversation_state.interaction_state,
      信号: input.signals.map((signal) => signal.user_signal)
    }
  })
}

export const inferMoodAssessment = async (input: {
  moodPrompt: string
  observations: InteractionObservationSnapshot[]
  recentDialogue: RecentDialogueMessage[]
  slots: MemorySlotSnapshot
  state: PersonaState
  signals: PersonaSignal[]
  scene?: PersonaScenePolicy
  previousMood?: MoodAssessment | null | undefined
  nowIso: string
}): Promise<MoodAssessment> => {
  try {
    return await inferMoodAssessmentWithModel(input)
  } catch {
    return buildFallbackMoodAssessment({
      nowIso: input.nowIso,
      slots: input.slots,
      signals: input.signals,
      previousMood: input.previousMood
    })
  }
}
