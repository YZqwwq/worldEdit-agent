import { ElectronAPI } from '@electron-toolkit/preload'
import type { StreamChunk } from '../share/cache/render/aiagent/aiContent'
import type {
  ModelConfigInput,
  ModelConfigPayload
} from '../share/cache/AItype/model/modelConfigPayload'

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
    clearHistory: () => Promise<void>
    purgeAllData: () => Promise<number>

    pickFile: () => Promise<{ sourcePath: string; fileName: string; size: number }>
    uploadFile: (sourcePath: string) => Promise<{ filePath: string; fileName: string; size: number }>
    deleteFile: (filePath: string) => Promise<boolean>
    pickAndUploadFile: () => Promise<{ filePath: string; fileName: string; size: number }>
    clearUploads: () => Promise<number>

    getModelConfig: () => Promise<ModelConfigPayload>
    saveModelConfig: (config: ModelConfigInput) => Promise<ModelConfigPayload>
  }

  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
