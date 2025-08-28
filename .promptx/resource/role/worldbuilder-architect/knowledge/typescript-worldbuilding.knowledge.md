# TypeScript世界观建模知识库

## TypeScript高级类型系统

### 🔧 核心类型工具

#### 1. 映射类型 (Mapped Types)
```typescript
// 创建可选版本的类型
type Partial<T> = {
  [P in keyof T]?: T[P];
};

// 世界观数据的创建类型
type CreateWorldData = Partial<Omit<WorldData, 'id' | 'createdAt' | 'updatedAt'>>;

// 更新类型
type UpdateWorldData = Partial<Pick<WorldData, 'name' | 'description' | 'tags'>>;
```

#### 2. 条件类型 (Conditional Types)
```typescript
// 根据条件选择类型
type ApiResponse<T> = T extends string 
  ? { message: T } 
  : { data: T };

// 世界观查询结果类型
type WorldQueryResult<T extends boolean> = T extends true 
  ? WorldData & { nations: NationData[]; factions: FactionData[] }
  : WorldData;
```

#### 3. 模板字面量类型
```typescript
// 动态生成事件类型
type WorldEvent = `world:${string}`;
type NationEvent = `nation:${string}`;
type AllEvents = WorldEvent | NationEvent;

// 示例：'world:created' | 'world:updated' | 'nation:founded'
```

### 🏗️ 数据建模模式

#### 1. 基础实体模式
```typescript
// 基础元数据接口
interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

// 可命名实体
interface NamedEntity extends BaseEntity {
  name: string;
  description?: string;
}

// 可标记实体
interface TaggableEntity {
  tags: string[];
}

// 组合使用
interface WorldData extends NamedEntity, TaggableEntity {
  author: string;
  thumbnail?: string;
  // 世界观特有属性
}
```

#### 2. 关系建模模式
```typescript
// 一对一关系
interface World {
  id: string;
  geography: GeographyData; // 直接嵌入
}

// 一对多关系
interface World {
  id: string;
  nations: NationData[]; // 数组引用
}

// 多对多关系
interface Nation {
  id: string;
  allies: string[]; // ID数组
  enemies: string[]; // ID数组
}

// 关系查询辅助类型
type WorldWithRelations = World & {
  nations: NationData[];
  factions: FactionData[];
};
```

#### 3. 层次结构模式
```typescript
// 树形结构
interface HierarchicalEntity extends BaseEntity {
  parentId?: string;
  children?: HierarchicalEntity[];
  level: number;
  path: string; // 如："/continent/kingdom/province"
}

// 地理层次
interface GeographicRegion extends HierarchicalEntity {
  type: 'continent' | 'kingdom' | 'province' | 'city';
  coordinates?: [number, number];
  area?: number;
}
```

## 世界观设计理论

### 🌍 世界观构成要素

#### 1. 地理系统 (Geography)
```typescript
interface GeographyData {
  // 物理地理
  terrain: TerrainType[];
  climate: ClimateZone[];
  naturalResources: Resource[];
  
  // 人文地理
  settlements: Settlement[];
  tradeRoutes: TradeRoute[];
  borders: Border[];
  
  // 特殊地点
  landmarks: Landmark[];
  dungeons: Dungeon[];
}

type TerrainType = 'mountain' | 'forest' | 'desert' | 'ocean' | 'plains';
type ClimateZone = 'tropical' | 'temperate' | 'arctic' | 'arid';
```

#### 2. 政治系统 (Politics)
```typescript
interface PoliticalSystem {
  // 政府形式
  governmentType: GovernmentType;
  ruler: Character;
  succession: SuccessionType;
  
  // 行政区划
  administrativeDivisions: AdministrativeDivision[];
  
  // 法律体系
  laws: Law[];
  courts: Court[];
  
  // 外交关系
  treaties: Treaty[];
  embassies: Embassy[];
}

type GovernmentType = 'monarchy' | 'republic' | 'democracy' | 'theocracy' | 'anarchy';
type SuccessionType = 'hereditary' | 'elective' | 'appointed' | 'meritocratic';
```

#### 3. 社会文化 (Culture)
```typescript
interface CulturalSystem {
  // 语言文字
  languages: Language[];
  writingSystems: WritingSystem[];
  
  // 宗教信仰
  religions: Religion[];
  deities: Deity[];
  
  // 社会结构
  socialClasses: SocialClass[];
  professions: Profession[];
  
  // 文化传统
  festivals: Festival[];
  customs: Custom[];
  arts: ArtForm[];
}
```

#### 4. 经济系统 (Economy)
```typescript
interface EconomicSystem {
  // 货币体系
  currencies: Currency[];
  exchangeRates: ExchangeRate[];
  
  // 贸易体系
  markets: Market[];
  guilds: Guild[];
  tradeGoods: TradeGood[];
  
  // 产业结构
  industries: Industry[];
  resources: NaturalResource[];
  
  // 经济政策
  taxes: Tax[];
  regulations: Regulation[];
}
```

### 📊 数据关系设计原则

#### 1. 规范化vs反规范化
```typescript
// 规范化：减少冗余，保证一致性
interface Nation {
  id: string;
  name: string;
  capitalId: string; // 引用城市ID
}

interface City {
  id: string;
  name: string;
  nationId: string; // 引用国家ID
}

// 反规范化：提高查询性能
interface Nation {
  id: string;
  name: string;
  capital: {
    id: string;
    name: string;
    population: number;
  }; // 嵌入常用信息
}
```

#### 2. 版本控制策略
```typescript
interface VersionedEntity extends BaseEntity {
  version: number;
  changelog: ChangelogEntry[];
}

interface ChangelogEntry {
  version: number;
  timestamp: Date;
  changes: Change[];
  author: string;
}

interface Change {
  field: string;
  oldValue: any;
  newValue: any;
  operation: 'create' | 'update' | 'delete';
}
```

#### 3. 软删除模式
```typescript
interface SoftDeletableEntity extends BaseEntity {
  deletedAt?: Date;
  deletedBy?: string;
  isDeleted: boolean;
}

// 查询时自动过滤已删除项
type ActiveEntity<T extends SoftDeletableEntity> = T & {
  isDeleted: false;
  deletedAt: undefined;
};
```

## TypeORM最佳实践

### 🔧 实体定义

#### 1. 装饰器使用
```typescript
@Entity('worlds')
@Index(['name', 'author']) // 复合索引
export class World implements WorldData {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column({ length: 255 })
  @Index() // 单字段索引
  name: string;
  
  @Column('text', { nullable: true })
  description?: string;
  
  @Column('simple-array')
  tags: string[];
  
  @CreateDateColumn()
  createdAt: Date;
  
  @UpdateDateColumn()
  updatedAt: Date;
  
  @VersionColumn()
  version: number;
}
```

#### 2. 关系映射
```typescript
@Entity('nations')
export class Nation {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  // 多对一关系
  @ManyToOne(() => World, world => world.nations, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'world_id' })
  world: World;
  
  // 一对多关系
  @OneToMany(() => City, city => city.nation, {
    cascade: true,
    lazy: true
  })
  cities: Promise<City[]>;
  
  // 多对多关系
  @ManyToMany(() => Nation, nation => nation.enemies)
  @JoinTable({
    name: 'nation_alliances',
    joinColumn: { name: 'nation_id' },
    inverseJoinColumn: { name: 'ally_id' }
  })
  allies: Nation[];
}
```

#### 3. 查询优化
```typescript
// 预加载关系
const worldWithNations = await worldRepository.findOne({
  where: { id: worldId },
  relations: ['nations', 'nations.cities']
});

// 延迟加载
const world = await worldRepository.findOne({ where: { id: worldId } });
const nations = await world.nations; // 触发延迟加载

// 查询构建器
const nations = await nationRepository
  .createQueryBuilder('nation')
  .leftJoinAndSelect('nation.cities', 'city')
  .where('nation.worldId = :worldId', { worldId })
  .orderBy('nation.name', 'ASC')
  .getMany();
```

### 📈 性能优化策略

#### 1. 索引策略
```typescript
// 单字段索引
@Index()
@Column()
name: string;

// 复合索引
@Index(['worldId', 'type'])
@Entity()
export class Nation {
  @Column()
  worldId: string;
  
  @Column()
  type: string;
}

// 唯一索引
@Index({ unique: true })
@Column()
email: string;
```

#### 2. 查询优化
```typescript
// 分页查询
const [nations, total] = await nationRepository.findAndCount({
  where: { worldId },
  take: 20,
  skip: page * 20,
  order: { name: 'ASC' }
});

// 选择性字段
const nations = await nationRepository.find({
  select: ['id', 'name', 'population'],
  where: { worldId }
});

// 原生查询（复杂查询）
const result = await entityManager.query(`
  SELECT n.*, COUNT(c.id) as city_count
  FROM nations n
  LEFT JOIN cities c ON c.nation_id = n.id
  WHERE n.world_id = $1
  GROUP BY n.id
`, [worldId]);
```

这个知识库为世界观数据架构设计提供了完整的理论基础和实践指导。