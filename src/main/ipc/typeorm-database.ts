import { ipcMain } from 'electron';
import { TypeORMService } from '../services/database/TypeORMService';
// 基础类型定义
export interface BaseMetadata {
  id: string
  name: string
  description: string
  version: string
  tags: string[]
  author: string
  thumbnail?: string
  lastModified: Date
  createdAt: Date
  updatedAt: Date
}

export interface UnifiedWorldData extends BaseMetadata {
  geography: any[]
  nations: any[]
  factions: any[]
  powerSystems: any[]
  timeline: any[]
  characters: any[]
  maps: any[]
  relationships: any[]
}
import { RecentFile as RecentFileData } from '../../shared/entities';

// 创建TypeORM服务实例
const typeormService = new TypeORMService();

// IPC 通道常量
export const TYPEORM_DATABASE_CHANNELS = {
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
} as const;

/**
 * 注册TypeORM数据库相关的IPC处理器
 */
export async function registerTypeORMDatabaseHandlers(): Promise<void> {
  // 初始化TypeORM服务
  try {
    await typeormService.initialize();
    console.log('TypeORM database service initialized, IPC handlers registered');
  } catch (error) {
    console.error('TypeORM database service initialization error:', error);
  }
  
  // 世界观基础操作
  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.CREATE_WORLD, async (_event, worldData: BaseMetadata) => {
    try {
      await typeormService.saveWorld(worldData);
      return worldData;
    } catch (error) {
      console.error('TypeORM database create world error:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.GET_WORLD_LIST, async (_event) => {
    try {
      const worlds = await typeormService.getAllWorlds();
      return worlds;
    } catch (error) {
      console.error('TypeORM database get world list error:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.GET_WORLD, async (_event, id: string) => {
    try {
      const world = await typeormService.getWorld(id);
      return world || undefined;
    } catch (error) {
      console.error('TypeORM database get world error:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.UPDATE_WORLD, async (_event, id: string, updates: Partial<BaseMetadata>) => {
    try {
      const updatedWorld = await typeormService.updateWorld(id, updates);
      if (!updatedWorld) {
        throw new Error(`World with id ${id} not found`);
      }
      return updatedWorld.toBaseMetadata();
    } catch (error) {
      console.error('TypeORM database update world error:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.DELETE_WORLD, async (_event, id: string) => {
    try {
      await typeormService.deleteWorldWithAllContent(id);
    } catch (error) {
      console.error('TypeORM database delete world error:', error);
      throw error;
    }
  });

  // 世界观内容操作
  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.SAVE_WORLD_CONTENT, async (_event, worldId: string, content: UnifiedWorldData) => {
    try {
      await typeormService.saveWorldContent(worldId, content);
      const worldContent = await typeormService.getWorldContentByWorldId(worldId);
      return worldContent ? worldContent.toUnifiedWorldData() : null;
    } catch (error) {
      console.error('TypeORM database save world content error:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.GET_WORLD_CONTENT, async (_event, worldId: string) => {
    try {
      const content = await typeormService.getWorldContentByWorldId(worldId);
      return content ? content.toUnifiedWorldData() : undefined;
    } catch (error) {
      console.error('TypeORM database get world content error:', error);
      throw error;
    }
  });

  // 地理位置操作
  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.SAVE_GEOGRAPHY, async (_event, worldId: string, geography: any) => {
    try {
      const savedGeography = await typeormService.saveGeography(worldId, geography);
      return savedGeography.toGeographyData();
    } catch (error) {
      console.error('TypeORM database save geography error:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.GET_GEOGRAPHIES, async (_event, worldId: string) => {
    try {
      const geographies = await typeormService.getGeographiesByWorldId(worldId);
      return geographies.map(geo => geo.toGeographyData());
    } catch (error) {
      console.error('TypeORM database get geographies error:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.DELETE_GEOGRAPHY, async (_event, id: string) => {
    try {
      await typeormService.deleteGeography(id);
    } catch (error) {
      console.error('删除地理位置失败:', error);
      throw error;
    }
  });

  // 国家操作
  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.SAVE_NATION, async (_event, worldId: string, nation: any) => {
    try {
      const savedNation = await typeormService.saveNation(worldId, nation);
      return savedNation.toNationData();
    } catch (error) {
      console.error('保存国家失败:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.GET_NATIONS, async (_event, worldId: string) => {
    try {
      const nations = await typeormService.getNationsByWorldId(worldId);
      return nations.map(nation => nation.toNationData());
    } catch (error) {
      console.error('获取国家列表失败:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.DELETE_NATION, async (_event, id: string) => {
    try {
      await typeormService.deleteNation(id);
    } catch (error) {
      console.error('删除国家失败:', error);
      throw error;
    }
  });

  // 派系操作
  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.SAVE_FACTION, async (_event, worldId: string, faction: any) => {
    try {
      const savedFaction = await typeormService.saveFaction(worldId, faction);
      return savedFaction.toFactionData();
    } catch (error) {
      console.error('保存派系失败:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.GET_FACTIONS, async (_event, worldId: string) => {
    try {
      const factions = await typeormService.getFactionsByWorldId(worldId);
      return factions.map(faction => faction.toFactionData());
    } catch (error) {
      console.error('获取派系列表失败:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.DELETE_FACTION, async (_event, id: string) => {
    try {
      await typeormService.deleteFaction(id);
    } catch (error) {
      console.error('删除派系失败:', error);
      throw error;
    }
  });

  // 力量体系操作
  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.SAVE_POWER_SYSTEM, async (_event, worldId: string, powerSystem: any) => {
    try {
      const savedPowerSystem = await typeormService.savePowerSystem(worldId, powerSystem);
      return savedPowerSystem.toPowerSystemData();
    } catch (error) {
      console.error('保存力量体系失败:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.GET_POWER_SYSTEMS, async (_event, worldId: string) => {
    try {
      const powerSystems = await typeormService.getPowerSystemsByWorldId(worldId);
      return powerSystems.map(ps => ps.toPowerSystemData());
    } catch (error) {
      console.error('获取力量体系列表失败:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.DELETE_POWER_SYSTEM, async (_event, id: string) => {
    try {
      await typeormService.deletePowerSystem(id);
    } catch (error) {
      console.error('删除力量体系失败:', error);
      throw error;
    }
  });

  // 角色操作
  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.SAVE_CHARACTER, async (_event, worldId: string, character: any) => {
    try {
      const savedCharacter = await typeormService.saveCharacter(worldId, character);
      return savedCharacter.toCharacterData();
    } catch (error) {
      console.error('保存角色失败:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.GET_CHARACTERS, async (_event, worldId: string) => {
    try {
      const characters = await typeormService.getCharactersByWorldId(worldId);
      return characters.map(char => char.toCharacterData());
    } catch (error) {
      console.error('获取角色列表失败:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.DELETE_CHARACTER, async (_event, id: string) => {
    try {
      await typeormService.deleteCharacter(id);
    } catch (error) {
      console.error('删除角色失败:', error);
      throw error;
    }
  });

  // 地图操作
  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.SAVE_MAP, async (_event, worldId: string, map: any) => {
    try {
      const savedMap = await typeormService.saveMap(worldId, map);
      return savedMap.toMapData();
    } catch (error) {
      console.error('保存地图失败:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.GET_MAPS, async (_event, worldId: string) => {
    try {
      const maps = await typeormService.getMapsByWorldId(worldId);
      return maps.map(map => map.toMapData());
    } catch (error) {
      console.error('获取地图列表失败:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.DELETE_MAP, async (_event, id: string) => {
    try {
      await typeormService.deleteMap(id);
    } catch (error) {
      console.error('删除地图失败:', error);
      throw error;
    }
  });

  // 关系操作
  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.SAVE_RELATIONSHIP, async (_event, worldId: string, relationship: any) => {
    try {
      const savedRelationship = await typeormService.saveRelationship(worldId, relationship);
      return savedRelationship;
    } catch (error) {
      console.error('保存关系失败:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.GET_RELATIONSHIPS, async (_event, worldId: string) => {
    try {
      return await typeormService.getRelationshipsByWorldId(worldId);
    } catch (error) {
      console.error('获取关系列表失败:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.GET_ENTITY_RELATIONSHIPS, async (_event, worldId: string, entityId: string, entityType: string) => {
    try {
      return await typeormService.getRelationshipsByEntity(worldId, entityId, entityType);
    } catch (error) {
      console.error('获取实体关系失败:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.DELETE_RELATIONSHIP, async (_event, id: string) => {
    try {
      await typeormService.deleteRelationship(id);
    } catch (error) {
      console.error('删除关系失败:', error);
      throw error;
    }
  });

  // 最近文件操作
  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.ADD_RECENT_FILE, async (_event, file: Omit<RecentFileData, 'id' | 'lastOpened' | 'createdAt' | 'updatedAt'>) => {
    try {
      await typeormService.addRecentFile(file);
    } catch (error) {
      console.error('添加最近文件失败:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.GET_RECENT_FILES, async (_event) => {
    try {
      const recentFiles = await typeormService.getRecentFiles();
      return recentFiles; // 直接返回Entity对象
    } catch (error) {
      console.error('获取最近文件失败:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.CLEAR_RECENT_FILES, async (_event) => {
    try {
      await typeormService.clearRecentFiles();
    } catch (error) {
      console.error('清空最近文件失败:', error);
      throw error;
    }
  });

  // 批量操作
  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.SAVE_WORLD_WITH_CONTENT, async (_event, world: BaseMetadata, content: UnifiedWorldData) => {
    try {
      await typeormService.saveWorldWithContent(world, content);
    } catch (error) {
      console.error('保存世界观和内容失败:', error);
      throw error;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.DELETE_WORLD_WITH_CONTENT, async (_event, worldId: string) => {
    try {
      await typeormService.deleteWorldWithAllContent(worldId);
    } catch (error) {
      console.error('删除世界观和所有内容失败:', error);
      throw error;
    }
  });

  // 系统操作
  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.HEALTH_CHECK, async (_event) => {
    try {
      return await typeormService.healthCheck();
    } catch (error) {
      console.error('数据库健康检查失败:', error);
      return false;
    }
  });

  ipcMain.handle(TYPEORM_DATABASE_CHANNELS.CLOSE_DATABASE, async (_event) => {
    try {
      await typeormService.close();
    } catch (error) {
      console.error('关闭数据库失败:', error);
      throw error;
    }
  });

  console.log('TypeORM数据库IPC处理器注册完成');
}

/**
 * 注销TypeORM数据库相关的IPC处理器
 */
export async function unregisterTypeORMDatabaseHandlers(): Promise<void> {
  // 移除所有TypeORM数据库相关的IPC处理器
  Object.values(TYPEORM_DATABASE_CHANNELS).forEach(channel => {
    ipcMain.removeAllListeners(channel);
  });
  
  // 关闭TypeORM服务
  try {
    await typeormService.close();
  } catch (error) {
    console.error('关闭TypeORM服务失败:', error);
  }
  
  console.log('TypeORM数据库IPC处理器已注销');
}

/**
 * 获取TypeORM服务实例（用于其他模块）
 */
export function getTypeORMService(): TypeORMService {
  return typeormService;
}