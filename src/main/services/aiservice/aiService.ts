import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { agent } from './agentrsystem/agentReactSystem'
import type { AIStructuredResponse } from '../../../share/cache/render/aiagent/aiContent'
import { contentToText, contentToParts } from './messageoutput/transformRespones'
import { toErrorMessage, logError } from '../../../share/utils/error/error'
import { AppDataSource } from '../../database'
import { Message } from '../../../share/entity/database/Message'

class AIService {
  private get messageRepo() {
    return AppDataSource.getRepository(Message)
  }

  private async saveMessage(role: 'user' | 'ai', content: string): Promise<void> {
    try {
      const msg = new Message()
      msg.role = role
      msg.content = content
      await this.messageRepo.save(msg)
    } catch (error) {
      console.error('Failed to save message:', error)
    }
  }

  async sendMessage(message: string): Promise<string> {
    try {
      // 保存用户消息
      await this.saveMessage('user', message)

      const result = await agent.invoke({
        messages: [new HumanMessage(message)]
      })

      const lastMessage = result.messages[result.messages.length - 1]
      const text = contentToText(lastMessage.content)
      const response = text || (typeof lastMessage.content === 'string' ? lastMessage.content : '')

      // 保存 AI 响应
      await this.saveMessage('ai', response)

      return response
    } catch (error: unknown) {
      return logError('Error sending message to AI:', error)
    }
  }

  /**
   * 返回富结构内容：统一为片段数组，保留非文本类型。
   */
  async sendMessageStructured(message: string): Promise<AIStructuredResponse> {
    try {
      // 保存用户消息
      await this.saveMessage('user', message)

      const result = await agent.invoke({
        messages: [new HumanMessage(message)]
      })
      const lastMessage = result.messages[result.messages.length - 1]
      
      // 构建完整文本用于存储（这里简化为 JSON 字符串或提取文本，视需求而定）
      // 为保持简单，暂存纯文本部分
      const textContent = contentToText(lastMessage.content)
      await this.saveMessage('ai', textContent)

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
      // 保存用户消息
      await this.saveMessage('user', message)

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

      // 保存 AI 完整响应
      await this.saveMessage('ai', fullText)

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
        
        // 保存 Fallback 的响应
        await this.saveMessage('ai', out)
        
        return out
      } catch (e: unknown) {
        const fallbackMsg = toErrorMessage(e)
        console.error('Fallback invoke failed:', fallbackMsg, e)
        return '抱歉，AI流式服务暂不可用。' + errMsg
      }
    }
  }

  /**
   * 获取历史消息
   */
  async getHistory(limit = 50): Promise<Message[]> {
    try {
      return await this.messageRepo.find({
        order: { createdAt: 'ASC' }, // 按时间正序排列
        // take: limit // 暂时取全部，或按需分页
      })
    } catch (error) {
      console.error('Failed to get history:', error)
      return []
    }
  }
}

export const aiService = new AIService()
