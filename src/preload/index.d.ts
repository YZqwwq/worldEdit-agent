import { ElectronAPI } from '@electron-toolkit/preload'
import type { StreamChunk } from '../share/cache/render/aiagent/aiContent'

declare global {
  // Define the shape of custom APIs exposed to renderer (global type)
  type Api = {
    // 移除旧的非流式接口
    // sendMessage: (message: string) => Promise<string>
    // sendMessageStructured: (message: string) => Promise<AIStructuredResponse>

    // 流式接口
    sendMessageStream: (message: string) => void
    onStreamChunk: (callback: (chunk: StreamChunk) => void) => () => void

    getHistory: () => Promise<any[]>
  }

  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
