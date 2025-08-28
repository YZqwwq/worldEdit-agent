import type { 
  BaseMetadata,
  UnifiedWorldData, 
  GeographyData,
  NationData,
  FactionData,
  PowerSystemData,
  CharacterData,
  MapData,
  RelationshipData
} from '../../../shared/types/world'
import type { RecentFile } from '../../../shared/entities'

// TypeORM IPC 通道常量（与主进程保持一致）
const TYPEORM_DATABASE_CHANNELS = {
  // 世界观操作
  CREATE_WORLD: 'typeorm-database:create-world',
  GET_WORLD_LIST: 'typeorm-database:get-world-list',
  GET_WORLD: 'typeorm-database:get-world',
  UPDATE_WORLD: 'typeorm-database:update-world',
  DELETE_WORLD: 'typeorm-database:delete-world',
  
  // 世界观内容操作
  SAVE_WORLD_CONTENT: 'typeorm-database:save-world-content',
  GET_WORLD_CONTENT: 'typeorm-database:get-world-content',
  
  // 地理位置操作
  SAVE_GEOGRAPHY: 'typeorm-database:save-geography',
  GET_GEOGRAPHIES: 'typeorm-database:get-geographies',
  DELETE_GEOGRAPHY: 'typeorm-database:delete-geography',
  
  // 国家操作
  SAVE_NATION: 'typeorm-database:save-nation',
  GET_NATIONS: 'typeorm-database:get-nations',
  DELETE_NATION: 'typeorm-database:delete-nation',
  
  // 派系操作
  SAVE_FACTION: 'typeorm-database:save-faction',
  GET_FACTIONS: 'typeorm-database:get-factions',
  DELETE_FACTION: 'typeorm-database:delete-faction',
  
  // 力量体系操作
  SAVE_POWER_SYSTEM: 'typeorm-database:save-power-system',
  GET_POWER_SYSTEMS: 'typeorm-database:get-power-systems',
  DELETE_POWER_SYSTEM: 'typeorm-database:delete-power-system',
  
  // 角色操作
  SAVE_CHARACTER: 'typeorm-database:save-character',
  GET_CHARACTERS: 'typeorm-database:get-characters',
  DELETE_CHARACTER: 'typeorm-database:delete-character',
  
  // 地图操作
  SAVE_MAP: 'typeorm-database:save-map',
  GET_MAPS: 'typeorm-database:get-maps',
  DELETE_MAP: 'typeorm-database:delete-map',
  
  // 关系操作
  SAVE_RELATIONSHIP: 'typeorm-database:save-relationship',
  GET_RELATIONSHIPS: 'typeorm-database:get-relationships',
  GET_ENTITY_RELATIONSHIPS: 'typeorm-database:get-entity-relationships',
  DELETE_RELATIONSHIP: 'typeorm-database:delete-relationship',
  
  // 最近文件操作
  ADD_RECENT_FILE: 'typeorm-database:add-recent-file',
  GET_RECENT_FILES: 'typeorm-database:get-recent-files',
  CLEAR_RECENT_FILES: 'typeorm-database:clear-recent-files',
  
  // 批量操作
  SAVE_WORLD_WITH_CONTENT: 'typeorm-database:save-world-with-content',
  DELETE_WORLD_WITH_CONTENT: 'typeorm-database:delete-world-with-content',
  
  // 系统操作
  HEALTH_CHECK: 'typeorm-database:health-check',
  CLOSE_DATABASE: 'typeorm-database:close'
} as const

/**
 * TypeORM渲染进程数据库客户端
 * 通过IPC与主进程的TypeORM服务通信
 */
export class TypeORMClient {
  private initialized = false

  /**
   * 初始化TypeORM客户端
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }
    
    // 检查TypeORM服务健康状态
    try {
      await this.invoke<boolean>(TYPEORM_DATABASE_CHANNELS.HEALTH_CHECK)
      this.initialized = true
      console.log('TypeORM客户端已初始化')
    } catch (error) {
      console.error('TypeORM服务初始化失败:', error)
      throw error
    }
  }

  /**
   * 检查是否在Electron环境中运行
   */
  private isElectronEnvironment(): boolean {
    return typeof window !== 'undefined' && 
           window.electron && 
           typeof window.electron.ipcRenderer !== 'undefined'
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
      console.error(`TypeORM IPC调用失败 [${channel}]:`, error)
      throw error
    }
  }

  /**
   * 为浏览器环境提供模拟数据
   */
  private getMockData<T>(channel: string, ...args: any[]): T {
    switch (channel) {
      case TYPEORM_DATABASE_CHANNELS.GET_WORLD_LIST:
        return [] as T
      case TYPEORM_DATABASE_CHANNELS.GET_RECENT_FILES:
        return [] as T
      case TYPEORM_DATABASE_CHANNELS.GET_WORLD:
      case TYPEORM_DATABASE_CHANNELS.GET_WORLD_CONTENT:
        return undefined as T
      case TYPEORM_DATABASE_CHANNELS.CREATE_WORLD:
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
      case TYPEORM_DATABASE_CHANNELS.HEALTH_CHECK:
        return true as T
      default:
        return undefined as T
    }
  }

  // ==================== 世界观基础操作 ====================
  
  /**
   * 创建世界观
   */
  async createWorld(worldData: BaseMetadata): Promise<BaseMetadata> {
    return await this.invoke<BaseMetadata>(TYPEORM_DATABASE_CHANNELS.CREATE_WORLD, worldData)
  }

  /**
   * 获取世界观列表
   */
  async getWorldList(): Promise<BaseMetadata[]> {
    return await this.invoke<BaseMetadata[]>(TYPEORM_DATABASE_CHANNELS.GET_WORLD_LIST)
  }

  /**
   * 获取单个世界观
   */
  async getWorld(id: string): Promise<BaseMetadata | undefined> {
    return await this.invoke<BaseMetadata | undefined>(TYPEORM_DATABASE_CHANNELS.GET_WORLD, id)
  }

  /**
   * 更新世界观
   */
  async updateWorld(id: string, updates: Partial<BaseMetadata>): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.UPDATE_WORLD, id, updates)
  }

  /**
   * 删除世界观
   */
  async deleteWorld(id: string): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.DELETE_WORLD, id)
  }

  // ==================== 世界观内容操作 ====================
  
  /**
   * 保存完整世界观内容
   */
  async saveWorldContent(worldContent: UnifiedWorldData): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.SAVE_WORLD_CONTENT, worldContent)
  }

  /**
   * 获取完整世界观内容
   */
  async getWorldContent(id: string): Promise<UnifiedWorldData | undefined> {
    return await this.invoke<UnifiedWorldData | undefined>(TYPEORM_DATABASE_CHANNELS.GET_WORLD_CONTENT, id)
  }

  // ==================== 地理位置操作 ====================
  
  /**
   * 保存地理位置
   */
  async saveGeography(geography: GeographyData): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.SAVE_GEOGRAPHY, geography)
  }

  /**
   * 获取世界观的所有地理位置
   */
  async getGeographies(worldId: string): Promise<GeographyData[]> {
    return await this.invoke<GeographyData[]>(TYPEORM_DATABASE_CHANNELS.GET_GEOGRAPHIES, worldId)
  }

  /**
   * 删除地理位置
   */
  async deleteGeography(id: string): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.DELETE_GEOGRAPHY, id)
  }

  // ==================== 国家操作 ====================
  
  /**
   * 保存国家
   */
  async saveNation(nation: NationData): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.SAVE_NATION, nation)
  }

  /**
   * 获取世界观的所有国家
   */
  async getNations(worldId: string): Promise<NationData[]> {
    return await this.invoke<NationData[]>(TYPEORM_DATABASE_CHANNELS.GET_NATIONS, worldId)
  }

  /**
   * 删除国家
   */
  async deleteNation(id: string): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.DELETE_NATION, id)
  }

  // ==================== 派系操作 ====================
  
  /**
   * 保存派系
   */
  async saveFaction(faction: FactionData): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.SAVE_FACTION, faction)
  }

  /**
   * 获取世界观的所有派系
   */
  async getFactions(worldId: string): Promise<FactionData[]> {
    return await this.invoke<FactionData[]>(TYPEORM_DATABASE_CHANNELS.GET_FACTIONS, worldId)
  }

  /**
   * 删除派系
   */
  async deleteFaction(id: string): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.DELETE_FACTION, id)
  }

  // ==================== 力量体系操作 ====================
  
  /**
   * 保存力量体系
   */
  async savePowerSystem(powerSystem: PowerSystemData): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.SAVE_POWER_SYSTEM, powerSystem)
  }

  /**
   * 获取世界观的所有力量体系
   */
  async getPowerSystems(worldId: string): Promise<PowerSystemData[]> {
    return await this.invoke<PowerSystemData[]>(TYPEORM_DATABASE_CHANNELS.GET_POWER_SYSTEMS, worldId)
  }

  /**
   * 删除力量体系
   */
  async deletePowerSystem(id: string): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.DELETE_POWER_SYSTEM, id)
  }

  // ==================== 角色操作 ====================
  
  /**
   * 保存角色
   */
  async saveCharacter(character: CharacterData): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.SAVE_CHARACTER, character)
  }

  /**
   * 获取世界观的所有角色
   */
  async getCharacters(worldId: string): Promise<CharacterData[]> {
    return await this.invoke<CharacterData[]>(TYPEORM_DATABASE_CHANNELS.GET_CHARACTERS, worldId)
  }

  /**
   * 删除角色
   */
  async deleteCharacter(id: string): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.DELETE_CHARACTER, id)
  }

  // ==================== 地图操作 ====================
  
  /**
   * 保存地图
   */
  async saveMap(map: MapData): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.SAVE_MAP, map)
  }

  /**
   * 获取世界观的所有地图
   */
  async getMaps(worldId: string): Promise<MapData[]> {
    return await this.invoke<MapData[]>(TYPEORM_DATABASE_CHANNELS.GET_MAPS, worldId)
  }

  /**
   * 删除地图
   */
  async deleteMap(id: string): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.DELETE_MAP, id)
  }

  // ==================== 关系操作 ====================
  
  /**
   * 保存关系
   */
  async saveRelationship(relationship: RelationshipData): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.SAVE_RELATIONSHIP, relationship)
  }

  /**
   * 获取世界观的所有关系
   */
  async getRelationships(worldId: string): Promise<RelationshipData[]> {
    return await this.invoke<RelationshipData[]>(TYPEORM_DATABASE_CHANNELS.GET_RELATIONSHIPS, worldId)
  }

  /**
   * 获取实体的关系
   */
  async getEntityRelationships(entityId: string, entityType: string): Promise<RelationshipData[]> {
    return await this.invoke<RelationshipData[]>(TYPEORM_DATABASE_CHANNELS.GET_ENTITY_RELATIONSHIPS, entityId, entityType)
  }

  /**
   * 删除关系
   */
  async deleteRelationship(id: string): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.DELETE_RELATIONSHIP, id)
  }

  // ==================== 最近文件操作 ====================
  
  /**
   * 添加最近文件
   */
  async addRecentFile(file: RecentFile): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.ADD_RECENT_FILE, file)
  }

  /**
   * 获取最近文件列表
   */
  async getRecentFiles(): Promise<RecentFile[]> {
    return await this.invoke<RecentFile[]>(TYPEORM_DATABASE_CHANNELS.GET_RECENT_FILES)
  }

  /**
   * 清空最近文件
   */
  async clearRecentFiles(): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.CLEAR_RECENT_FILES)
  }

  // ==================== 批量操作 ====================
  
  /**
   * 保存世界观及其内容（批量操作）
   */
  async saveWorldWithContent(worldData: BaseMetadata, content: UnifiedWorldData): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.SAVE_WORLD_WITH_CONTENT, worldData, content)
  }

  /**
   * 删除世界观及其所有内容（批量操作）
   */
  async deleteWorldWithContent(worldId: string): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.DELETE_WORLD_WITH_CONTENT, worldId)
  }

  // ==================== 系统操作 ====================
  
  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    return await this.invoke<boolean>(TYPEORM_DATABASE_CHANNELS.HEALTH_CHECK)
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    return await this.invoke<void>(TYPEORM_DATABASE_CHANNELS.CLOSE_DATABASE)
  }

  // ==================== 兼容性方法 ====================
  
  /**
   * 兼容性方法：清空所有数据
   */
  async clearAllData(): Promise<void> {
    // TypeORM版本暂时不实现此方法，可以通过删除所有世界观来实现
    const worlds = await this.getWorldList()
    for (const world of worlds) {
      await this.deleteWorldWithContent(world.id)
    }
    await this.clearRecentFiles()
  }

  /**
   * 兼容性别名
   */
  async clear(): Promise<void> {
    return await this.clearAllData()
  }

  /**
   * 搜索世界观（基于名称和描述）
   */
  async searchWorlds(query: string): Promise<BaseMetadata[]> {
    const worlds = await this.getWorldList()
    const lowerQuery = query.toLowerCase()
    return worlds.filter(world => 
      world.name.toLowerCase().includes(lowerQuery) ||
      world.description?.toLowerCase().includes(lowerQuery) ||
      world.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    )
  }

  /**
   * 导出数据（简化版本）
   */
  async exportData(): Promise<any> {
    const worlds = await this.getWorldList()
    const recentFiles = await this.getRecentFiles()
    
    const exportData = {
      worlds,
      recentFiles,
      exportDate: new Date().toISOString(),
      version: '2.0.0-typeorm'
    }
    
    return exportData
  }

  /**
   * 导入数据（简化版本）
   */
  async importData(data: any): Promise<void> {
    if (data.worlds && Array.isArray(data.worlds)) {
      for (const world of data.worlds) {
        await this.createWorld(world)
      }
    }
    
    if (data.recentFiles && Array.isArray(data.recentFiles)) {
      for (const file of data.recentFiles) {
        await this.addRecentFile(file)
      }
    }
  }
}

// 导出TypeORM客户端实例
export const typeormClient = new TypeORMClient()

// 兼容性服务类
export class TypeORMService {
  private client: TypeORMClient

  constructor() {
    this.client = typeormClient
  }

  async initialize(): Promise<void> {
    return await this.client.initialize()
  }

  // 世界观操作
  async createWorld(worldData: Omit<BaseMetadata, 'id' | 'createdAt' | 'updatedAt'>): Promise<BaseMetadata> {
    const fullWorldData: BaseMetadata = {
      ...worldData,
      id: 'world-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      createdAt: new Date(),
      updatedAt: new Date()
    }
    return await this.client.createWorld(fullWorldData)
  }

  async getWorldList(): Promise<BaseMetadata[]> {
    return await this.client.getWorldList()
  }

  async getWorld(id: string): Promise<BaseMetadata | undefined> {
    return await this.client.getWorld(id)
  }

  async updateWorld(id: string, updates: Partial<BaseMetadata>): Promise<void> {
    return await this.client.updateWorld(id, { ...updates, updatedAt: new Date() })
  }

  async deleteWorld(id: string): Promise<void> {
    return await this.client.deleteWorld(id)
  }

  // 世界观内容操作
  async saveWorldContent(worldContent: UnifiedWorldData): Promise<void> {
    return await this.client.saveWorldContent(worldContent)
  }

  async getWorldContent(id: string): Promise<UnifiedWorldData | undefined> {
    return await this.client.getWorldContent(id)
  }

  // 最近文件操作
  async addRecentFile(file: RecentFile): Promise<void> {
    return await this.client.addRecentFile(file)
  }

  async getRecentFiles(): Promise<RecentFile[]> {
    return await this.client.getRecentFiles()
  }

  async removeRecentFile(id: string): Promise<void> {
    // TypeORM版本中没有单独删除最近文件的方法，可以通过清空后重新添加其他文件来实现
    console.warn('removeRecentFile 在TypeORM版本中暂未实现')
  }

  // 搜索功能
  async searchWorlds(query: string): Promise<BaseMetadata[]> {
    return await this.client.searchWorlds(query)
  }

  // 数据库维护
  async clearAllData(): Promise<void> {
    return await this.client.clearAllData()
  }

  async clear(): Promise<void> {
    return await this.client.clear()
  }

  async exportData(): Promise<any> {
    return await this.client.exportData()
  }

  async importData(data: any): Promise<void> {
    return await this.client.importData(data)
  }

  async close(): Promise<void> {
    return await this.client.close()
  }
}

// 导出兼容性实例
export const typeormService = new TypeORMService()