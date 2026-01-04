import { ElectronAPI } from '@electron-toolkit/preload'
import type { AIStructuredResponse } from '../share/cache/render/aiagent/aiContent'

declare global {
  // Define the shape of custom APIs exposed to renderer (global type)
  type Api = {
    sendMessage: (message: string) => Promise<string>
    sendMessageStructured: (message: string) => Promise<AIStructuredResponse>
    getHistory: () => Promise<any[]>
  }

  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
