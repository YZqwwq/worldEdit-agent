import { ChatOpenAI } from '@langchain/openai'
import { SystemMessage} from '@langchain/core/messages'
import { readFileSync, writeFileSync } from 'fs'
import { tool } from '@langchain/core/tools'
import * as z from 'zod'
import { join } from 'path'
import { contentToText } from '../../messageoutput/transformRespones'
import { AppDataSource } from '../../../../database'
import { Message } from '../../../../../share/entity/database/Message'

// 历史文件路径
const getHistoryPath = (): string => {
  const projectRoot = process.cwd()
  return join(projectRoot, 'src/main/prompt-resource/famila-daily/historyprompt/recent-history.md')
}

// 独立的压缩函数，供工具调用
async function performCompression(summary: string): Promise<string> {
  const historyPath = getHistoryPath()
  let currentContent = ''
  try {
    currentContent = readFileSync(historyPath, 'utf-8')
  } catch {
    currentContent = ''
  }

  // 读取所有未压缩的消息（这里简化为读取最近 50 条，实际应有标记）
  const messageRepo = AppDataSource.getRepository(Message)
  const recentMessages = await messageRepo.find({
    order: { createdAt: 'DESC' },
    take: 50
  })
  
  // 转为文本形式
  const conversationText = recentMessages
    .reverse()
    .map(m => `${m.role}: ${m.content}`)
    .join('\n')

  // 构建 prompt
  // 如果提供了 summary，则作为 AI 的自我总结参考
  const prompt = `
  你是一个专业的对话历史归档员。你的任务是将新的对话内容合并到现有的历史档案中。
  
  ## 现有档案 (recent-history.md)
  ${currentContent || '(空)'}
  
  ## AI 自我总结 (参考)
  ${summary || '(无)'}
  
  ## 最近对话记录 (需归档)
  ${conversationText}
  
  ## 任务要求
  1. 请更新并输出新的 Markdown 档案内容。
  2. 保持结构清晰，建议包含 "当前上下文" 和 "关键对话摘要" 两个部分。
  3. "当前上下文"：更新当前的任务状态、用户偏好、已知信息。
  4. "关键对话摘要"：提炼有价值的对话点，忽略寒暄和无意义的对话。
  5. 不要输出任何解释性文字，只输出 Markdown 内容。
  `

  // 这里为了简单，直接使用硬编码的 model 配置，实际应从统一配置获取
  const chat = new ChatOpenAI({
    model: 'gpt-4o', // 或使用配置中的模型
    temperature: 0.3,
    apiKey: 'sk-tNyCJbWcFMiYPg8_HZg2aJjGn9owN4zzQ10jgPgaOV2l-6ZYFCLsvyuCFTI',
    configuration: { baseURL: 'https://api.nekro.ai/v1' }
  })

  const response = await chat.invoke([new SystemMessage(prompt)])
  const newContent = contentToText(response.content)

  if (newContent) {
    writeFileSync(historyPath, newContent, 'utf-8')
    return 'History summarized successfully.'
  }
  return 'Failed to summarize history.'
}

// 定义 Tool
export const summarizeHistoryTool = tool(
  async ({ summary }) => {
    return await performCompression(summary || '')
  },
  {
    name: 'summarizeHistory',
    description: '当对话历史过长或话题结束时，调用此工具将最近的对话压缩并归档到长期记忆中。你可以提供一段自我总结作为参考。',
    schema: z.object({
      summary: z.string().optional().describe('AI 对刚才对话的简要自我总结，作为归档参考。')
    })
  }
)
