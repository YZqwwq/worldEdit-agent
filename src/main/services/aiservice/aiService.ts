import type { StreamChunk } from '../../../share/cache/render/aiagent/aiContent'
import { Message } from '../../../share/entity/database/Message'
import { chatMessageService } from './chat/chatMessageService'
import { aiSessionMaintenanceService } from './maintenance/aiSessionMaintenanceService'
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
    message: string,
    onChunk?: (chunk: StreamChunk) => void
  ): Promise<void> {
    const savedMessage = await chatMessageService.saveMessage('user', message)
    await mainAgentEntryService.enqueueUserMessage({
      messageId: savedMessage?.id ?? 0,
      text: message,
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
