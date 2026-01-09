import { ipcMain } from 'electron'
import { aiService } from './aiService'
import type { StreamChunk } from '../../../share/cache/render/aiagent/aiContent'

/**
 * Initializes IPC handlers for the AI service.
 */
export function initializeAIEndpoints(): void {
  // 流式传输：渲染进程发送消息后，主进程逐 chunk 推送
  ipcMain.on('ai:sendMessageStream', async (event, message: string) => {
    try {
      await aiService.sendStreamMessage(message, (chunk: StreamChunk) => {
        // 直接发送对象
        event.sender.send('ai:streamChunk', chunk)
      })
      // 注意：结束信号现在由 chunk.type === 'done' 携带，不再需要单独的 ai:streamDone
    } catch (error: unknown) {
      // 这里的 catch 主要是捕获 aiService 本身未处理的异常
      const errMsg = error instanceof Error ? error.message : String(error)
      event.sender.send('ai:streamChunk', {
        type: 'stream_error',
        message: errMsg
      } as StreamChunk)
    }
  })

  // 获取历史记录
  ipcMain.handle('ai:getHistory', (_event) => {
    return aiService.getHistory()
  })
}
