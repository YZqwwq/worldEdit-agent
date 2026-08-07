import { SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type { MessageData } from '@share/cache/AItype/states/memoryState'
import { getQuickModel } from '../../modelwithtool/quick-base-model'
import { contentToText } from '../../../messageoutput/transformRespones'
import { SEMANTIC_ARCHIVE_REVIEW_MIN_MESSAGES } from './memoryArchivePolicy'

const archiveIntentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('continue') }),
  z.object({
    type: z.literal('episode_boundary'),
    endSequence: z.number().int().nonnegative(),
    reason: z.string().trim().min(1).max(120)
  })
])

const extractJson = (input: string): string => {
  const start = input.indexOf('{')
  const end = input.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('No JSON object found in archive intent')
  return input.slice(start, end + 1)
}

const renderMessages = (messages: MessageData[]): string =>
  messages
    .map(
      (message) => `#${message.sequence ?? '?'} ${message.role.toUpperCase()}\n${message.content}`
    )
    .join('\n\n')

export const detectSemanticArchiveBoundary = async (
  archiveBuffer: MessageData[],
  followingContext: MessageData[]
): Promise<number | null> => {
  if (archiveBuffer.length < SEMANTIC_ARCHIVE_REVIEW_MIN_MESSAGES) return null

  const validSequences = archiveBuffer
    .filter(
      (message, index) =>
        index + 1 >= SEMANTIC_ARCHIVE_REVIEW_MIN_MESSAGES &&
        message.role === 'ai' &&
        Number.isFinite(message.sequence)
    )
    .map((message) => message.sequence as number)
  if (!validSequences.length) return null

  const prompt = `你是对话阶段边界判断器。判断“待归档消息”中是否已经形成自然闭合的阶段。

阶段边界可以是：一个话题明确结束、一次倾诉或关系互动告一段落、一个工作阶段完成，或后续对话已经明显转向新阶段。

约束：
1. 只判断边界，不总结内容，不判断是否值得形成长期记忆。
2. 普通停顿、一次问答结束、客套回复不自动算阶段边界。
3. 边界必须结束于 AI 消息。若有多个合理边界，选择最靠后的完整边界。
4. 只能选择这些 endSequence：${validSequences.join(', ')}。
5. 只输出 {"type":"continue"} 或 {"type":"episode_boundary","endSequence":数字,"reason":"简短原因"}。

待归档消息：
${renderMessages(archiveBuffer)}

后续短期上下文（仅用于判断转向）：
${renderMessages(followingContext.slice(0, 4)) || '无'}`

  try {
    const quickModel = await getQuickModel()
    const response = await quickModel.invoke([new SystemMessage(prompt)])
    const intent = archiveIntentSchema.parse(
      JSON.parse(extractJson(contentToText(response.content)))
    )
    if (intent.type === 'continue') return null
    return validSequences.includes(intent.endSequence) ? intent.endSequence : null
  } catch {
    return null
  }
}
