import { SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type {
  MemoryStageSnapshot,
  MessageData
} from '@share/cache/AItype/states/memoryState'
import type { MemorySlotSnapshot } from '@share/cache/AItype/states/memorySlots'
import { getQuickModel } from '../../modelwithtool/quick-base-model'
import { contentToText } from '../../../messageoutput/transformRespones'

const stageSummarySchema = z.object({
  summary: z.string().trim().min(1).max(800),
  moodLabel: z.string().trim().max(40).optional()
})

const extractJson = (input: string): string => {
  const start = input.indexOf('{')
  const end = input.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return input.slice(start, end + 1)
  }
  throw new Error('No JSON object found in stage summary response')
}

const compact = (value: string, max = 160): string => {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ')
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

const buildFallbackSummary = (messages: MessageData[], slots: MemorySlotSnapshot) => {
  const userHighlights = messages
    .filter((item) => item.role === 'user')
    .map((item) => compact(item.content, 120))
    .slice(-2)
  const aiHighlights = messages
    .filter((item) => item.role === 'ai')
    .map((item) => compact(item.content, 120))
    .slice(-1)

  return {
    status: 'fallback' as MemoryStageSnapshot['status'],
    summary: compact(
      [userHighlights[0], aiHighlights[0]].filter(Boolean).join('；') || '本阶段完成了一次对话归档。',
      240
    ),
    moodLabel: slots.user_mood.current_mood || undefined
  }
}

const buildStagePrompt = (messages: MessageData[], slots: MemorySlotSnapshot): string => {
  const transcript = messages
    .map((item) => `#${item.sequence ?? '?'} ${item.role.toUpperCase()}\n${item.content}`)
    .join('\n\n')

  return `你是一个对话阶段归档器。请将下面这一段对话归纳为结构化 JSON。

输出要求：
1. 只输出 JSON，不要输出解释。
2. JSON 字段必须包含：
{
  "summary": "120字内概括这一阶段的主要对话内容",
  "moodLabel": "calm|positive|impatient|frustrated|uncertain"
}
3. 忽略寒暄，优先保留对下一阶段仍有价值的内容。

短期插槽参考：
- 当前对话模式：${slots.conversation_state.conversation_mode || '无'}
- 当前互动状态：${slots.conversation_state.interaction_state || '无'}
- 用户情绪：${slots.user_mood.current_mood || '未识别'}

阶段对话：
${transcript}`
}

export const summarizeMemoryStage = async (
  messages: MessageData[],
  slots: MemorySlotSnapshot
): Promise<{
  status: MemoryStageSnapshot['status']
  summary: string
  moodLabel?: string
}> => {
  if (!messages.length) {
    return {
      status: 'fallback',
      summary: '',
      moodLabel: slots.user_mood.current_mood || undefined
    }
  }

  try {
    const quickModel = await getQuickModel()
    const response = await quickModel.invoke([new SystemMessage(buildStagePrompt(messages, slots))])
    const parsed = stageSummarySchema.parse(JSON.parse(extractJson(contentToText(response.content))))
    return {
      status: 'completed',
      summary: parsed.summary,
      moodLabel: parsed.moodLabel
    }
  } catch {
    return buildFallbackSummary(messages, slots)
  }
}
