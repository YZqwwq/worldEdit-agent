import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  // Define the shape of custom APIs exposed to renderer (global type)
  type Api = {
    sendMessage: (message: string) => Promise<string>
  }

  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
