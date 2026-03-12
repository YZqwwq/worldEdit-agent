import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { StreamChunk } from '../share/cache/render/aiagent/aiContent'
import type {
  ModelConfigInput,
  ModelConfigPayload
} from '../share/cache/AItype/model/modelConfigPayload'
import type { MemoryInspectionPayload } from '../share/cache/AItype/states/memoryInspection'

// Local type to ensure availability in this module
type Api = {
  // 流式发送
  sendMessageStream: (message: string) => void
  // 监听流数据包（返回移除监听函数）
  onStreamChunk: (callback: (chunk: StreamChunk) => void) => () => void

  // 获取历史记录
  getHistory: () => Promise<any[]>
  clearHistory: () => Promise<void>
  purgeAllData: () => Promise<number>
  getMemorySnapshot: () => Promise<MemoryInspectionPayload>

  pickFile: () => Promise<{ sourcePath: string; fileName: string; size: number }>
  uploadFile: (sourcePath: string) => Promise<{ filePath: string; fileName: string; size: number }>
  deleteFile: (filePath: string) => Promise<boolean>
  pickAndUploadFile: () => Promise<{ filePath: string; fileName: string; size: number }>
  clearUploads: () => Promise<number>

  getModelConfig: () => Promise<ModelConfigPayload>
  saveModelConfig: (config: ModelConfigInput) => Promise<ModelConfigPayload>
}

// Custom APIs for renderer
const api: Api = {
  sendMessageStream: (message: string) => ipcRenderer.send('ai:sendMessageStream', message),
  
  onStreamChunk: (callback) => {
    const subscription = (_event: IpcRendererEvent, chunk: StreamChunk) => callback(chunk)
    ipcRenderer.on('ai:streamChunk', subscription)
    
    // 返回 cleanup 函数
    return () => {
      ipcRenderer.removeListener('ai:streamChunk', subscription)
    }
  },

  getHistory: () => ipcRenderer.invoke('ai:getHistory'),
  clearHistory: () => ipcRenderer.invoke('ai:clearHistory'),
  purgeAllData: () => ipcRenderer.invoke('ai:purgeAllData'),
  getMemorySnapshot: () => ipcRenderer.invoke('ai:getMemorySnapshot'),
  pickFile: () => ipcRenderer.invoke('file:pick'),
  uploadFile: (sourcePath) => ipcRenderer.invoke('file:upload', sourcePath),
  deleteFile: (filePath) => ipcRenderer.invoke('file:delete', filePath),
  pickAndUploadFile: () => ipcRenderer.invoke('file:pickAndUpload'),
  clearUploads: () => ipcRenderer.invoke('file:clearUploads'),
  getModelConfig: () => ipcRenderer.invoke('config:getModelConfig'),
  saveModelConfig: (config) => ipcRenderer.invoke('config:saveModelConfig', config)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
