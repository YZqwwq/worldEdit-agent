import type { 
  WorldData, 
  UnifiedWorldData, 
  RecentFile 
} from '../../../shared/types/world'

// IPC 通道常量（与主进程保持一致）
const DATABASE_CHANNELS = {
  CREATE_WORLD: 'database:create-world',
  GET_WORLD_LIST: 'database:get-world-list',
  GET_WORLD: 'database:get-world',
  UPDATE_WORLD: 'database:update-world',
  DELETE_WORLD: 'database:delete-world',
  SAVE_WORLD_CONTENT: 'database:save-world-content',
  GET_WORLD_CONTENT: 'database:get-world-content',
  ADD_RECENT_FILE: 'database:add-recent-file',
  GET_RECENT_FILES: 'database:get-recent-files',
  REMOVE_RECENT_FILE: 'database:remove-recent-file',
  SEARCH_WORLDS: 'database:search-worlds',
  CLEAR_ALL_DATA: 'database:clear-all-data',
  EXPORT_DATA: 'database:export-data',
  IMPORT_DATA: 'database:import-data',
  CLOSE_DATABASE: 'database:close'
} as const

/**
 * 渲染进程数据库客户端
 * 通过IPC与主进程的数据库服务通信
 */
export class DatabaseClient {
  private initialized = false

  /**
   * 初始化数据库客户端
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }
    
    // 渲染进程不需要特殊初始化，主进程会自动处理数据库连接
    this.initialized = true
    console.log('数据库客户端已初始化')
  }

  /**
   * 检查是否在Electron环境中运行
   */
  private isElectronEnvironment(): boolean {
    return typeof window !== 'undefined' && window.electron && window.electron.ipcRenderer
  }

  /**
   * 调用主进程IPC方法的通用包装器
   */
  private async invoke<T>(channel: string, ...args: any[]): Promise<T> {
    if (!this.isElectronEnvironment()) {
      console.warn(`在浏览器环境中调用 [${channel}]，返回模拟数据`)
      return this.getMockData<T>(channel, ...args)
    }
    
    try {
      return await window.electron.ipcRenderer.invoke(channel, ...args)
    } catch (error) {
      console.error(`IPC调用失败 [${channel}]:`, error)
      throw error
    }
  }

  /**
   * 为浏览器环境提供模拟数据
   */
  private getMockData<T>(channel: string, ...args: any[]): T {
    switch (channel) {
      case DATABASE_CHANNELS.GET_WORLD_LIST:
        return [] as T
      case DATABASE_CHANNELS.GET_RECENT_FILES:
        return [] as T
      case DATABASE_CHANNELS.GET_WORLD:
      case DATABASE_CHANNELS.GET_WORLD_CONTENT:
        return undefined as T
      case DATABASE_CHANNELS.CREATE_WORLD:
        return {
          id: 'mock-' + Date.now(),
          name: args[0]?.name || '模拟世界观',
          description: args[0]?.description || '浏览器环境模拟数据',
          tags: args[0]?.tags || ['模拟'],
          author: args[0]?.author || '系统',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastModified: new Date(),
          version: '1.0.0'
        } as T
      case DATABASE_CHANNELS.SEARCH_WORLDS:
        return [] as T
      case DATABASE_CHANNELS.EXPORT_DATA:
        return { worlds: [], characters: [], maps: [], relationships: [], recentFiles: [] } as T
      default:
        return undefined as T
    }
  }

  // 世界观基础操作
  async createWorld(worldData: Omit<WorldData, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorldData> {
    return await this.invoke<WorldData>(DATABASE_CHANNELS.CREATE_WORLD, worldData)
  }

  async getWorldList(): Promise<WorldData[]> {
    return await this.invoke<WorldData[]>(DATABASE_CHANNELS.GET_WORLD_LIST)
  }

  async getWorld(id: string): Promise<WorldData | undefined> {
    return await this.invoke<WorldData | undefined>(DATABASE_CHANNELS.GET_WORLD, id)
  }

  async updateWorld(id: string, updates: Partial<WorldData>): Promise<void> {
    return await this.invoke<void>(DATABASE_CHANNELS.UPDATE_WORLD, id, updates)
  }

  async deleteWorld(id: string): Promise<void> {
    return await this.invoke<void>(DATABASE_CHANNELS.DELETE_WORLD, id)
  }

  // 完整世界观内容操作
  async saveWorldContent(worldContent: UnifiedWorldData): Promise<void> {
    return await this.invoke<void>(DATABASE_CHANNELS.SAVE_WORLD_CONTENT, worldContent)
  }

  async getWorldContent(id: string): Promise<UnifiedWorldData | undefined> {
    return await this.invoke<UnifiedWorldData | undefined>(DATABASE_CHANNELS.GET_WORLD_CONTENT, id)
  }

  // 最近文件操作
  async addRecentFile(file: RecentFile): Promise<void> {
    return await this.invoke<void>(DATABASE_CHANNELS.ADD_RECENT_FILE, file)
  }

  async getRecentFiles(): Promise<RecentFile[]> {
    return await this.invoke<RecentFile[]>(DATABASE_CHANNELS.GET_RECENT_FILES)
  }

  async removeRecentFile(id: string): Promise<void> {
    return await this.invoke<void>(DATABASE_CHANNELS.REMOVE_RECENT_FILE, id)
  }

  // 搜索功能
  async searchWorlds(query: string): Promise<WorldData[]> {
    return await this.invoke<WorldData[]>(DATABASE_CHANNELS.SEARCH_WORLDS, query)
  }

  // 数据库维护
  async clearAllData(): Promise<void> {
    return await this.invoke<void>(DATABASE_CHANNELS.CLEAR_ALL_DATA)
  }

  async exportData(): Promise<any> {
    return await this.invoke<any>(DATABASE_CHANNELS.EXPORT_DATA)
  }

  async importData(data: any): Promise<void> {
    return await this.invoke<void>(DATABASE_CHANNELS.IMPORT_DATA, data)
  }

  // 关闭数据库连接
  async close(): Promise<void> {
    return await this.invoke<void>(DATABASE_CHANNELS.CLOSE_DATABASE)
  }
}

// 导出数据库客户端实例
export const databaseClient = new DatabaseClient()

// 兼容性接口：保持与原有DatabaseService相同的接口
export class DatabaseService {
  private client: DatabaseClient

  constructor() {
    this.client = databaseClient
  }

  async initialize(): Promise<void> {
    return await this.client.initialize()
  }

  async createWorld(worldData: Omit<WorldData, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorldData> {
    return await this.client.createWorld(worldData)
  }

  async getWorldList(): Promise<WorldData[]> {
    return await this.client.getWorldList()
  }

  async getWorld(id: string): Promise<WorldData | undefined> {
    return await this.client.getWorld(id)
  }

  async updateWorld(id: string, updates: Partial<WorldData>): Promise<void> {
    return await this.client.updateWorld(id, updates)
  }

  async deleteWorld(id: string): Promise<void> {
    return await this.client.deleteWorld(id)
  }

  async saveWorldContent(worldContent: UnifiedWorldData): Promise<void> {
    return await this.client.saveWorldContent(worldContent)
  }

  async getWorldContent(id: string): Promise<UnifiedWorldData | undefined> {
    return await this.client.getWorldContent(id)
  }

  async addRecentFile(file: RecentFile): Promise<void> {
    return await this.client.addRecentFile(file)
  }

  async getRecentFiles(): Promise<RecentFile[]> {
    return await this.client.getRecentFiles()
  }

  async removeRecentFile(id: string): Promise<void> {
    return await this.client.removeRecentFile(id)
  }

  async searchWorlds(query: string): Promise<WorldData[]> {
    return await this.client.searchWorlds(query)
  }

  async clearAllData(): Promise<void> {
    return await this.client.clearAllData()
  }

  async exportData(): Promise<any> {
    return await this.client.exportData()
  }

  async importData(data: any): Promise<void> {
    return await this.client.importData(data)
  }
}

// 导出兼容性实例
export const databaseService = new DatabaseService()