import Dexie, { Table } from 'dexie'
import type { 
  WorldData, 
  UnifiedWorldData, 
  CharacterData, 
  MapData, 
  RelationshipData, 
  RecentFile 
} from '../types/world'

// 数据库接口定义
export interface DatabaseSchema {
  worlds: WorldData
  worldContent: UnifiedWorldData
  characters: CharacterData
  maps: MapData
  relationships: RelationshipData
  recentFiles: RecentFile
}

// 数据库类
export class WorldDatabase extends Dexie {
  // 表定义
  worlds!: Table<WorldData>
  worldContent!: Table<UnifiedWorldData>
  characters!: Table<CharacterData>
  maps!: Table<MapData>
  relationships!: Table<RelationshipData>
  recentFiles!: Table<RecentFile>

  constructor() {
    super('WorldDatabase')
    
    // 定义数据库结构和索引
    this.version(1).stores({
      worlds: 'id, name, author, *tags, createdAt, updatedAt, lastModified',
      worldContent: 'id, name, createdAt, updatedAt, version',
      characters: 'id, name, createdAt, updatedAt, factionId',
      maps: 'id, name, createdAt, updatedAt',
      relationships: 'id, sourceId, targetId, type',
      recentFiles: 'id, name, lastOpened, type'
    })
  }
}

// 数据库实例
export const db = new WorldDatabase()

// 数据库操作服务
export class DatabaseService {
  public db: WorldDatabase
  private initialized = false

  constructor() {
    this.db = new WorldDatabase()
  }

  /**
   * 初始化数据库连接
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      // 确保数据库已打开
      await this.db.open()
      this.initialized = true
      console.log('数据库连接已建立')
    } catch (error) {
      console.error('数据库初始化失败:', error)
      throw error
    }
  }

  // 世界观基础操作
  async createWorld(worldData: Omit<WorldData, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorldData> {
    const now = new Date()
    const newWorld: WorldData = {
      ...worldData,
      id: `world_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
      version: '1.0.0'
    }
    
    // 序列化 Date 对象后保存
    const serializedWorld = this.serializeDates(newWorld)
    await this.db.worlds.add(serializedWorld)
    return newWorld
  }

  async getWorldList(): Promise<WorldData[]> {
    const worlds = await this.db.worlds.orderBy('lastModified').reverse().toArray()
    return worlds.map(world => this.deserializeDates(world) as WorldData)
  }

  async getWorld(id: string): Promise<WorldData | undefined> {
    const world = await this.db.worlds.get(id)
    if (world) {
      return this.deserializeDates(world) as WorldData
    }
    return undefined
  }

  async updateWorld(id: string, updates: Partial<WorldData>): Promise<void> {
    const serializedUpdates = this.serializeDates({
      ...updates,
      updatedAt: new Date()
    })
    await this.db.worlds.update(id, serializedUpdates)
  }

  async deleteWorld(id: string): Promise<void> {
    await this.db.transaction('rw', [this.db.worlds, this.db.worldContent, this.db.recentFiles], async () => {
      await this.db.worlds.delete(id)
      await this.db.worldContent.delete(id)
      await this.db.recentFiles.where('id').equals(id).delete()
    })
  }

  // 完整世界观内容操作
  async saveWorldContent(worldContent: UnifiedWorldData): Promise<void> {
    // 深度克隆并序列化 Date 对象
    const serializedContent = this.serializeDates({
      ...worldContent,
      updatedAt: new Date()
    })
    
    await this.db.worldContent.put(serializedContent)
    
    // 同时更新基础世界观信息
    await this.updateWorld(worldContent.id, {
      name: worldContent.name,
      lastModified: new Date()
    })
  }

  async getWorldContent(id: string): Promise<UnifiedWorldData | undefined> {
    const content = await this.db.worldContent.get(id)
    if (content) {
      // 反序列化 Date 对象
      return this.deserializeDates(content) as UnifiedWorldData
    }
    return undefined
  }

  // 最近文件操作
  async addRecentFile(file: RecentFile): Promise<void> {
    // 删除已存在的相同文件
    await this.db.recentFiles.where('id').equals(file.id).delete()
    
    // 序列化 Date 对象后添加新记录
    const serializedFile = this.serializeDates(file)
    await this.db.recentFiles.add(serializedFile)
    
    // 保持最近文件数量限制（最多10个）
    const allRecent = await this.db.recentFiles.orderBy('lastOpened').reverse().toArray()
    if (allRecent.length > 10) {
      const toDelete = allRecent.slice(10)
      await this.db.recentFiles.bulkDelete(toDelete.map(f => f.id))
    }
  }

  async getRecentFiles(): Promise<RecentFile[]> {
    const files = await this.db.recentFiles.orderBy('lastOpened').reverse().toArray()
    return files.map(file => this.deserializeDates(file) as RecentFile)
  }

  async removeRecentFile(id: string): Promise<void> {
    await this.db.recentFiles.delete(id)
  }

  // 搜索功能
  async searchWorlds(query: string): Promise<WorldData[]> {
    const lowerQuery = query.toLowerCase()
    return await this.db.worlds
      .filter(world => 
        world.name.toLowerCase().includes(lowerQuery) ||
        world.description.toLowerCase().includes(lowerQuery) ||
        world.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      )
      .toArray()
  }

  // 数据库维护
  async clearAllData(): Promise<void> {
    await this.db.transaction('rw', [this.db.worlds, this.db.worldContent, this.db.characters, this.db.maps, this.db.relationships, this.db.recentFiles], async () => {
      await this.db.worlds.clear()
      await this.db.worldContent.clear()
      await this.db.characters.clear()
      await this.db.maps.clear()
      await this.db.relationships.clear()
      await this.db.recentFiles.clear()
    })
  }

  async exportData(): Promise<any> {
    const [worlds, worldContent, characters, maps, relationships, recentFiles] = await Promise.all([
      this.db.worlds.toArray(),
      this.db.worldContent.toArray(),
      this.db.characters.toArray(),
      this.db.maps.toArray(),
      this.db.relationships.toArray(),
      this.db.recentFiles.toArray()
    ])

    return {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      data: {
        worlds,
        worldContent,
        characters,
        maps,
        relationships,
        recentFiles
      }
    }
  }

  async importData(data: any): Promise<void> {
    if (!data.data) throw new Error('Invalid data format')

    await this.db.transaction('rw', [this.db.worlds, this.db.worldContent, this.db.characters, this.db.maps, this.db.relationships, this.db.recentFiles], async () => {
      if (data.data.worlds) await this.db.worlds.bulkPut(data.data.worlds)
      if (data.data.worldContent) await this.db.worldContent.bulkPut(data.data.worldContent)
      if (data.data.characters) await this.db.characters.bulkPut(data.data.characters)
      if (data.data.maps) await this.db.maps.bulkPut(data.data.maps)
      if (data.data.relationships) await this.db.relationships.bulkPut(data.data.relationships)
      if (data.data.recentFiles) await this.db.recentFiles.bulkPut(data.data.recentFiles)
    })
  }

  /**
   * 递归序列化 Date 对象为 ISO 字符串
   */
  private serializeDates(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj
    }
    
    if (obj instanceof Date) {
      return obj.toISOString()
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.serializeDates(item))
    }
    
    if (typeof obj === 'object') {
      const serialized: any = {}
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          serialized[key] = this.serializeDates(obj[key])
        }
      }
      return serialized
    }
    
    return obj
  }
  
  /**
   * 递归反序列化 ISO 字符串为 Date 对象
   */
  private deserializeDates(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj
    }
    
    // 检查是否为 ISO 日期字符串
    if (typeof obj === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(obj)) {
      const date = new Date(obj)
      return isNaN(date.getTime()) ? obj : date
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.deserializeDates(item))
    }
    
    if (typeof obj === 'object') {
      const deserialized: any = {}
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          deserialized[key] = this.deserializeDates(obj[key])
        }
      }
      return deserialized
    }
    
    return obj
  }
}

// 导出数据库服务实例
export const databaseService = new DatabaseService()