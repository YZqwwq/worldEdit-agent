import { randomUUID } from 'node:crypto'
import { HumanMessage } from '@langchain/core/messages'
import { agent } from './agentrsystem/agentReactSystem'
import type { StreamChunk } from '../../../share/cache/render/aiagent/aiContent'
import { contentToText, contentToParts } from './messageoutput/transformRespones'
import { logError } from '../../../share/utils/error/error'
import { AppDataSource } from '../../database'
import { Message } from '../../../share/entity/database/Message'
import { handleGraphLogEvent, runWithGraphLogContext } from '../log/graphlog'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

function debugLog(msg: string) {
  try {
    const logPath = join(process.cwd(), 'src/main/services/log/logs/debug.log')
    appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`)
  } catch (e) {
    // ignore
  }
}

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
   * 清除历史记录
   */
  async clearHistory(): Promise<void> {
    try {
      await this.messageRepo.clear()
    } catch (error) {
      console.error('Failed to clear history:', error)
      throw error
    }
  }

  /**
   * 流式发送消息：逐 chunk 通过回调返回，并汇总最终文本。
   */
  async sendStreamMessage(
    message: string,
    onChunk?: (chunk: StreamChunk) => void
  ): Promise<void> {
    debugLog(`sendStreamMessage called with: ${message}`)
    try {
      // 保存用户消息
      await this.saveMessage('user', message)

      const runId = randomUUID()
      debugLog(`RunID generated: ${runId}`)

      await runWithGraphLogContext(runId, async () => {
        debugLog(`Entered runWithGraphLogContext`)
        
        debugLog(`Calling agent.streamEvents`)
        const stream = await agent.streamEvents(
          { messages: [new HumanMessage(message)] },
          { version: 'v2' }
        )
        debugLog(`streamEvents returned stream iterator`)

        let fullText = ''

        for await (const event of stream) {
          // debugLog(`Event received: ${event.event}`) // Commented out to avoid spam, uncomment if needed
          
          const logChunk = handleGraphLogEvent(event)
          if (logChunk && onChunk) onChunk(logChunk)

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
        debugLog(`Stream loop finished`)

        await this.saveMessage('ai', fullText)

        if (onChunk) {
          onChunk({
            type: 'done',
            fullContent: contentToParts(fullText)
          })
        }
      })

    } catch (error: unknown) {
      debugLog(`Error in sendStreamMessage: ${error}`)
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
