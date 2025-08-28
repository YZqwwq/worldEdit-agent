import { typeormDatabaseService as databaseService } from './typeorm-database'
import { simpleValidator } from '../schemas/simple-validator'

/**
 * 数据库初始化服务
 * 负责应用启动时的数据库初始化和数据迁移
 */
export class InitService {
  private static instance: InitService
  private initialized = false

  static getInstance(): InitService {
    if (!InitService.instance) {
      InitService.instance = new InitService()
    }
    return InitService.instance
  }

  /**
   * 初始化数据库和相关服务
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      console.log('正在初始化数据库...')
      
      // 初始化数据库连接
      await databaseService.initialize()
      
      // 检查数据库版本和迁移
      await this.checkAndMigrate()
      
      // 验证现有数据
      await this.validateExistingData()
      
      this.initialized = true
      console.log('数据库初始化完成')
    } catch (error) {
      console.error('数据库初始化失败:', error)
      throw error
    }
  }

  /**
   * 检查数据库版本并执行必要的迁移
   */
  private async checkAndMigrate(): Promise<void> {
    // 这里可以添加数据库版本检查和迁移逻辑
    // 例如：检查schema版本，执行数据结构升级等
    console.log('检查数据库版本...')
  }

  /**
   * 验证现有数据的完整性
   */
  private async validateExistingData(): Promise<void> {
    try {
      const worlds = await databaseService.getWorldList()
      let validationErrors = 0
      
      for (const world of worlds) {
        const worldContent = await databaseService.getWorldContent(world.id)
        if (worldContent) {
          const validation = simpleValidator.validateUnifiedWorldData(worldContent)
          if (!validation.valid) {
            console.warn(`世界观 ${world.name} 数据验证失败:`, validation.errors)
            validationErrors++
            
            // 尝试修复数据 - 先规范化数据结构
            const normalizedData = simpleValidator.normalizeUnifiedWorldData(worldContent)
            
            // 再次验证修复后的数据
            const revalidation = simpleValidator.validateUnifiedWorldData(normalizedData)
            if (revalidation.valid) {
              await databaseService.saveWorldContent(normalizedData)
              console.log(`已修复世界观 ${world.name} 的数据`)
            } else {
              console.error(`无法修复世界观 ${world.name} 的数据:`, revalidation.errors)
            }
          }
        }
      }
      
      if (validationErrors > 0) {
        console.log(`发现并修复了 ${validationErrors} 个数据验证问题`)
      }
    } catch (error) {
      console.error('数据验证过程中出错:', error)
    }
  }

  /**
   * 重置数据库（开发和测试用）
   */
  async reset(): Promise<void> {
    console.warn('正在重置数据库...')
    await databaseService.clear()
    this.initialized = false
    await this.initialize()
  }

  /**
   * 获取数据库统计信息
   */
  async getStats(): Promise<{
    worldCount: number
    characterCount: number
    mapCount: number
    relationshipCount: number
    recentFileCount: number
  }> {
    const worlds = await databaseService.getWorldList()
    const characters = await databaseService.db.characters.count()
    const maps = await databaseService.db.maps.count()
    const relationships = await databaseService.db.relationships.count()
    const recentFiles = await databaseService.getRecentFiles()
    
    return {
      worldCount: worlds.length,
      characterCount: characters,
      mapCount: maps,
      relationshipCount: relationships,
      recentFileCount: recentFiles.length
    }
  }
}

// 导出单例实例
export const initService = InitService.getInstance()