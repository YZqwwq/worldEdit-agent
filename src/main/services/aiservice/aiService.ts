import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { agent } from './agentrsystem/agentReactSystem'
import type { AIStructuredResponse } from '../../../share/cache/render/aiagent/aiContent'
import { contentToText, contentToParts } from './messageoutput/transformRespones'
import { toErrorMessage, logError } from '../../../share/utils/error/error'

class AIService {
  async sendMessage(message: string): Promise<string> {
    try {
      const result = await agent.invoke({
        messages: [new HumanMessage(message)]
      })

      const lastMessage = result.messages[result.messages.length - 1]
      const text = contentToText(lastMessage.content)
      return text || (typeof lastMessage.content === 'string' ? lastMessage.content : '')
    } catch (error: unknown) {
      return logError('Error sending message to AI:', error)
    }
  }

  /**
   * 返回富结构内容：统一为片段数组，保留非文本类型。
   */
  async sendMessageStructured(message: string): Promise<AIStructuredResponse> {
    try {
      const result = await agent.invoke({
        messages: [new HumanMessage(message)]
      })
      const lastMessage = result.messages[result.messages.length - 1]
      const parts = contentToParts(lastMessage.content)
      return { parts }
    } catch (error: unknown) {
      const errMsg = logError('Error sending structured message to AI:', error)
      // 错误也以结构化返回
      return { parts: [{ type: 'error', message: errMsg }] }
    }
  }

  /**
   * 流式发送消息：逐 token 通过回调返回，并汇总最终文本。
   */
  async sendStreamMessage(message: string, onToken?: (token: string) => void): Promise<string> {
    try {
      const stream = await agent.stream(
        { messages: [new HumanMessage(message)] },
        { streamMode: 'messages' }
      )

      let fullText = ''
      // 流式处理每个 chunk ，
      for await (const [chunk] of stream) {
        if (chunk instanceof AIMessage && chunk.content) {
          const token = contentToText(chunk.content)
          if (token) {
            fullText += token
            if (onToken) onToken(token)
          }
        }
      }
      return fullText
    } catch (error: unknown) {
      const errMsg = logError('Error streaming message from AI:', error)
      try {
        // Fallback to non-streaming invoke
        const result = await agent.invoke({
          messages: [new HumanMessage(message)]
        })
        const lastMessage = result.messages[result.messages.length - 1]
        const out =
          typeof lastMessage.content === 'string'
            ? lastMessage.content
            : contentToText(lastMessage.content) || JSON.stringify(lastMessage.content)
        return out
      } catch (e: unknown) {
        const fallbackMsg = toErrorMessage(e)
        console.error('Fallback invoke failed:', fallbackMsg, e)
        return '抱歉，AI流式服务暂不可用。' + errMsg
      }
    }
  }
}

export const aiService = new AIService()
