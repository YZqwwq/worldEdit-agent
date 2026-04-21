import { randomUUID } from 'node:crypto'
import { AppDataSource } from '../../database'
import type { StreamChunk } from '../../../share/cache/render/aiagent/aiContent'
import { Message } from '../../../share/entity/database/Message'
import { MainAgentEventRecord } from '@share/entity/database/MainAgentEventRecord'
import {
  buildMainAgentMessageContent,
  hasMainAgentFileContent,
  normalizeMainAgentUserInput,
  serializeMainAgentMessageContent,
  type MainAgentUserMessageInput
} from '@share/cache/AItype/states/mainAgentMessageContent'
import type { MainAgentUserMessageEvent } from '@share/cache/AItype/states/taskLifecycleState'
import { chatMessageService } from './chat/chatMessageService'
import { aiSessionMaintenanceService } from './maintenance/aiSessionMaintenanceService'
import { parseMainAgentContentForStorage } from './messagecontent/mainAgentFileParseService'
import { mainAgentEntryService } from './runtime/mainAgentEntryService'
import { mainAgentRunControlService } from './runtime/mainAgentRunControlService'
import { mainAgentTurnService, type RevertLastTurnResult } from './runtime/mainAgentTurnService'
import { interactionObservationService } from './agentrsystem/manager/personal/interactionObservationService'

const DEFAULT_SESSION_ID = 'default'

type UserMessageDispatchPreparation = {
  event: MainAgentUserMessageEvent
  dispatchMode: 'enqueue' | 'attach' | 'noop'
}

class AIService {
  /**
   * 获取历史记录
   */
  async getHistory(): Promise<Message[]> {
    return chatMessageService.getRecentHistory()
  }

  /**
   * 清除历史记录
   */
  async clearHistory(): Promise<void> {
    await aiSessionMaintenanceService.clearHistory()
  }

  async purgeAllData(): Promise<void> {
    await aiSessionMaintenanceService.purgeAllData()
  }

  async resetPersonaStateOnly(): Promise<void> {
    await aiSessionMaintenanceService.resetPersonaStateOnly()
  }

  async resetAgentState(): Promise<void> {
    await aiSessionMaintenanceService.resetAgentState()
  }

  /**
   * 流式发送消息：逐 chunk 通过回调返回，并汇总最终文本。
   */
  async sendStreamMessage(
    input: MainAgentUserMessageInput,
    onChunk?: (chunk: StreamChunk) => void
  ): Promise<void> {
    const normalizedInput = normalizeMainAgentUserInput(input)
    const content = buildMainAgentMessageContent(normalizedInput)
    const messageText = await parseMainAgentContentForStorage(content)
    if (!messageText.trim()) {
      throw new Error('Empty user message is not allowed.')
    }

    const dispatch = await AppDataSource.transaction<UserMessageDispatchPreparation>(async (manager) => {
      const messageRepo = manager.getRepository(Message)
      const eventRepo = manager.getRepository(MainAgentEventRecord)
      const requestId = normalizedInput.requestId?.trim() || null
      const eventDedupeKey = requestId ? `user_message:${requestId}` : null

      if (eventDedupeKey) {
        const existingMessage = await messageRepo.findOne({
          where: { requestId: requestId || undefined },
          order: { id: 'DESC' }
        })
        if (existingMessage?.eventId) {
          const existingEvent = await eventRepo.findOneBy({ id: existingMessage.eventId })
          if (
            existingEvent &&
            (existingEvent.status === 'queued' ||
              existingEvent.status === 'processing' ||
              existingEvent.status === 'completed')
          ) {
            return {
              event: {
                id: existingEvent.id,
                type: 'user_message',
                source: 'user',
                sessionId: existingEvent.sessionId,
                priority: existingEvent.priority,
                createdAt: existingEvent.createdAtMs,
                dedupeKey: existingEvent.dedupeKey || undefined,
                payload: {
                  messageId: existingMessage.id,
                  content
                }
              },
              dispatchMode:
                existingEvent.status === 'completed'
                  ? 'noop'
                  : existingEvent.status === 'processing'
                    ? 'attach'
                    : 'enqueue'
            }
          }
        }
      }

      const message = messageRepo.create({
        role: 'user',
        content: messageText,
        contentJson: serializeMainAgentMessageContent(content),
        type: content.length > 1 || hasMainAgentFileContent(content) ? 'structured' : 'text',
        requestId,
        sessionId: DEFAULT_SESSION_ID,
        turnId: null,
        status: 'committed',
        eventId: null,
        consumer: null
      })
      const savedMessage = await messageRepo.save(message)
      if (!savedMessage || typeof savedMessage.id !== 'number' || savedMessage.id <= 0) {
        throw new Error('User message could not be persisted.')
      }

      const eventId = randomUUID()
      const event = eventRepo.create({
        id: eventId,
        type: 'user_message',
        source: 'user',
        sessionId: DEFAULT_SESSION_ID,
        priority: 'interactive',
        createdAtMs: Date.now(),
        dedupeKey: eventDedupeKey,
        payloadJson: JSON.stringify({
          messageId: savedMessage.id,
          content
        }),
        status: 'queued',
        consumer: null,
        summary: '',
        errorMessage: '',
        startedAt: null,
        finishedAt: null
      })
      await eventRepo.save(event)

      savedMessage.eventId = eventId
      await messageRepo.save(savedMessage)

      return {
        event: {
          id: eventId,
          type: 'user_message',
          source: 'user',
          sessionId: DEFAULT_SESSION_ID,
          priority: 'interactive',
          createdAt: event.createdAtMs,
          dedupeKey: eventDedupeKey || undefined,
          payload: {
            messageId: savedMessage.id,
            content
          }
        },
        dispatchMode: 'enqueue'
      }
    })

    if (dispatch.dispatchMode === 'noop') return

    await mainAgentEntryService.enqueuePersistedUserEvent(dispatch.event, onChunk)
  }

  interruptCurrentRun(): { ok: boolean; message: string } {
    const interrupted = mainAgentRunControlService.interruptActiveRun()
    if (!interrupted) {
      return {
        ok: false,
        message: '当前没有正在生成的主 agent 回复。'
      }
    }

    void interactionObservationService.record({
      type: 'user_interrupt',
      source: 'user',
      summary: '用户主动中断当前主 agent 回复。',
      payload: {
        activeRun: mainAgentRunControlService.getActiveRunSnapshot()
      }
    })

    return {
      ok: true,
      message: '已请求停止当前主 agent 回复。'
    }
  }

  async revertLastChatTurn(): Promise<RevertLastTurnResult> {
    return mainAgentTurnService.revertLastRevertibleTurn()
  }
}

export const aiService = new AIService()
