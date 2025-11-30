import { ChatOpenAI } from '@langchain/openai'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { readFileSync, writeFileSync } from 'fs'
import { contentToText } from '../../messageoutput/transformRespones'

// 上下文压缩工具
export async function rewriteSessionHistory(
  chat: ChatOpenAI,
  latestUserMessage: string,
  filePath: string
): Promise<string> {
  let current = ''
  try {
    current = readFileSync(filePath, 'utf-8')
  } catch {
    current = ''
  }
  const sys = new SystemMessage(
    '你是会话历史压缩器。根据最新用户消息改写并输出完整的 session-history.md（包含 user、agent、mission 三段）。'
  )
  const human = new HumanMessage(JSON.stringify({ current, latestUserMessage }))
  const res = await chat.invoke([sys, human])
  const text =
    typeof res.content === 'string'
      ? (res.content as string)
      : contentToText(res.content as unknown)
  if (text) {
    writeFileSync(filePath, text, 'utf-8')
    return text
  }
  return ''
}
