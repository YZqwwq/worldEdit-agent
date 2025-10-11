import { typeormService } from '../Client/world-ORMClient'
import { WorldContent } from '../../../../shared/entities/WorldContent.entity'

/**
 * WorldContent文本内容服务
 * 专门处理WorldContent的文本内容操作
 */
export class WorldContentTextService {
  private initialized = false

  /**
   * 确保服务已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await typeormService.initialize()
      this.initialized = true
    }
  }

  /**
   * 获取WorldContent，如果不存在则创建
   */
  async getWorldContent(worldId: string): Promise<WorldContent> {
    await this.ensureInitialized()
    // 先尝试获取现有的WorldContent（返回的是UnifiedWorldData格式）
    const unifiedData = await typeormService.getWorldContent(worldId)
    
    if (!unifiedData) {
      // 如果不存在，创建新的WorldContent
      const newWorldContent = new WorldContent()
      newWorldContent.worldId = worldId
      newWorldContent.text = {
        description: '',
        background: '',
        rules: '',
        notes: ''
      }
      
      // 转换为UnifiedWorldData格式并保存
      const unifiedWorldData = newWorldContent.toUnifiedWorldData()
      // 添加必要的字段以符合UnifiedWorldData接口
      const saveData = {
        ...unifiedWorldData,
        worldId: worldId,
        id: undefined, // 让数据库自动生成
        name: 'World Content',
        description: 'World content data',
        version: '1.0.0',
        tags: [],
        author: 'System',
        lastModified: new Date()
      }
      
      await typeormService.saveWorldContent(saveData as any)
      
      // 重新获取保存后的WorldContent
      const savedUnifiedData = await typeormService.getWorldContent(worldId)
      if (!savedUnifiedData) {
        throw new Error('Failed to create WorldContent')
      }
      
      return this.convertUnifiedDataToWorldContent(worldId, savedUnifiedData)
    }
    
    return this.convertUnifiedDataToWorldContent(worldId, unifiedData)
  }

  /**
   * 将UnifiedWorldData转换为WorldContent实例
   */
  private convertUnifiedDataToWorldContent(worldId: string, unifiedData: any): WorldContent {
    const worldContent = new WorldContent()
    worldContent.worldId = worldId
    worldContent.id = unifiedData.id || ''
    worldContent.text = unifiedData.text || {
      description: '',
      background: '',
      rules: '',
      notes: ''
    }
    worldContent.timeline = unifiedData.timeline || []
    worldContent.geography = unifiedData.geography || []
    worldContent.nations = unifiedData.nations || []
    worldContent.factions = unifiedData.factions || []
    worldContent.powerSystems = unifiedData.powerSystems || []
    worldContent.characters = unifiedData.characters || []
    worldContent.maps = unifiedData.maps || []
    worldContent.relationships = unifiedData.relationships || []
    worldContent.items = unifiedData.items || []
    worldContent.events = unifiedData.events || []
    worldContent.createdAt = unifiedData.createdAt || new Date()
    worldContent.updatedAt = unifiedData.updatedAt || new Date()
    
    return worldContent
  }

  /**
   * 保存WorldContent的文本内容
   */
  async saveWorldContentText(
    worldId: string,
    textContent: {
      description?: string
      background?: string
      rules?: string
      notes?: string
    }
  ): Promise<void> {
    await this.ensureInitialized()
    // 先获取现有的WorldContent
    const worldContent = await this.getWorldContent(worldId)
    
    // 更新文本内容
    worldContent.text = {
      ...worldContent.text,
      ...textContent
    }
    
    // 转换为UnifiedWorldData格式并保存
    const unifiedWorldData = worldContent.toUnifiedWorldData()
    const saveData = {
      ...unifiedWorldData,
      worldId: worldId,
      id: worldContent.id,
      name: 'World Content',
      description: 'World content data',
      version: '1.0.0',
      tags: [],
      author: 'System',
      lastModified: new Date()
    }
    
    await typeormService.saveWorldContent(saveData as any)
  }

  /**
   * 获取WorldContent的文本内容
   */
  async getWorldContentText(worldId: string): Promise<{
    text: {
      description?: string
      background?: string
      rules?: string
      notes?: string
    }
    createdAt: Date
    updatedAt: Date
  }> {
    await this.ensureInitialized()
    const worldContent = await this.getWorldContent(worldId)
    
    return {
      text: worldContent.text || {
        description: '',
        background: '',
        rules: '',
        notes: ''
      },
      createdAt: worldContent.createdAt,
      updatedAt: worldContent.updatedAt
    }
  }
}

// 导出服务实例
export const worldContentTextService = new WorldContentTextService()
export default worldContentTextService