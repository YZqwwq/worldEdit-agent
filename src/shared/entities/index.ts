// TypeORM实体导出
export { Character } from './Character.entity'
export { Faction } from './Faction.entity'
export { Geography } from './Geography.entity'
export { Map } from './Map.entity'
export { Nation } from './Nation.entity'
export { PowerSystem } from './PowerSystem.entity'
export { RecentFile } from './RecentFile.entity'
export { Relationship } from './Relationship.entity'
export { World } from './World.entity'
export { WorldContent } from './WorldContent.entity'
// ModelConfig已合并到AgentConfig中

import { World } from './World.entity';
import { WorldContent } from './WorldContent.entity';
import { Geography } from './Geography.entity';
import { Nation } from './Nation.entity';
import { Faction } from './Faction.entity';
import { PowerSystem } from './PowerSystem.entity';
import { Character } from './Character.entity';
import { Map } from './Map.entity';
import { Relationship } from './Relationship.entity';
import { RecentFile } from './RecentFile.entity';
// ModelConfig已合并到AgentConfig中
import { agentEntities } from './agent';

// 重新导出agent相关实体和枚举
export * from './agent';

// 实体数组，用于TypeORM配置
export const entities = [
  World,
  WorldContent,
  Geography,
  Nation,
  Faction,
  PowerSystem,
  Character,
  Map,
  Relationship,
  RecentFile,
  ...agentEntities
];