import { ipcMain } from 'electron'
import { aiService } from './aiService'

/**
 * Initializes IPC handlers for the AI service.
 */
export function initializeAIEndpoints(): void {
  ipcMain.handle('ai:sendMessage', (_event, message: string) => {
    return aiService.sendMessage(message)
  })
}