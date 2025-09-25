import { typeormClient, typeormService } from '../Client/world-ORMClient'
import type { 
  World ,
  WorldContent,
  Geography,
  Nation,
  Faction,
  PowerSystem,
  Character,
  Map,
  Relationship
} from '../../../../shared/entities'
import { RecentFile as RecentFileData } from '../../../../shared/entities'

/**
 * TypeORM数据库服务
 * 提供与原DatabaseService兼容的接口，内部使用TypeORM实现
 */
class TypeORMDatabaseService {
  private initialized = false

  /**
   * 初始化数据库服务
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }
    
    try {
      await typeormService.initialize()
      this.initialized = true
      console.log('TypeORM数据库服务已初始化')
    } catch (error) {
      console.error('TypeORM数据库服务初始化失败:', error)
      throw error
    }
  }

  /**
   * 确保服务已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  // ==================== 世界观基础操作 ====================
  
  /**
   * 创建世界观
   */
  async createWorld(worldData: Omit<World, 'id' | 'createdAt' | 'updatedAt'>): Promise<World> {
    await this.ensureInitialized()
    return await typeormService.createWorld(worldData)
  }

  /**
   * 获取世界观列表
   */
  async getWorldList(): Promise<World[]> {
    await this.ensureInitialized()
    return await typeormService.getWorldList()
  }

  /**
   * 获取单个世界观
   */
  async getWorld(id: string): Promise<World | undefined> {
    await this.ensureInitialized()
    return await typeormService.getWorld(id)
  }

  /**
   * 更新世界观
   */
  async updateWorld(id: string, updates: Partial<World>): Promise<void> {
    await this.ensureInitialized()
    return await typeormService.updateWorld(id, updates)
  }

  /**
   * 删除世界观
   */
  async deleteWorld(id: string): Promise<void> {
    await this.ensureInitialized()
    return await typeormService.deleteWorld(id)
  }

  /**
   * 加载世界观（兼容性方法）
   */
  async loadWorld(id: string): Promise<World | undefined> {
    return await this.getWorld(id)
  }

  // ==================== 世界观内容操作 ====================
  
  /**
   * 保存完整世界观内容
   */
  async saveWorldContent(worldContent: WorldContent): Promise<void> {
    await this.ensureInitialized()
    return await typeormService.saveWorldContent(worldContent)
  }

  /**
   * 获取完整世界观内容
   */
  async getWorldContent(id: string): Promise<WorldContent | undefined> {
    await this.ensureInitialized()
    return await typeormService.getWorldContent(id)
  }

  /**
   * 加载世界观内容（兼容性方法）
   */
  async loadWorldContent(id: string): Promise<WorldContent | undefined> {
    return await this.getWorldContent(id)
  }

  // ==================== 地理位置操作 ====================
  
  /**
   * 保存地理位置
   */
  async saveGeography(geography: Geography): Promise<void> {
    await this.ensureInitialized()
    return await typeormClient.saveGeography(geography)
  }

  /**
   * 获取世界观的所有地理位置
   */
  async getGeographies(worldId: string): Promise<Geography[]> {
    await this.ensureInitialized()
    return await typeormClient.getGeographies(worldId)
  }

  /**
   * 删除地理位置
   */
  async deleteGeography(id: string): Promise<void> {
    await this.ensureInitialized()
    return await typeormClient.deleteGeography(id)
  }

  // ==================== 国家操作 ====================
  
  /**
   * 保存国家
   */
  async saveNation(nation: Nation ): Promise<void> {
    await this.ensureInitialized()
    return await typeormClient.saveNation(nation)
  }

  /**
   * 获取世界观的所有国家
   */
  async getNations(worldId: string): Promise<Nation []> {
    await this.ensureInitialized()
    return await typeormClient.getNations(worldId)
  }

  /**
   * 删除国家
   */
  async deleteNation(id: string): Promise<void> {
    await this.ensureInitialized()
    return await typeormClient.deleteNation(id)
  }

  // ==================== 派系操作 ====================
  
  /**
   * 保存派系
   */
  async saveFaction(faction: Faction): Promise<void> {
    await this.ensureInitialized()
    return await typeormClient.saveFaction(faction)
  }

  /**
   * 获取世界观的所有派系
   */
  async getFactions(worldId: string): Promise<Faction[]> {
    await this.ensureInitialized()
    return await typeormClient.getFactions(worldId)
  }

  /**
   * 删除派系
   */
  async deleteFaction(id: string): Promise<void> {
    await this.ensureInitialized()
    return await typeormClient.deleteFaction(id)
  }

  // ==================== 力量体系操作 ====================
  
  /**
   * 保存力量体系
   */
  async savePowerSystem(powerSystem: PowerSystem): Promise<void> {
    await this.ensureInitialized()
    return await typeormClient.savePowerSystem(powerSystem)
  }

  /**
   * 获取世界观的所有力量体系
   */
  async getPowerSystems(worldId: string): Promise<PowerSystem[]> {
    await this.ensureInitialized()
    return await typeormClient.getPowerSystems(worldId)
  }

  /**
   * 删除力量体系
   */
  async deletePowerSystem(id: string): Promise<void> {
    await this.ensureInitialized()
    return await typeormClient.deletePowerSystem(id)
  }

  // ==================== 角色操作 ====================
  
  /**
   * 保存角色
   */
  async saveCharacter(character: Character): Promise<void> {
    await this.ensureInitialized()
    return await typeormClient.saveCharacter(character)
  }

  /**
   * 获取世界观的所有角色
   */
  async getCharacters(worldId: string): Promise<Character[]> {
    await this.ensureInitialized()
    return await typeormClient.getCharacters(worldId)
  }

  /**
   * 删除角色
   */
  async deleteCharacter(id: string): Promise<void> {
    await this.ensureInitialized()
    return await typeormClient.deleteCharacter(id)
  }

  // ==================== 地图操作 ====================
  
  /**
   * 保存地图
   */
  async saveMap(map: Map): Promise<void> {
    await this.ensureInitialized()
    return await typeormClient.saveMap(map)
  }

  /**
   * 获取世界观的所有地图
   */
  async getMaps(worldId: string): Promise<Map[]> {
    await this.ensureInitialized()
    return await typeormClient.getMaps(worldId)
  }

  /**
   * 删除地图
   */
  async deleteMap(id: string): Promise<void> {
    await this.ensureInitialized()
    return await typeormClient.deleteMap(id)
  }

  // ==================== 关系操作 ====================
  
  /**
   * 保存关系
   */
  async saveRelationship(relationship: Relationship ): Promise<void> {
    await this.ensureInitialized()
    return await typeormClient.saveRelationship(relationship)
  }

  /**
   * 获取世界观的所有关系
   */
  async getRelationships(worldId: string): Promise<Relationship []> {
    await this.ensureInitialized()
    return await typeormClient.getRelationships(worldId)
  }

  /**
   * 获取实体的关系
   */
  async getEntityRelationships(entityId: string, entityType: string): Promise<Relationship []> {
    await this.ensureInitialized()
    return await typeormClient.getEntityRelationships(entityId, entityType)
  }

  /**
   * 删除关系
   */
  async deleteRelationship(id: string): Promise<void> {
    await this.ensureInitialized()
    return await typeormClient.deleteRelationship(id)
  }

  // ==================== 最近文件操作 ====================
  
  /**
   * 添加最近文件
   */
  async addRecentFile(file: Omit<RecentFileData, 'id' | 'lastOpened' | 'createdAt' | 'updatedAt'>): Promise<void> {
    await this.ensureInitialized()
    return await typeormService.addRecentFile(file)
  }

  /**
   * 获取最近文件列表
   */
  async getRecentFiles(): Promise<RecentFileData[]> {
    await this.ensureInitialized()
    return await typeormService.getRecentFiles()
  }

  /**
   * 删除最近文件
   */
  async removeRecentFile(id: string): Promise<void> {
    await this.ensureInitialized()
    return await typeormService.removeRecentFile(id)
  }

  /**
   * 清空最近文件
   */
  async clearRecentFiles(): Promise<void> {
    await this.ensureInitialized()
    return await typeormClient.clearRecentFiles()
  }

  // ==================== 搜索功能 ====================
  
  /**
   * 搜索世界观
   */
  async searchWorlds(query: string): Promise<World[]> {
    await this.ensureInitialized()
    return await typeormService.searchWorlds(query)
  }

  /**
   * 搜索（兼容性方法）
   */
  async search(query: string): Promise<World[]> {
    return await this.searchWorlds(query)
  }

  // ==================== 数据库维护 ====================
  
  /**
   * 清空所有数据
   */
  async clearAllData(): Promise<void> {
    await this.ensureInitialized()
    return await typeormService.clearAllData()
  }

  /**
   * 清空数据（兼容性方法）
   */
  async clear(): Promise<void> {
    return await this.clearAllData()
  }

  /**
   * 导出数据
   */
  async exportData(): Promise<any> {
    await this.ensureInitialized()
    return await typeormService.exportData()
  }

  /**
   * 导入数据
   */
  async importData(data: any): Promise<void> {
    await this.ensureInitialized()
    return await typeormService.importData(data)
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    if (this.initialized) {
      await typeormService.close()
      this.initialized = false
    }
  }

  // ==================== 验证功能 ====================
  
  /**
   * 验证世界观数据
   */
  async validateWorld(worldData: World): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []
    
    if (!worldData.name || worldData.name.trim() === '') {
      errors.push('世界观名称不能为空')
    }
    
    if (!worldData.description || worldData.description.trim() === '') {
      errors.push('世界观描述不能为空')
    }
    
    if (!worldData.author || worldData.author.trim() === '') {
      errors.push('作者信息不能为空')
    }
    
    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * 验证世界观内容数据
   */
  async validateWorldContent(content: WorldContent): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []
    
    if (!content.id) {
      errors.push('世界观ID不能为空')
    }
    
    // 可以添加更多验证逻辑
    
    return {
      valid: errors.length === 0,
      errors
    }
  }

  // ==================== 批量操作 ====================
  
  /**
   * 批量保存世界观及其内容
   */
  async saveWorldWithContent(worldData: World, content: WorldContent): Promise<void> {
    await this.ensureInitialized()
    return await typeormClient.saveWorldWithContent(worldData, content)
  }

  /**
   * 批量删除世界观及其所有内容
   */
  async deleteWorldWithContent(worldId: string): Promise<void> {
    await this.ensureInitialized()
    return await typeormClient.deleteWorldWithContent(worldId)
  }

  // ==================== 统计信息 ====================
  
  /**
   * 获取数据库统计信息
   */
  async getStatistics(): Promise<{
    worldCount: number
    recentFileCount: number
    totalGeographies: number
    totalNations: number
    totalFactions: number
    totalCharacters: number
    totalMaps: number
    totalRelationships: number
  }> {
    await this.ensureInitialized()
    
    const worlds = await this.getWorldList()
    const recentFiles = await this.getRecentFiles()
    
    let totalGeographies = 0
    let totalNations = 0
    let totalFactions = 0
    let totalCharacters = 0
    let totalMaps = 0
    let totalRelationships = 0
    
    // 统计所有世界观的内容数量
    for (const world of worlds) {
      try {
        const geographies = await this.getGeographies(world.id)
        const nations = await this.getNations(world.id)
        const factions = await this.getFactions(world.id)
        const characters = await this.getCharacters(world.id)
        const maps = await this.getMaps(world.id)
        const relationships = await this.getRelationships(world.id)
        
        totalGeographies += geographies.length
        totalNations += nations.length
        totalFactions += factions.length
        totalCharacters += characters.length
        totalMaps += maps.length
        totalRelationships += relationships.length
      } catch (error) {
        console.warn(`获取世界观 ${world.id} 的统计信息失败:`, error)
      }
    }
    
    return {
      worldCount: worlds.length,
      recentFileCount: recentFiles.length,
      totalGeographies,
      totalNations,
      totalFactions,
      totalCharacters,
      totalMaps,
      totalRelationships
    }
  }

  // ==================== 健康检查 ====================
  
  /**
   * 数据库健康检查
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy'
    message: string
    timestamp: string
  }> {
    try {
      await this.ensureInitialized()
      const isHealthy = await typeormClient.healthCheck()
      
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        message: isHealthy ? 'TypeORM数据库服务运行正常' : 'TypeORM数据库服务异常',
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `数据库健康检查失败: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString()
      }
    }
  }
}

// 导出TypeORM数据库服务实例
export const typeormDatabaseService = new TypeORMDatabaseService()

// 默认导出（兼容性）
export default typeormDatabaseService

// 兼容性导出
export { typeormDatabaseService as databaseService }