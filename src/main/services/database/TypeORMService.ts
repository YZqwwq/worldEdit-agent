import { Repository } from 'typeorm';
import { 
  World, 
  WorldContent, 
  Geography,
  Nation,
  Faction,
  PowerSystem,
  Character,
  Map,
  Relationship,
  RecentFile 
} from '../../../shared/entities';
import { 
  initializeDataSource, 
  closeDataSource, 
  getDataSource 
} from '../../../shared/database/data-source';
// 导入基础类型
import type { BaseMetadata, UnifiedWorldData } from '../../ipc/typeorm-database';

import * as fs from 'fs';



export interface BackupMetadata {
  id: string;
  timestamp: Date;
  size: number;
  path: string;
}

export class TypeORMService {
  private worldRepository!: Repository<World>;
  private worldContentRepository!: Repository<WorldContent>;
  private geographyRepository!: Repository<Geography>;
  private nationRepository!: Repository<Nation>;
  private factionRepository!: Repository<Faction>;
  private powerSystemRepository!: Repository<PowerSystem>;
  private characterRepository!: Repository<Character>;
  private mapRepository!: Repository<Map>;
  private relationshipRepository!: Repository<Relationship>;
  private recentFileRepository!: Repository<RecentFile>;
  private isInitialized = false;

  async initialize(): Promise<void> {
    try {
      await initializeDataSource();
      if (this.isInitialized) return;
      
      const dataSource = getDataSource();
      this.worldRepository = dataSource.getRepository(World);
      this.worldContentRepository = dataSource.getRepository(WorldContent);
      this.geographyRepository = dataSource.getRepository(Geography);
      this.nationRepository = dataSource.getRepository(Nation);
      this.factionRepository = dataSource.getRepository(Faction);
      this.powerSystemRepository = dataSource.getRepository(PowerSystem);
      this.characterRepository = dataSource.getRepository(Character);
      this.mapRepository = dataSource.getRepository(Map);
      this.relationshipRepository = dataSource.getRepository(Relationship);
      this.recentFileRepository = dataSource.getRepository(RecentFile);
      this.isInitialized = true;
      console.log('TypeORM服务初始化成功');
    } catch (error) {
      console.error('TypeORM服务初始化失败:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      await closeDataSource();
      this.isInitialized = false;
      console.log('TypeORM服务已关闭');
    } catch (error) {
      console.error('关闭TypeORM服务时出错:', error);
      throw error;
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('TypeORM服务未初始化，请先调用initialize()');
    }
  }

  /**
   * 获取数据源实例
   */
  async getDataSource() {
    this.ensureInitialized();
    return getDataSource();
  }

  // 世界管理方法
  async saveWorld(metadata: BaseMetadata): Promise<void> {
    this.ensureInitialized();
    
    try {
      const existingWorld = await this.worldRepository.findOne({ 
        where: { id: metadata.id } 
      });

      if (existingWorld) {
        // 更新现有世界
        Object.assign(existingWorld, World.fromWorldData(metadata));
        await this.worldRepository.save(existingWorld);
      } else {
        // 创建新世界
        const newWorld = this.worldRepository.create(World.fromWorldData(metadata));
        await this.worldRepository.save(newWorld);
      }
    } catch (error) {
      console.error('保存世界失败:', error);
      throw error;
    }
  }

  async getWorld(id: string): Promise<BaseMetadata | null> {
    this.ensureInitialized();
    
    try {
      const world = await this.worldRepository.findOne({ where: { id } });
      return world ? {
        id: world.id,
        name: world.name,
        description: world.description || '',
        version: world.version,
        tags: world.tags || [],
        author: world.author || '',
        thumbnail: world.thumbnail,
        lastModified: world.lastModified,
        createdAt: world.createdAt,
        updatedAt: world.updatedAt
      } : null;
    } catch (error) {
      console.error('获取世界失败:', error);
      throw error;
    }
  }

  async getAllWorlds(): Promise<BaseMetadata[]> {
    this.ensureInitialized();
    
    try {
      const worlds = await this.worldRepository.find({
        order: { lastModified: 'DESC' }
      });
      return worlds.map(world => ({
        id: world.id,
        name: world.name,
        description: world.description || '',
        version: world.version,
        tags: world.tags || [],
        author: world.author || '',
        thumbnail: world.thumbnail,
        lastModified: world.lastModified,
        createdAt: world.createdAt,
        updatedAt: world.updatedAt
      }));
    } catch (error) {
      console.error('获取所有世界失败:', error);
      throw error;
    }
  }

  async deleteWorld(id: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      // 删除世界内容
      await this.worldContentRepository.delete({ worldId: id });
      // 删除世界
      await this.worldRepository.delete({ id });
    } catch (error) {
      console.error('删除世界失败:', error);
      throw error;
    }
  }

  // 世界内容管理方法
  async saveWorldContent(worldId: string, content: UnifiedWorldData): Promise<void> {
    this.ensureInitialized();
    
    try {
      const existingContent = await this.worldContentRepository.findOne({ 
        where: { worldId } 
      });

      if (existingContent) {
        // 更新现有内容
        existingContent.updateContent(content);
        await this.worldContentRepository.save(existingContent);
      } else {
        // 创建新内容
        const newContent = this.worldContentRepository.create(
          WorldContent.fromUnifiedWorldData(worldId, content)
        );
        await this.worldContentRepository.save(newContent);
      }
    } catch (error) {
      console.error('保存世界内容失败:', error);
      throw error;
    }
  }

  async getWorldContent(worldId: string): Promise<UnifiedWorldData | null> {
    this.ensureInitialized();
    
    try {
      const content = await this.worldContentRepository.findOne({ 
        where: { worldId } 
      });
      return content ? content.toUnifiedWorldData() : null;
    } catch (error) {
      console.error('获取世界内容失败:', error);
      throw error;
    }
  }

  async getWorldContentByWorldId(worldId: string): Promise<WorldContent | null> {
    this.ensureInitialized();
    
    try {
      return await this.worldContentRepository.findOne({ 
        where: { worldId } 
      });
    } catch (error) {
      console.error('获取世界内容失败:', error);
      throw error;
    }
  }

  async updateWorld(id: string, updates: Partial<BaseMetadata>): Promise<World | null> {
    this.ensureInitialized();
    
    try {
      const world = await this.worldRepository.findOne({ where: { id } });
      if (!world) {
        return null;
      }
      
      Object.assign(world, updates);
      world.lastModified = new Date();
      return await this.worldRepository.save(world);
    } catch (error) {
      console.error('更新世界失败:', error);
      throw error;
    }
  }

  // 最近文件管理
  async addRecentFile(file: Omit<import('../../../shared/entities').RecentFile, 'id' | 'lastOpened' | 'createdAt' | 'updatedAt'>): Promise<void> {
    this.ensureInitialized();
    
    const existingFile = await this.recentFileRepository.findOne({ 
      where: { path: file.path } 
    });

    if (existingFile) {
      existingFile.lastOpened = new Date();
      await this.recentFileRepository.save(existingFile);
    } else {
      const entityData = RecentFile.fromApiData(file as any);
      const recentFile = this.recentFileRepository.create({
        ...entityData,
        lastOpened: new Date()
      });
      await this.recentFileRepository.save(recentFile);
    }

    // 保持最多10个最近文件
    const allFiles = await this.recentFileRepository.find({
      order: { lastOpened: 'DESC' }
    });
    
    if (allFiles.length > 10) {
      const filesToDelete = allFiles.slice(10);
      await this.recentFileRepository.remove(filesToDelete);
    }
  }

  async getRecentFiles(): Promise<import('../../../shared/entities').RecentFile[]> {
    this.ensureInitialized();
    return await this.getAllRecentFiles();
  }

  async clearRecentFiles(): Promise<void> {
    this.ensureInitialized();
    await this.recentFileRepository.clear();
  }

  // 备份功能（简化实现）
  async backup(backupPath: string): Promise<BackupMetadata> {
    this.ensureInitialized();
    
    try {
      // 这里可以实现数据库备份逻辑
      // 目前返回模拟的备份元数据
      const stats = fs.statSync(backupPath);
      
      return {
        id: `backup_${Date.now()}`,
        timestamp: new Date(),
        size: stats.size,
        path: backupPath
      };
    } catch (error) {
      console.error('备份失败:', error);
      throw error;
    }
  }

  // Geography相关操作
  async saveGeography(worldId: string, geography: any): Promise<Geography> {
    this.ensureInitialized();
    const entity = this.geographyRepository.create(Geography.fromData(worldId, geography));
    return await this.geographyRepository.save(entity);
  }

  async getGeographiesByWorldId(worldId: string): Promise<Geography[]> {
    this.ensureInitialized();
    return await this.geographyRepository.find({ where: { worldId } });
  }

  async deleteGeography(id: string): Promise<void> {
    this.ensureInitialized();
    await this.geographyRepository.delete(id);
  }

  // Nation相关操作
  async saveNation(worldId: string, nation: any): Promise<Nation> {
    this.ensureInitialized();
    const entity = this.nationRepository.create(Nation.fromData(worldId, nation));
    return await this.nationRepository.save(entity);
  }

  async getNationsByWorldId(worldId: string): Promise<Nation[]> {
    this.ensureInitialized();
    return await this.nationRepository.find({ where: { worldId } });
  }

  async deleteNation(id: string): Promise<void> {
    this.ensureInitialized();
    await this.nationRepository.delete(id);
  }

  // Faction相关操作
  async saveFaction(worldId: string, faction: any): Promise<Faction> {
    this.ensureInitialized();
    const entity = this.factionRepository.create(Faction.fromData(worldId, faction));
    return await this.factionRepository.save(entity);
  }

  async getFactionsByWorldId(worldId: string): Promise<Faction[]> {
    this.ensureInitialized();
    return await this.factionRepository.find({ where: { worldId } });
  }

  async deleteFaction(id: string): Promise<void> {
    this.ensureInitialized();
    await this.factionRepository.delete(id);
  }

  // PowerSystem相关操作
  async savePowerSystem(worldId: string, powerSystem: any): Promise<PowerSystem> {
    this.ensureInitialized();
    const entity = this.powerSystemRepository.create(PowerSystem.fromData(worldId, powerSystem));
    return await this.powerSystemRepository.save(entity);
  }

  async getPowerSystemsByWorldId(worldId: string): Promise<PowerSystem[]> {
    this.ensureInitialized();
    return await this.powerSystemRepository.find({ where: { worldId } });
  }

  async deletePowerSystem(id: string): Promise<void> {
    this.ensureInitialized();
    await this.powerSystemRepository.delete(id);
  }

  // Character相关操作
  async saveCharacter(worldId: string, character: any): Promise<Character> {
    this.ensureInitialized();
    const entity = this.characterRepository.create(Character.fromData(worldId, character));
    return await this.characterRepository.save(entity);
  }

  async getCharactersByWorldId(worldId: string): Promise<Character[]> {
    this.ensureInitialized();
    return await this.characterRepository.find({ where: { worldId } });
  }

  async deleteCharacter(id: string): Promise<void> {
    this.ensureInitialized();
    await this.characterRepository.delete(id);
  }

  // Map相关操作
  async saveMap(worldId: string, map: any): Promise<Map> {
    this.ensureInitialized();
    const entity = this.mapRepository.create(Map.fromData(worldId, map));
    return await this.mapRepository.save(entity);
  }

  async getMapsByWorldId(worldId: string): Promise<Map[]> {
    this.ensureInitialized();
    return await this.mapRepository.find({ where: { worldId } });
  }

  async deleteMap(id: string): Promise<void> {
    this.ensureInitialized();
    await this.mapRepository.delete(id);
  }

  // Relationship相关操作
  async saveRelationship(worldId: string, relationship: Partial<Relationship>): Promise<Relationship> {
    this.ensureInitialized();
    const entity = this.relationshipRepository.create({ ...relationship, worldId });
    return await this.relationshipRepository.save(entity);
  }

  async getRelationshipsByWorldId(worldId: string): Promise<Relationship[]> {
    this.ensureInitialized();
    return await this.relationshipRepository.find({ where: { worldId } });
  }

  async getRelationshipsByEntity(worldId: string, entityId: string, entityType: string): Promise<Relationship[]> {
    this.ensureInitialized();
    return await this.relationshipRepository.find({
      where: [
        { worldId, sourceId: entityId, sourceType: entityType },
        { worldId, targetId: entityId, targetType: entityType }
      ]
    });
  }

  async deleteRelationship(id: string): Promise<void> {
    this.ensureInitialized();
    await this.relationshipRepository.delete(id);
  }

  // RecentFile相关操作
  async saveRecentFile(recentFile: Partial<import('../../../shared/entities').RecentFile>): Promise<import('../../../shared/entities').RecentFile> {
    this.ensureInitialized();
    const entity = this.recentFileRepository.create(recentFile);
    return await this.recentFileRepository.save(entity);
  }

  async getAllRecentFiles(): Promise<import('../../../shared/entities').RecentFile[]> {
    this.ensureInitialized();
    return await this.recentFileRepository.find({
      order: { lastOpened: 'DESC' },
      take: 10
    });
  }

  async deleteRecentFile(id: string): Promise<void> {
    this.ensureInitialized();
    await this.recentFileRepository.delete(id);
  }

  // 批量操作
  async saveWorldWithContent(world: BaseMetadata, content: UnifiedWorldData): Promise<void> {
    this.ensureInitialized();
    await this.saveWorld(world);
    await this.saveWorldContent(world.id, content);
  }

  async deleteWorldWithAllContent(worldId: string): Promise<void> {
    this.ensureInitialized();
    // 删除所有相关内容（按照依赖关系顺序）
    await this.relationshipRepository.delete({ worldId });
    await this.mapRepository.delete({ worldId });
    await this.characterRepository.delete({ worldId });
    await this.powerSystemRepository.delete({ worldId });
    await this.factionRepository.delete({ worldId });
    await this.nationRepository.delete({ worldId });
    await this.geographyRepository.delete({ worldId });
    await this.worldContentRepository.delete({ worldId });
    await this.worldRepository.delete(worldId);
  }

  // 健康检查
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        return false;
      }
      
      // 执行简单查询测试连接
      await this.worldRepository.count();
      return true;
    } catch (error) {
      console.error('健康检查失败:', error);
      return false;
    }
  }
}

// 单例实例
export const typeORMService = new TypeORMService();