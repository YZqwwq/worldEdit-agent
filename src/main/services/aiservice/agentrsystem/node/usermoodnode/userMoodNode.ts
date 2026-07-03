import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type { UserMoodState } from '@share/cache/AItype/states/memorySlots'
import { contentToText } from '../../../messageoutput/transformRespones'
import { traceArtifact, traceDecision, traceError } from '../../../../log/trace/agentTraceEmitter'
import { memorySlotService } from '../../manager/memory/memorySlotService'
import { getQuickModel } from '../../modelwithtool/quick-base-model'
import { MessagesState } from '../../state/messageState'

const USER_MOOD_STATES = ['calm', 'positive', 'impatient', 'frustrated', 'uncertain'] as const

const userMoodResponseSchema = z.object({
  mood: z.enum(USER_MOOD_STATES).optional(),
  valence: z.number().finite().min(-1).max(1),
  confidence: z.number().finite().min(0).max(1),
  reason: z.string().trim().min(1).max(240)
})

type RecentMessagePreview = {
  role: 'user' | 'assistant'
  text: string
}

const compact = (value: string, max = 420): string => {
  const normalized = String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

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

const getCurrentUserText = (state: typeof MessagesState.State): string => {
  const message = state.messages
    .slice()
    .reverse()
    .find((item) => item instanceof HumanMessage && !item.additional_kwargs?.isHistory)
  return message ? contentToText(message.content).trim() : ''
}

const buildRecentMessagePreview = (
  state: typeof MessagesState.State,
  limit = 6
): RecentMessagePreview[] =>
  state.messages
    .filter((message) => message instanceof HumanMessage || message instanceof AIMessage)
    .filter((message) => !message.additional_kwargs?.isHistory)
    .slice(-limit)
    .map(
      (message): RecentMessagePreview => ({
        role: message instanceof HumanMessage ? 'user' : 'assistant',
        text: compact(contentToText(message.content))
      })
    )
    .filter((item) => item.text.length > 0)

const buildUserMoodPrompt = (input: {
  currentUserText: string
  recentMessages: RecentMessagePreview[]
}): string => `你是“用户短期情绪感知器”，不是聊天助手。你只判断用户当前这一轮的短期情绪状态。

目标：
根据用户最新输入和最近对话，判断用户当前更接近以下哪种短期状态：
- calm: 平静、普通表达、没有明显情绪压力
- positive: 愉快、满意、认可、轻松积极
- impatient: 急切、不耐烦、催促、被打断感
- frustrated: 受挫、烦躁、失望、压力明显
- uncertain: 犹豫、不确定、困惑、拿不准

重要边界：
1. 不要因为用户讨论负面题材就判断用户本人负面。
2. 不要用关键词机械匹配，要判断用户表达中的情绪主体是不是用户自己。
3. 如果情绪不明显，mood 返回 calm，confidence 不要过高。
4. valence 表示用户短期情绪效价，范围 -1 到 1。
5. 只输出 JSON，不要 Markdown，不要解释。

用户最新输入：
${input.currentUserText || '(empty)'}

最近对话预览：
${JSON.stringify(input.recentMessages, null, 2)}

输出格式：
{
  "mood": "calm | positive | impatient | frustrated | uncertain",
  "valence": 0.0,
  "confidence": 0.0,
  "reason": "一句简短理由"
}`

const fallbackUserMood = (
  reason: string
): {
  mood?: UserMoodState
  valence: number
  confidence: number
  reason: string
} => ({
  mood: undefined,
  valence: 0,
  confidence: 0,
  reason
})

export async function userMoodNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const currentUserText = getCurrentUserText(state)

  try {
    const quickModel = await getQuickModel()
    const response = await quickModel.invoke(
      [
        new SystemMessage('你只负责返回合法 JSON。'),
        new HumanMessage(
          buildUserMoodPrompt({
            currentUserText,
            recentMessages: buildRecentMessagePreview(state)
          })
        )
      ],
      { signal: AbortSignal.timeout(8000) } as Record<string, unknown>
    )

    const text = contentToText(response.content).trim()
    const jsonText = extractJsonObject(text)
    if (!jsonText) {
      throw new Error('User mood model did not return valid JSON content')
    }

    const parsed = userMoodResponseSchema.parse(JSON.parse(jsonText))
    const mood =
      parsed.confidence >= 0.45
        ? {
            current_mood: parsed.mood ?? 'calm',
            valence: parsed.valence,
            confidence: parsed.confidence,
            updatedAt: new Date().toISOString()
          }
        : {
            confidence: 0,
            updatedAt: new Date().toISOString()
          }

    await memorySlotService.updateUserMood(mood)

    traceDecision('userMoodNode', {
      title: '决策: userMoodNode 用户情绪感知完成',
      summary: `${mood.current_mood ?? 'none'}，confidence=${mood.confidence.toFixed(2)}`,
      data: {
        parsed,
        persistedUserMood: mood
      }
    })

    traceArtifact('userMoodNode', {
      title: '产物: userMoodNode 用户情绪状态',
      summary: parsed.reason
    })

    return {}
  } catch (error) {
    const fallback = fallbackUserMood(error instanceof Error ? error.message : String(error))
    await memorySlotService.updateUserMood({
      confidence: fallback.confidence,
      updatedAt: new Date().toISOString()
    })

    traceError('userMoodNode', error, {
      title: '异常: userMoodNode 用户情绪感知失败',
      summary: fallback.reason
    })

    return {}
  }
}
