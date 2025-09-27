import { ipcMain } from 'electron'

// 动态导入electron-store
let Store: any
let store: any
let secureStore: any

// 异步初始化store实例
async function initializeStores() {
  try {
    Store = (await import('electron-store')).default
    
    store = new Store({
      name: 'app-storage',
      fileExtension: 'json',
      clearInvalidConfig: true
    })
    
    secureStore = new Store({
      name: 'secure-storage',
      fileExtension: 'json',
      encryptionKey: 'worldedit-agent-secure-key-2024', // 生产环境建议使用更复杂的密钥
      clearInvalidConfig: true
    })
    
    console.log('Electron Store instances initialized successfully')
  } catch (error) {
    console.error('Failed to initialize Electron Store:', error)
  }
}

// IPC 通道常量
export const ELECTRON_STORE_CHANNELS = {
  // 普通存储
  SET: 'electron-store:set',
  GET: 'electron-store:get',
  REMOVE: 'electron-store:remove',
  HAS: 'electron-store:has',
  CLEAR: 'electron-store:clear',
  KEYS: 'electron-store:keys',
  
  // 安全存储
  SET_SECURE: 'electron-store:set-secure',
  GET_SECURE: 'electron-store:get-secure',
  REMOVE_SECURE: 'electron-store:remove-secure',
  HAS_SECURE: 'electron-store:has-secure',
  CLEAR_SECURE: 'electron-store:clear-secure',
  
  // 工具方法
  GET_STORAGE_INFO: 'electron-store:get-storage-info',
  CLEANUP_EXPIRED: 'electron-store:cleanup-expired'
}

/**
 * 存储项接口
 */
interface StorageItem<T = any> {
  value: T
  expiry?: number
  timestamp: number
}

/**
 * 注册Electron Store IPC处理器
 */
export async function registerElectronStoreIPC(): Promise<void> {
  console.log('register Electron Store IPC handlers')
  
  // 先初始化stores
  await initializeStores()

  // 普通存储操作
  ipcMain.handle(ELECTRON_STORE_CHANNELS.SET, (_, key: string, value: any, expiry?: number) => {
    try {
      const item: StorageItem = {
        value,
        expiry: expiry ? Date.now() + expiry : undefined,
        timestamp: Date.now()
      }
      store.set(key, item)
      return true
    } catch (error) {
      console.error('Electron Store set error:', error)
      return false
    }
  })

  ipcMain.handle(ELECTRON_STORE_CHANNELS.GET, (_, key: string, defaultValue?: any) => {
    try {
      const item = store.get(key) as StorageItem | undefined
      if (!item) return defaultValue
      
      // 检查是否过期
      if (item.expiry && Date.now() > item.expiry) {
        store.delete(key)
        return defaultValue
      }
      
      return item.value
    } catch (error) {
      console.error('Electron Store get error:', error)
      return defaultValue
    }
  })

  ipcMain.handle(ELECTRON_STORE_CHANNELS.REMOVE, (_, key: string) => {
    try {
      store.delete(key)
      return true
    } catch (error) {
      console.error('Electron Store remove error:', error)
      return false
    }
  })

  ipcMain.handle(ELECTRON_STORE_CHANNELS.HAS, (_, key: string) => {
    try {
      const item = store.get(key) as StorageItem | undefined
      if (!item) return false
      
      // 检查是否过期
      if (item.expiry && Date.now() > item.expiry) {
        store.delete(key)
        return false
      }
      
      return true
    } catch (error) {
      console.error('Electron Store has error:', error)
      return false
    }
  })

  ipcMain.handle(ELECTRON_STORE_CHANNELS.CLEAR, () => {
    try {
      store.clear()
      return true
    } catch (error) {
      console.error('Electron Store clear error:', error)
      return false
    }
  })

  ipcMain.handle(ELECTRON_STORE_CHANNELS.KEYS, () => {
    try {
      return Object.keys(store.store)
    } catch (error) {
      console.error('Electron Store keys error:', error)
      return []
    }
  })

  // 安全存储操作
  ipcMain.handle(ELECTRON_STORE_CHANNELS.SET_SECURE, (_, key: string, value: any, expiry?: number) => {
    try {
      const item: StorageItem = {
        value,
        expiry: expiry ? Date.now() + expiry : undefined,
        timestamp: Date.now()
      }
      secureStore.set(key, item)
      return true
    } catch (error) {
      console.error('Secure Store set error:', error)
      return false
    }
  })

  ipcMain.handle(ELECTRON_STORE_CHANNELS.GET_SECURE, (_, key: string, defaultValue?: any) => {
    try {
      const item = secureStore.get(key) as StorageItem | undefined
      if (!item) return defaultValue
      
      // 检查是否过期
      if (item.expiry && Date.now() > item.expiry) {
        secureStore.delete(key)
        return defaultValue
      }
      
      return item.value
    } catch (error) {
      console.error('Secure Store get error:', error)
      return defaultValue
    }
  })

  ipcMain.handle(ELECTRON_STORE_CHANNELS.REMOVE_SECURE, (_, key: string) => {
    try {
      secureStore.delete(key)
      return true
    } catch (error) {
      console.error('Secure Store remove error:', error)
      return false
    }
  })

  ipcMain.handle(ELECTRON_STORE_CHANNELS.HAS_SECURE, (_, key: string) => {
    try {
      const item = secureStore.get(key) as StorageItem | undefined
      if (!item) return false
      
      // 检查是否过期
      if (item.expiry && Date.now() > item.expiry) {
        secureStore.delete(key)
        return false
      }
      
      return true
    } catch (error) {
      console.error('Secure Store has error:', error)
      return false
    }
  })

  ipcMain.handle(ELECTRON_STORE_CHANNELS.CLEAR_SECURE, () => {
    try {
      secureStore.clear()
      return true
    } catch (error) {
      console.error('Secure Store clear error:', error)
      return false
    }
  })

  // 工具方法
  ipcMain.handle(ELECTRON_STORE_CHANNELS.GET_STORAGE_INFO, () => {
    try {
      const regularSize = JSON.stringify(store.store).length
      const secureSize = JSON.stringify(secureStore.store).length
      const regularItemCount = Object.keys(store.store).length
      const secureItemCount = Object.keys(secureStore.store).length
      
      return {
        size: regularSize + secureSize,
        itemCount: regularItemCount + secureItemCount,
        regular: {
          size: regularSize,
          itemCount: regularItemCount
        },
        secure: {
          size: secureSize,
          itemCount: secureItemCount
        }
      }
    } catch (error) {
      console.error('Get storage info error:', error)
      return { size: 0, itemCount: 0 }
    }
  })

  ipcMain.handle(ELECTRON_STORE_CHANNELS.CLEANUP_EXPIRED, () => {
    try {
      let cleanedCount = 0
      const now = Date.now()
      
      // 清理普通存储中的过期项
      for (const [key, item] of Object.entries(store.store)) {
        const storageItem = item as StorageItem
        if (storageItem.expiry && now > storageItem.expiry) {
          store.delete(key)
          cleanedCount++
        }
      }
      
      // 清理安全存储中的过期项
      for (const [key, item] of Object.entries(secureStore.store)) {
        const storageItem = item as StorageItem
        if (storageItem.expiry && now > storageItem.expiry) {
          secureStore.delete(key)
          cleanedCount++
        }
      }
      
      return cleanedCount
    } catch (error) {
      console.error('Cleanup expired error:', error)
      return 0
    }
  })

  console.log('Electron Store IPC handlers registered')
}

/**
 * 注销Electron Store IPC处理器
 */
export function unregisterElectronStoreIPC(): void {
  console.log('Unregister Electron Store IPC handlers')
  
  // 移除所有IPC处理器
  Object.values(ELECTRON_STORE_CHANNELS).forEach(channel => {
    ipcMain.removeAllListeners(channel)
  })
  
  console.log('Electron Store IPC handlers unregistered')
}