import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import type { 
  WorldData, 
  UnifiedWorldData, 
  CharacterData, 
  MapData, 
  RelationshipData, 
  RecentFile 
} from '../../../shared/types/world'

// SQLite数据库类
class WorldDatabase {
  private db: Database.Database
  private dbPath: string

  constructor(dbPath: string) {
    this.dbPath = dbPath
    this.db = new Database(dbPath)
    this.initializeTables()
  }

  private initializeTables(): void {
    // 启用外键约束
    this.db.pragma('foreign_keys = ON')
    
    // 创建worlds表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS worlds (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        author TEXT,
        tags TEXT, -- JSON数组字符串
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        lastModified TEXT,
        version TEXT DEFAULT '1.0.0'
      )
    `)

    // 创建worldContent表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS worldContent (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        background TEXT,
        rules TEXT,
        timeline TEXT, -- JSON字符串
        locations TEXT, -- JSON字符串
        factions TEXT, -- JSON字符串
        items TEXT, -- JSON字符串
        events TEXT, -- JSON字符串
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        version TEXT DEFAULT '1.0.0',
        FOREIGN KEY (id) REFERENCES worlds(id) ON DELETE CASCADE
      )
    `)

    // 创建characters表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        background TEXT,
        personality TEXT,
        appearance TEXT,
        abilities TEXT, -- JSON字符串
        relationships TEXT, -- JSON字符串
        notes TEXT,
        factionId TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `)

    // 创建maps表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS maps (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT,
        data TEXT, -- JSON字符串
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `)

    // 创建relationships表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS relationships (
        id TEXT PRIMARY KEY,
        sourceId TEXT NOT NULL,
        targetId TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        strength INTEGER DEFAULT 0
      )
    `)

    // 创建recentFiles表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS recentFiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT,
        type TEXT NOT NULL,
        lastOpened TEXT NOT NULL
      )
    `)

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_worlds_name ON worlds(name);
      CREATE INDEX IF NOT EXISTS idx_worlds_lastModified ON worlds(lastModified);
      CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(name);
      CREATE INDEX IF NOT EXISTS idx_characters_factionId ON characters(factionId);
      CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(sourceId);
      CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(targetId);
      CREATE INDEX IF NOT EXISTS idx_recentFiles_lastOpened ON recentFiles(lastOpened);
    `)
  }

  // 获取数据库实例
  getDb(): Database.Database {
    return this.db
  }

  // 关闭数据库连接
  close(): void {
    this.db.close()
  }

  // 备份数据库
  async backup(backupPath: string): Promise<void> {
    const backup = await this.db.backup(backupPath)
    // backup 操作完成后会自动关闭，无需手动调用 close()
  }
}

// 数据库连接池管理器
class DatabaseConnectionPool {
  private static instance: DatabaseConnectionPool
  private database: WorldDatabase | null = null
  private isInitialized = false
  private dbPath: string

  private constructor() {
    // 确保数据目录存在
    const userDataPath = app.getPath('userData')
    const dataDir = path.join(userDataPath, 'data')
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    
    this.dbPath = path.join(dataDir, 'world.db')
  }

  public static getInstance(): DatabaseConnectionPool {
    if (!DatabaseConnectionPool.instance) {
      DatabaseConnectionPool.instance = new DatabaseConnectionPool()
    }
    return DatabaseConnectionPool.instance
  }

  public getDatabase(): WorldDatabase {
    if (this.database && this.isInitialized) {
      return this.database
    }

    this.initialize()
    return this.database!
  }

  private initialize(): void {
    try {
      this.database = new WorldDatabase(this.dbPath)
      this.isInitialized = true
      console.log('SQLite数据库连接已建立:', this.dbPath)
    } catch (error) {
      console.error('SQLite数据库初始化失败:', error)
      throw error
    }
  }

  public close(): void {
    if (this.database) {
      this.database.close()
      this.database = null
      this.isInitialized = false
    }
  }
}

// 主进程数据库服务
export class MainDatabaseService {
  private connectionPool: DatabaseConnectionPool

  constructor() {
    this.connectionPool = DatabaseConnectionPool.getInstance()
  }

  /**
   * 获取数据库实例
   */
  private getDb(): Database.Database {
    return this.connectionPool.getDatabase().getDb()
  }

  // 世界观基础操作
  async createWorld(worldData: Omit<WorldData, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorldData> {
    const db = this.getDb()
    const now = new Date().toISOString()
    const newWorld: WorldData = {
      ...worldData,
      id: `world_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      lastModified: new Date(now),
      version: '1.0.0'
    }
    
    const stmt = db.prepare(`
      INSERT INTO worlds (id, name, description, author, tags, createdAt, updatedAt, lastModified, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    
    stmt.run(
      newWorld.id,
      newWorld.name,
      newWorld.description || '',
      newWorld.author || '',
      JSON.stringify(newWorld.tags || []),
      now,
      now,
      now,
      newWorld.version
    )
    
    return newWorld
  }

  async getWorldList(): Promise<WorldData[]> {
    const db = this.getDb()
    const stmt = db.prepare('SELECT * FROM worlds ORDER BY lastModified DESC')
    const rows = stmt.all() as any[]
    
    return rows.map(row => ({
      ...row,
      tags: JSON.parse(row.tags || '[]'),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      lastModified: row.lastModified ? new Date(row.lastModified) : undefined
    }))
  }

  async getWorld(id: string): Promise<WorldData | undefined> {
    const db = this.getDb()
    const stmt = db.prepare('SELECT * FROM worlds WHERE id = ?')
    const row = stmt.get(id) as any
    
    if (!row) return undefined
    
    return {
      ...row,
      tags: JSON.parse(row.tags || '[]'),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      lastModified: row.lastModified ? new Date(row.lastModified) : undefined
    }
  }

  async updateWorld(id: string, updates: Partial<WorldData>): Promise<void> {
    const db = this.getDb()
    const now = new Date().toISOString()
    
    const fields: string[] = []
    const values: any[] = []
    
    if (updates.name !== undefined) {
      fields.push('name = ?')
      values.push(updates.name)
    }
    if (updates.description !== undefined) {
      fields.push('description = ?')
      values.push(updates.description)
    }
    if (updates.author !== undefined) {
      fields.push('author = ?')
      values.push(updates.author)
    }
    if (updates.tags !== undefined) {
      fields.push('tags = ?')
      values.push(JSON.stringify(updates.tags))
    }
    if (updates.version !== undefined) {
      fields.push('version = ?')
      values.push(updates.version)
    }
    
    fields.push('updatedAt = ?', 'lastModified = ?')
    values.push(now, now)
    values.push(id)
    
    const stmt = db.prepare(`UPDATE worlds SET ${fields.join(', ')} WHERE id = ?`)
    stmt.run(...values)
  }

  async deleteWorld(id: string): Promise<void> {
    const db = this.getDb()
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM recentFiles WHERE id = ?').run(id)
      db.prepare('DELETE FROM worldContent WHERE id = ?').run(id)
      db.prepare('DELETE FROM worlds WHERE id = ?').run(id)
    })
    transaction()
  }

  // 完整世界观内容操作
  async saveWorldContent(worldContent: UnifiedWorldData): Promise<void> {
    const db = this.getDb()
    const now = new Date().toISOString()
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO worldContent 
      (id, name, description, background, rules, timeline, locations, factions, items, events, notes, createdAt, updatedAt, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    
    stmt.run(
      worldContent.id,
      worldContent.name,
      '', // description - UnifiedWorldData 没有此属性
      '', // background - UnifiedWorldData 没有此属性
      '', // rules - UnifiedWorldData 没有此属性
      JSON.stringify(worldContent.text?.timeline || []),
      JSON.stringify(worldContent.text?.geography || []), // 使用 geography 替代 locations
      JSON.stringify(worldContent.text?.factions || []),
      JSON.stringify([]), // items - UnifiedWorldData 没有此属性
      JSON.stringify([]), // events - UnifiedWorldData 没有此属性
      '', // notes - UnifiedWorldData 没有此属性
      worldContent.createdAt ? worldContent.createdAt.toISOString() : now,
      now,
      worldContent.version || '1.0.0'
    )
    
    // 同时更新基础世界观信息
    await this.updateWorld(worldContent.id, {
      name: worldContent.name,
      lastModified: new Date()
    })
  }

  async getWorldContent(id: string): Promise<UnifiedWorldData | undefined> {
    const db = this.getDb()
    const stmt = db.prepare('SELECT * FROM worldContent WHERE id = ?')
    const row = stmt.get(id) as any
    
    if (!row) return undefined
    
    // 将数据库行数据映射到 UnifiedWorldData 结构
    return {
      id: row.id,
      name: row.name,
      version: row.version || '1.0.0',
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      text: {
        geography: JSON.parse(row.locations || '[]'), // 将 locations 映射到 geography
        nations: [],
        factions: JSON.parse(row.factions || '[]'),
        powerSystems: [],
        timeline: JSON.parse(row.timeline || '[]')
      },
      characters: [],
      maps: [],
      relationships: {
        textToCharacter: [],
        textToMap: [],
        characterToMap: [],
        crossReferences: []
      }
    }
  }

  // 最近文件操作
  async addRecentFile(file: RecentFile): Promise<void> {
    const db = this.getDb()
    
    const transaction = db.transaction(() => {
      // 删除已存在的相同文件
      db.prepare('DELETE FROM recentFiles WHERE id = ?').run(file.id)
      
      // 添加新文件
      const stmt = db.prepare(`
        INSERT INTO recentFiles (id, name, path, type, lastOpened)
        VALUES (?, ?, ?, ?, ?)
      `)
      stmt.run(
        file.id,
        file.name,
        file.path || '',
        file.type,
        file.lastOpened.toISOString()
      )
      
      // 保持最近文件数量限制（最多10个）
      const countStmt = db.prepare('SELECT COUNT(*) as count FROM recentFiles')
      const { count } = countStmt.get() as { count: number }
      
      if (count > 10) {
        const deleteStmt = db.prepare(`
          DELETE FROM recentFiles WHERE id IN (
            SELECT id FROM recentFiles ORDER BY lastOpened ASC LIMIT ?
          )
        `)
        deleteStmt.run(count - 10)
      }
    })
    
    transaction()
  }

  async getRecentFiles(): Promise<RecentFile[]> {
    const db = this.getDb()
    const stmt = db.prepare('SELECT * FROM recentFiles ORDER BY lastOpened DESC')
    const rows = stmt.all() as any[]
    
    return rows.map(row => ({
      ...row,
      lastOpened: new Date(row.lastOpened)
    }))
  }

  async removeRecentFile(id: string): Promise<void> {
    const db = this.getDb()
    const stmt = db.prepare('DELETE FROM recentFiles WHERE id = ?')
    stmt.run(id)
  }

  // 搜索功能
  async searchWorlds(query: string): Promise<WorldData[]> {
    const db = this.getDb()
    const lowerQuery = `%${query.toLowerCase()}%`
    
    const stmt = db.prepare(`
      SELECT * FROM worlds 
      WHERE LOWER(name) LIKE ? 
         OR LOWER(description) LIKE ? 
         OR LOWER(tags) LIKE ?
      ORDER BY lastModified DESC
    `)
    
    const rows = stmt.all(lowerQuery, lowerQuery, lowerQuery) as any[]
    
    return rows.map(row => ({
      ...row,
      tags: JSON.parse(row.tags || '[]'),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      lastModified: row.lastModified ? new Date(row.lastModified) : undefined
    }))
  }

  // 数据库维护
  async clearAllData(): Promise<void> {
    const db = this.getDb()
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM recentFiles').run()
      db.prepare('DELETE FROM relationships').run()
      db.prepare('DELETE FROM maps').run()
      db.prepare('DELETE FROM characters').run()
      db.prepare('DELETE FROM worldContent').run()
      db.prepare('DELETE FROM worlds').run()
    })
    transaction()
  }

  async exportData(): Promise<any> {
    const db = this.getDb()
    
    const worlds = db.prepare('SELECT * FROM worlds').all()
    const worldContent = db.prepare('SELECT * FROM worldContent').all()
    const characters = db.prepare('SELECT * FROM characters').all()
    const maps = db.prepare('SELECT * FROM maps').all()
    const relationships = db.prepare('SELECT * FROM relationships').all()
    const recentFiles = db.prepare('SELECT * FROM recentFiles').all()

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

    const db = this.getDb()
    const transaction = db.transaction(() => {
      if (data.data.worlds) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO worlds 
          (id, name, description, author, tags, createdAt, updatedAt, lastModified, version)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        for (const world of data.data.worlds) {
          stmt.run(
            world.id, world.name, world.description, world.author,
            world.tags, world.createdAt, world.updatedAt, world.lastModified, world.version
          )
        }
      }
      
      if (data.data.worldContent) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO worldContent 
          (id, name, description, background, rules, timeline, locations, factions, items, events, notes, createdAt, updatedAt, version)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        for (const content of data.data.worldContent) {
          stmt.run(
            content.id, content.name, content.description, content.background, content.rules,
            content.timeline, content.locations, content.factions, content.items, content.events,
            content.notes, content.createdAt, content.updatedAt, content.version
          )
        }
      }
      
      // 导入其他表的数据...
      if (data.data.characters) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO characters 
          (id, name, description, background, personality, appearance, abilities, relationships, notes, factionId, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        for (const character of data.data.characters) {
          stmt.run(
            character.id, character.name, character.description, character.background,
            character.personality, character.appearance, character.abilities, character.relationships,
            character.notes, character.factionId, character.createdAt, character.updatedAt
          )
        }
      }
      
      if (data.data.recentFiles) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO recentFiles (id, name, path, type, lastOpened)
          VALUES (?, ?, ?, ?, ?)
        `)
        for (const file of data.data.recentFiles) {
          stmt.run(file.id, file.name, file.path, file.type, file.lastOpened)
        }
      }
    })
    
    transaction()
  }

  // 关闭数据库连接
  async close(): Promise<void> {
    this.connectionPool.close()
  }

  // 数据库备份
  async backup(backupPath?: string): Promise<string> {
    const db = this.connectionPool.getDatabase()
    const defaultBackupPath = backupPath || path.join(
      app.getPath('userData'), 
      'backups', 
      `world_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.db`
    )
    
    // 确保备份目录存在
    const backupDir = path.dirname(defaultBackupPath)
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }
    
    db.backup(defaultBackupPath)
    return defaultBackupPath
  }
}

// 导出单例实例
export const mainDatabaseService = new MainDatabaseService()