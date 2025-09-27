import { ElectronAPI } from '@electron-toolkit/preload'

// Electron Store API 接口
interface ElectronStoreAPI {
  // 普通存储
  set: (key: string, value: any, expiry?: number) => Promise<boolean>
  get: (key: string, defaultValue?: any) => Promise<any>
  remove: (key: string) => Promise<boolean>
  has: (key: string) => Promise<boolean>
  clear: () => Promise<boolean>
  keys: () => Promise<string[]>
  
  // 安全存储
  setSecure: (key: string, value: any, expiry?: number) => Promise<boolean>
  getSecure: (key: string, defaultValue?: any) => Promise<any>
  removeSecure: (key: string) => Promise<boolean>
  hasSecure: (key: string) => Promise<boolean>
  clearSecure: () => Promise<boolean>
  
  // 工具方法
  getStorageInfo: () => Promise<{
    size: number
    itemCount: number
    regular: { size: number; itemCount: number }
    secure: { size: number; itemCount: number }
  }>
  cleanupExpired: () => Promise<number>
}

declare global {
  interface Window {
    electron: ElectronAPI
    electronStore: ElectronStoreAPI
    api: unknown
  }
}
