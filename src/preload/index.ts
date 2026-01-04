import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AIStructuredResponse } from '../share/cache/render/aiagent/aiContent'

// Local type to ensure availability in this module
type Api = {
  sendMessage: (message: string) => Promise<string>
  // 结构化消息：返回主进程标准化的富结构片段数组
  sendMessageStructured: (message: string) => Promise<AIStructuredResponse>
  // 获取历史记录
  getHistory: () => Promise<any[]>
}

// Custom APIs for renderer
const api: Api = {
  sendMessage: (message: string) =>
    ipcRenderer.invoke('ai:sendMessage', message) as Promise<string>,
  sendMessageStructured: (message: string) =>
    ipcRenderer.invoke('ai:sendMessageStructured', message) as Promise<AIStructuredResponse>,
  getHistory: () => ipcRenderer.invoke('ai:getHistory')
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
