import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

console.log('Preload script is loading...')

// Electron Store API
const electronStoreAPI = {
  // 普通存储
  set: (key: string, value: any, expiry?: number) => ipcRenderer.invoke('electron-store:set', key, value, expiry),
  get: (key: string, defaultValue?: any) => ipcRenderer.invoke('electron-store:get', key, defaultValue),
  remove: (key: string) => ipcRenderer.invoke('electron-store:remove', key),
  has: (key: string) => ipcRenderer.invoke('electron-store:has', key),
  clear: () => ipcRenderer.invoke('electron-store:clear'),
  keys: () => ipcRenderer.invoke('electron-store:keys'),
  
  // 安全存储
  setSecure: (key: string, value: any, expiry?: number) => ipcRenderer.invoke('electron-store:set-secure', key, value, expiry),
  getSecure: (key: string, defaultValue?: any) => ipcRenderer.invoke('electron-store:get-secure', key, defaultValue),
  removeSecure: (key: string) => ipcRenderer.invoke('electron-store:remove-secure', key),
  hasSecure: (key: string) => ipcRenderer.invoke('electron-store:has-secure', key),
  clearSecure: () => ipcRenderer.invoke('electron-store:clear-secure'),
  
  // 工具方法
  getStorageInfo: () => ipcRenderer.invoke('electron-store:get-storage-info'),
  cleanupExpired: () => ipcRenderer.invoke('electron-store:cleanup-expired')
}

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    console.log('Exposing APIs via contextBridge...')
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('electronStore', electronStoreAPI)
    contextBridge.exposeInMainWorld('api', api)
    console.log('APIs exposed successfully via contextBridge')
  } catch (error) {
    console.error('Failed to expose APIs via contextBridge:', error)
  }
} else {
  console.log('Context isolation disabled, setting APIs on window object...')
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.electronStore = electronStoreAPI
  // @ts-ignore (define in dts)
  window.api = api
  console.log('APIs set on window object successfully')
}
