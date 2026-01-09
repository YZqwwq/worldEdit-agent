import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { agent } from './agentrsystem/agentReactSystem'
import type { StreamChunk } from '../../../share/cache/render/aiagent/aiContent'
import { contentToText, contentToParts } from './messageoutput/transformRespones'
import { logError } from '../../../share/utils/error/error'
import { AppDataSource } from '../../database'
import { Message } from '../../../share/entity/database/Message'

class AIService {

  // 获取数据
  private get messageRepo() {
    return AppDataSource.getRepository(Message)
  }

  // 保存消息
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

  /**
   * 获取历史记录
   */
  async getHistory(): Promise<Message[]> {
    try {
      const messages = await this.messageRepo.find({
        order: {
          createdAt: 'ASC'
        },
        take: 50 // 限制前端加载条数
      })
      return messages
    } catch (error) {
      console.error('Failed to get history:', error)
      return []
    }
  }

  /**
   * 流式发送消息：逐 chunk 通过回调返回，并汇总最终文本。
   */
  async sendStreamMessage(
    message: string,
    onChunk?: (chunk: StreamChunk) => void
  ): Promise<void> {
    try {
      // 保存用户消息
      await this.saveMessage('user', message)

      const stream = await agent.streamEvents(
        { messages: [new HumanMessage(message)] },
        { version: 'v2' }
      )

      let fullText = ''
      
      // 流式处理每个 chunk
      for await (const event of stream) {
        if (event.event === 'on_chat_model_stream') {
          const chunk = event.data.chunk
          if (chunk && chunk.content) {
            const token = contentToText(chunk.content)
            if (token) {
              fullText += token
              if (onChunk) {
                onChunk({
                  type: 'text_delta',
                  content: token
                })
              }
            }
          }
        }
      }

      // 保存 AI 完整响应
      await this.saveMessage('ai', fullText)
      
      // 发送结束信号，附带完整结构化内容（暂由纯文本转码，未来可直接用 fullContent）
      if (onChunk) {
        onChunk({
          type: 'done',
          fullContent: contentToParts(fullText)
        })
      }
    } catch (error: unknown) {
      const errMsg = logError('Error in stream:', error)
      if (onChunk) {
        onChunk({
          type: 'stream_error',
          message: errMsg
        })
      }
    }
  }
}

export const aiService = new AIService()
