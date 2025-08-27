// TypeORM实体导出
export { World } from './World.entity';
export { WorldContent } from './WorldContent.entity';
export { Geography } from './Geography.entity';
export { Nation } from './Nation.entity';
export { Faction } from './Faction.entity';
export { PowerSystem } from './PowerSystem.entity';
export { Character } from './Character.entity';
export { Map } from './Map.entity';
export { Relationship } from './Relationship.entity';
export { RecentFile } from './RecentFile.entity';

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
  RecentFile
];