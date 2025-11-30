import { ipcMain } from 'electron'
import { aiService } from './aiService'

/**
 * Initializes IPC handlers for the AI service.
 */
export function initializeAIEndpoints(): void {
  ipcMain.handle('ai:sendMessage', (_event, message: string) => {
    return aiService.sendMessage(message)
  })

  // 流式传输：渲染进程发送消息后，主进程逐 token 推送
  ipcMain.on('ai:sendMessageStream', async (event, message: string) => {
    try {
      const finalText = await aiService.sendStreamMessage(message, (token) => {
        event.sender.send('ai:streamChunk', token)
      })
      event.sender.send('ai:streamDone', finalText)
    } catch (error: unknown) {
      const errMsg =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : (() => {
                try {
                  return JSON.stringify(error)
                } catch {
                  return String(error)
                }
              })()
      event.sender.send('ai:streamError', errMsg)
    }
  })

  // 结构化返回：保留富内容片段
  ipcMain.handle('ai:sendMessageStructured', (_event, message: string) => {
    return aiService.sendMessageStructured(message)
  })
}
