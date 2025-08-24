import { ipcMain } from 'electron'
import { mainDatabaseService } from '../services/database/DatabaseService'
import type { 
  WorldData, 
  UnifiedWorldData, 
  RecentFile 
} from '../../shared/types/world'

// IPC 通道常量
export const DATABASE_CHANNELS = {
  // 世界观操作
  CREATE_WORLD: 'database:create-world',
  GET_WORLD_LIST: 'database:get-world-list',
  GET_WORLD: 'database:get-world',
  UPDATE_WORLD: 'database:update-world',
  DELETE_WORLD: 'database:delete-world',
  
  // 世界观内容操作
  SAVE_WORLD_CONTENT: 'database:save-world-content',
  GET_WORLD_CONTENT: 'database:get-world-content',
  
  // 最近文件操作
  ADD_RECENT_FILE: 'database:add-recent-file',
  GET_RECENT_FILES: 'database:get-recent-files',
  REMOVE_RECENT_FILE: 'database:remove-recent-file',
  
  // 搜索和维护
  SEARCH_WORLDS: 'database:search-worlds',
  CLEAR_ALL_DATA: 'database:clear-all-data',
  EXPORT_DATA: 'database:export-data',
  IMPORT_DATA: 'database:import-data',
  
  // 连接管理
  CLOSE_DATABASE: 'database:close'
} as const

/**
 * 注册数据库相关的IPC处理器
 */
export function registerDatabaseHandlers(): void {
  // 世界观基础操作
  ipcMain.handle(DATABASE_CHANNELS.CREATE_WORLD, async (_event, worldData: Omit<WorldData, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      return await mainDatabaseService.createWorld(worldData)
    } catch (error) {
      console.error('创建世界观失败:', error)
      throw error
    }
  })

  ipcMain.handle(DATABASE_CHANNELS.GET_WORLD_LIST, async (_event) => {
    try {
      return await mainDatabaseService.getWorldList()
    } catch (error) {
      console.error('获取世界观列表失败:', error)
      throw error
    }
  })

  ipcMain.handle(DATABASE_CHANNELS.GET_WORLD, async (_event, id: string) => {
    try {
      return await mainDatabaseService.getWorld(id)
    } catch (error) {
      console.error('获取世界观失败:', error)
      throw error
    }
  })

  ipcMain.handle(DATABASE_CHANNELS.UPDATE_WORLD, async (_event, id: string, updates: Partial<WorldData>) => {
    try {
      return await mainDatabaseService.updateWorld(id, updates)
    } catch (error) {
      console.error('更新世界观失败:', error)
      throw error
    }
  })

  ipcMain.handle(DATABASE_CHANNELS.DELETE_WORLD, async (_event, id: string) => {
    try {
      return await mainDatabaseService.deleteWorld(id)
    } catch (error) {
      console.error('删除世界观失败:', error)
      throw error
    }
  })

  // 世界观内容操作
  ipcMain.handle(DATABASE_CHANNELS.SAVE_WORLD_CONTENT, async (_event, worldContent: UnifiedWorldData) => {
    try {
      return await mainDatabaseService.saveWorldContent(worldContent)
    } catch (error) {
      console.error('保存世界观内容失败:', error)
      throw error
    }
  })

  ipcMain.handle(DATABASE_CHANNELS.GET_WORLD_CONTENT, async (_event, id: string) => {
    try {
      return await mainDatabaseService.getWorldContent(id)
    } catch (error) {
      console.error('获取世界观内容失败:', error)
      throw error
    }
  })

  // 最近文件操作
  ipcMain.handle(DATABASE_CHANNELS.ADD_RECENT_FILE, async (_event, file: RecentFile) => {
    try {
      return await mainDatabaseService.addRecentFile(file)
    } catch (error) {
      console.error('添加最近文件失败:', error)
      throw error
    }
  })

  ipcMain.handle(DATABASE_CHANNELS.GET_RECENT_FILES, async (_event) => {
    try {
      return await mainDatabaseService.getRecentFiles()
    } catch (error) {
      console.error('获取最近文件失败:', error)
      throw error
    }
  })

  ipcMain.handle(DATABASE_CHANNELS.REMOVE_RECENT_FILE, async (_event, id: string) => {
    try {
      return await mainDatabaseService.removeRecentFile(id)
    } catch (error) {
      console.error('删除最近文件失败:', error)
      throw error
    }
  })

  // 搜索功能
  ipcMain.handle(DATABASE_CHANNELS.SEARCH_WORLDS, async (_event, query: string) => {
    try {
      return await mainDatabaseService.searchWorlds(query)
    } catch (error) {
      console.error('搜索世界观失败:', error)
      throw error
    }
  })

  // 数据库维护
  ipcMain.handle(DATABASE_CHANNELS.CLEAR_ALL_DATA, async (_event) => {
    try {
      return await mainDatabaseService.clearAllData()
    } catch (error) {
      console.error('清空数据失败:', error)
      throw error
    }
  })

  ipcMain.handle(DATABASE_CHANNELS.EXPORT_DATA, async (_event) => {
    try {
      return await mainDatabaseService.exportData()
    } catch (error) {
      console.error('导出数据失败:', error)
      throw error
    }
  })

  ipcMain.handle(DATABASE_CHANNELS.IMPORT_DATA, async (_event, data: any) => {
    try {
      return await mainDatabaseService.importData(data)
    } catch (error) {
      console.error('导入数据失败:', error)
      throw error
    }
  })

  // 连接管理
  ipcMain.handle(DATABASE_CHANNELS.CLOSE_DATABASE, async (_event) => {
    try {
      return await mainDatabaseService.close()
    } catch (error) {
      console.error('关闭数据库失败:', error)
      throw error
    }
  })

  console.log('数据库IPC处理器已注册')
}

/**
 * 移除数据库相关的IPC处理器
 */
export function unregisterDatabaseHandlers(): void {
  Object.values(DATABASE_CHANNELS).forEach(channel => {
    ipcMain.removeAllListeners(channel)
  })
  console.log('数据库IPC处理器已移除')
}