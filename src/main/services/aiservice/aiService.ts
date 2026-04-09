import type { StreamChunk } from '../../../share/cache/render/aiagent/aiContent'
import { Message } from '../../../share/entity/database/Message'
import {
  buildMainAgentMessageContent,
  normalizeMainAgentUserInput,
  type MainAgentUserMessageInput
} from '@share/cache/AItype/states/mainAgentMessageContent'
import { chatMessageService } from './chat/chatMessageService'
import { aiSessionMaintenanceService } from './maintenance/aiSessionMaintenanceService'
import { parseMainAgentContentForStorage } from './messagecontent/mainAgentFileParseService'
import { mainAgentEntryService } from './runtime/mainAgentEntryService'
import { mainAgentRunControlService } from './runtime/mainAgentRunControlService'
import { mainAgentTurnService, type RevertLastTurnResult } from './runtime/mainAgentTurnService'

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

    const savedMessage = await chatMessageService.saveMessage('user', messageText, {
      contentParts: content
    })
    if (!savedMessage || typeof savedMessage.id !== 'number' || savedMessage.id <= 0) {
      throw new Error('User message could not be persisted, so the main-agent event was not enqueued.')
    }

    await mainAgentEntryService.enqueueUserMessage({
      messageId: savedMessage.id,
      content,
      onChunk
    })
  }

  interruptCurrentRun(): { ok: boolean; message: string } {
    const interrupted = mainAgentRunControlService.interruptActiveRun()
    if (!interrupted) {
      return {
        ok: false,
        message: '当前没有正在生成的主 agent 回复。'
      }
    }

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
