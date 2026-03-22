import { randomUUID } from 'node:crypto'
import { HumanMessage } from '@langchain/core/messages'
import { agent } from './agentrsystem/agentReactSystem'
import type { StreamChunk } from '../../../share/cache/render/aiagent/aiContent'
import { contentToText, contentToParts } from './messageoutput/transformRespones'
import { logError } from '../../../share/utils/error/error'
import { AppDataSource } from '../../database'
import { Message } from '../../../share/entity/database/Message'
import { TaskRecord } from '../../../share/entity/database/TaskRecord'
import { TaskExecutionRecord } from '../../../share/entity/database/TaskExecutionRecord'
import { TaskNotificationRecord } from '../../../share/entity/database/TaskNotificationRecord'
import { TaskTraceRecord } from '../../../share/entity/database/TaskTraceRecord'
import { handleGraphLogEvent, runWithGraphLogContext } from '../log/graphlog'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { memoryManager } from './agentrsystem/manager/memory/MemoryManager'
import { resetPersonaState } from './agentrsystem/manager/personal/personalManager'
import { mainAgentDispatchService } from '../middlelayer/event-in-wait/mainAgentDispatchService'
import { taskNotificationService } from '../task/taskNotificationService'
import { taskTraceService } from '../task/taskTraceService'
import type { MainAgentTaskEvent } from '@share/cache/AItype/states/taskLifecycleState'

function debugLog(msg: string) {
  try {
    const logPath = join(process.cwd(), 'src/main/services/log/logs/debug.log')
    appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`)
  } catch (e) {
    // ignore
  }
}

class AIService {
  constructor() {
    mainAgentDispatchService.configure({
      processUserMessage: async ({ text, onChunk }) => {
        await this.processDispatchedUserMessage(text, onChunk)
      },
      processTaskNotification: async ({ taskId, notificationId }) => {
        await this.processDispatchedTaskNotification(taskId, notificationId)
      }
    })
  }

  // 获取数据
  private get messageRepo() {
    return AppDataSource.getRepository(Message)
  }

  // 保存消息
  private async saveMessage(role: 'user' | 'ai', content: string): Promise<Message | null> {
    try {
      const msg = new Message()
      msg.role = role
      msg.content = content
      return await this.messageRepo.save(msg)
    } catch (error) {
      console.error('Failed to save message:', error)
      return null
    }
  }

  /**
   * 获取历史记录
   */
  async getHistory(): Promise<Message[]> {
    try {
      const messages = await this.messageRepo.find({
        order: {
          createdAt: 'DESC',
          id: 'DESC'
        },
        take: 50 // 限制前端加载条数
      })
      return messages.reverse()
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
      await memoryManager.resetStorage()
    } catch (error) {
      console.error('Failed to clear history:', error)
      throw error
    }
  }

  async purgeAllData(): Promise<void> {
    try {
      await AppDataSource.transaction(async (manager) => {
        await manager.getRepository(TaskTraceRecord).clear()
        await manager.getRepository(TaskNotificationRecord).clear()
        await manager.getRepository(TaskExecutionRecord).clear()
        await manager.getRepository(TaskRecord).clear()
        await manager.getRepository(Message).clear()
      })
      mainAgentDispatchService.reset()
      await memoryManager.resetStorage()
      await resetPersonaState()
    } catch (error) {
      console.error('Failed to purge data:', error)
      throw error
    }
  }

  async resetPersonaStateOnly(): Promise<void> {
    try {
      await resetPersonaState()
    } catch (error) {
      console.error('Failed to reset persona state:', error)
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
    const savedMessage = await this.saveMessage('user', message)
    await mainAgentDispatchService.enqueueUserMessage({
      messageId: savedMessage?.id ?? 0,
      text: message,
      onChunk
    })
  }

  private async processDispatchedUserMessage(
    message: string,
    onChunk?: (chunk: StreamChunk) => void
  ): Promise<void> {
    debugLog(`sendStreamMessage called with: ${message}`)
    try {
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
      }, onChunk)

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

  private async processDispatchedTaskNotification(
    taskId: number,
    notificationId: number
  ): Promise<void> {
    const consumed = await taskNotificationService.consumePendingNotification(taskId, notificationId)
    if (!consumed) {
      return
    }

    await taskTraceService.emit({
      taskId,
      executionId: consumed.notification.executionId,
      actor: 'main_agent',
      stage: 'main_received_subagent',
      message: '主 agent 已收到子 agent 的通知，开始决定下一步动作。',
      payload: {
        notificationType: consumed.notification.type,
        taskStatus: consumed.activeTask.status
      }
    })

    const taskEvent: MainAgentTaskEvent = {
      source: 'task_queue',
      taskId,
      notificationId,
      notificationType: consumed.notification.type,
      activeTask: consumed.activeTask,
      notice: consumed.notice,
      payload: consumed.payload
    }

    const runId = randomUUID()
    const result = await runWithGraphLogContext(runId, async () =>
      agent.invoke({
        messages: [],
        taskEvent,
        taskLifecycle: {
          activeTask: consumed.activeTask,
          notice: consumed.notice
        }
      })
    )

    const decision = result.taskEventDecision
    const visibleMessage = decision?.visibleMessage?.trim()
    if (decision?.action === 'ask_user' && visibleMessage) {
      await this.saveMessage('ai', visibleMessage)
      await taskTraceService.emit({
        taskId,
        executionId: consumed.notification.executionId,
        actor: 'main_agent',
        stage: 'main_response_user',
        message: '主 agent 决定向用户发送可见消息。',
        payload: {
          visibleMessage,
          noticeType: consumed.notice.type,
          reason: decision.reason
        }
      })
    }
  }
}

export const aiService = new AIService()
