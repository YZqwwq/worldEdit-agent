import { UnifiedWorldData, WorldData } from '@renderer/types/world'
import { databaseService } from './DatabaseClient'

// 重新导出数据库客户端和相关类型
export { DatabaseClient, DatabaseService, databaseClient, databaseService } from './DatabaseClient'
export type { 
  WorldData, 
  UnifiedWorldData, 
  CharacterData, 
  MapData, 
  RelationshipData, 
  RecentFile 
} from '../../../shared/types/world'

// 数据库接口定义（保持兼容性）
export interface DatabaseSchema {
  worlds: WorldData
  worldContent: UnifiedWorldData
  characters: CharacterData
  maps: MapData
  relationships: RelationshipData 
  recentFiles: RecentFile
}

// 导出兼容性别名（保持向后兼容）
export const db = databaseService