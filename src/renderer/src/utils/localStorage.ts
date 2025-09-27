/**
 * Storage Utility for Renderer Process
 * 渲染进程存储工具，直接使用electron-store
 * 
 * 注意：此文件已重构为直接在渲染进程中使用electron-store
 * 不再通过IPC调用主进程，更符合web开发习惯
 */

// 使用preload暴露的electron-store API
const electronStore = window.electronStore

if (!electronStore) {
  console.error('electronStore is not available. Make sure the preload script is loaded correctly.')
  throw new Error('electronStore is not available')
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
 * 基础存储模块
 * 直接在渲染进程中操作electron-store
 */
const electronStorage = {
  /**
   * 设置存储项
   */
  set: async <T>(key: string, value: T, expiry?: number): Promise<boolean> => {
    try {
      const item: StorageItem<T> = {
        value,
        expiry: expiry ? Date.now() + expiry : undefined,
        timestamp: Date.now()
      }
      return await electronStore.set(key, item)
    } catch (error) {
      console.error('Failed to set storage item:', error)
      return false
    }
  },

  /**
   * 获取存储项
   */
  get: async <T>(key: string, defaultValue?: T): Promise<T | undefined> => {
    try {
      const item = await electronStore.get(key, undefined) as StorageItem<T> | undefined
      
      if (!item) return defaultValue
      
      // 检查过期时间
      if (item.expiry && Date.now() > item.expiry) {
        await electronStore.remove(key)
        return defaultValue
      }
      
      return item.value
    } catch (error) {
      console.error('Failed to get storage item:', error)
      return defaultValue
    }
  },

  /**
   * 移除存储项
   */
  remove: async (key: string): Promise<boolean> => {
    try {
      return await electronStore.remove(key)
    } catch (error) {
      console.error('Failed to remove storage item:', error)
      return false
    }
  },

  /**
   * 检查存储项是否存在
   */
  has: async (key: string): Promise<boolean> => {
    try {
      const item = await electronStore.get(key, undefined) as StorageItem | undefined
      
      if (!item) return false
      
      // 检查是否过期
      if (item.expiry && Date.now() > item.expiry) {
        await electronStore.remove(key)
        return false
      }
      
      return true
    } catch (error) {
      console.error('Failed to check storage item:', error)
      return false
    }
  },

  /**
   * 清空存储
   */
  clear: async (): Promise<boolean> => {
    try {
      return await electronStore.clear()
    } catch (error) {
      console.error('Failed to clear storage:', error)
      return false
    }
  },

  /**
   * 获取所有键
   */
  keys: async (): Promise<string[]> => {
    try {
      return await electronStore.keys()
    } catch (error) {
      console.error('Failed to get storage keys:', error)
      return []
    }
  },

  /**
   * 获取存储大小信息
   */
  getStorageInfo: async (): Promise<{size: number; itemCount: number}> => {
    try {
      const info = await electronStore.getStorageInfo()
      return {
        size: info.size,
        itemCount: info.itemCount
      }
    } catch (error) {
      console.error('Failed to get storage info:', error)
      return { size: 0, itemCount: 0 }
    }
  },

  /**
   * 清理过期数据
   */
  cleanupExpired: async (): Promise<number> => {
    try {
      return await electronStore.cleanupExpired()
    } catch (error) {
      console.error('Failed to cleanup expired items:', error)
      return 0
    }
  }
}

/**
 * 加密存储模块
 * 用于存储敏感数据
 */
const secureElectronStorage = {
  /**
   * 设置加密存储项
   */
  set: async <T>(key: string, value: T, expiry?: number): Promise<boolean> => {
    try {
      const item: StorageItem<T> = {
        value,
        expiry: expiry ? Date.now() + expiry : undefined,
        timestamp: Date.now()
      }
      return await electronStore.setSecure(key, item)
    } catch (error) {
      console.error('Failed to set secure storage item:', error)
      return false
    }
  },

  /**
   * 获取加密存储项
   */
  get: async <T>(key: string, defaultValue?: T): Promise<T | undefined> => {
    try {
      const item = await electronStore.getSecure(key, undefined) as StorageItem<T> | undefined
      
      if (!item) return defaultValue
      
      // 检查过期时间
      if (item.expiry && Date.now() > item.expiry) {
        await electronStore.removeSecure(key)
        return defaultValue
      }
      
      return item.value
    } catch (error) {
      console.error('Failed to get secure storage item:', error)
      return defaultValue
    }
  },

  /**
   * 移除加密存储项
   */
  remove: async (key: string): Promise<boolean> => {
    try {
      return await electronStore.removeSecure(key)
    } catch (error) {
      console.error('Failed to remove secure storage item:', error)
      return false
    }
  },

  /**
   * 检查加密存储项是否存在
   */
  has: async (key: string): Promise<boolean> => {
    try {
      const item = await electronStore.getSecure(key, undefined) as StorageItem | undefined
      
      if (!item) return false
      
      // 检查是否过期
      if (item.expiry && Date.now() > item.expiry) {
        await electronStore.removeSecure(key)
        return false
      }
      
      return true
    } catch (error) {
      console.error('Failed to check secure storage item:', error)
      return false
    }
  },

  /**
   * 清空加密存储
   */
  clear: async (): Promise<boolean> => {
    try {
      return await electronStore.clearSecure()
    } catch (error) {
      console.error('Failed to clear secure storage:', error)
      return false
    }
  }
}

/**
 * 统一的存储接口
 * 直接使用electron-store，异步操作
 */
export const storage = {
  /**
   * 设置存储项
   */
  set: async <T>(key: string, value: T, expiry?: number): Promise<boolean> => {
    return await electronStorage.set(key, value, expiry)
  },

  /**
   * 获取存储项
   */
  get: async <T>(key: string, defaultValue?: T): Promise<T | undefined> => {
    return await electronStorage.get(key, defaultValue)
  },

  /**
   * 移除存储项
   */
  remove: async (key: string): Promise<boolean> => {
    return await electronStorage.remove(key)
  },

  /**
   * 检查键是否存在
   */
  has: async (key: string): Promise<boolean> => {
    return await electronStorage.has(key)
  },

  /**
   * 清空所有存储
   */
  clear: async (): Promise<boolean> => {
    return await electronStorage.clear()
  },

  /**
   * 获取所有键
   */
  keys: async (): Promise<string[]> => {
    return await electronStorage.keys()
  },

  /**
   * 设置加密存储项
   */
  setSecure: async <T>(key: string, value: T, expiry?: number): Promise<boolean> => {
    return await secureElectronStorage.set(key, value, expiry)
  },

  /**
   * 获取加密存储项
   */
  getSecure: async <T>(key: string, defaultValue?: T): Promise<T | undefined> => {
    return await secureElectronStorage.get(key, defaultValue)
  },

  /**
   * 移除加密存储项
   */
  removeSecure: async (key: string): Promise<boolean> => {
    return await secureElectronStorage.remove(key)
  },

  /**
   * 检查加密存储项是否存在
   */
  hasSecure: async (key: string): Promise<boolean> => {
    return await secureElectronStorage.has(key)
  },

  /**
   * 清空加密存储
   */
  clearSecure: async (): Promise<boolean> => {
    return await secureElectronStorage.clear()
  },

  /**
   * 获取存储信息
   */
  getStorageInfo: async (): Promise<{size: number; itemCount: number}> => {
    return await electronStorage.getStorageInfo()
  },

  /**
   * 清理过期数据
   */
  cleanupExpired: async (): Promise<number> => {
    return await electronStorage.cleanupExpired()
  }
}

// 默认导出
export default storage

// 导出基础存储模块（供其他模块使用）
export { electronStorage, secureElectronStorage }