// 世界观数据类型定义

// 统一基础实体接口
export interface BaseEntity {
  id: string
  createdAt: Date
  updatedAt: Date
}

// 基础元数据接口（用于世界观基本信息）
export interface BaseMetadata extends BaseEntity {
  name: string
  description: string
  version: string
  tags: string[]
  author: string
  thumbnail?: string
  lastModified: Date
}

export interface NamedEntity extends BaseEntity {
  name: string
}

export interface VersionedEntity extends BaseEntity {
  version: string
}

export interface TaggableEntity {
  tags: string[]
}

export interface AuthorableEntity {
  author: string
}

export interface ThumbnailableEntity {
  thumbnail?: string
}

export interface SoftDeletableEntity {
  deletedAt?: Date
}

// 世界观主体数据
export interface WorldData extends NamedEntity, VersionedEntity, TaggableEntity, AuthorableEntity, ThumbnailableEntity {
  description: string
  lastModified: Date
}

// 地域数据
export interface GeographyData extends NamedEntity {
  type: 'continent' | 'country' | 'region' | 'city' | 'landmark'
  description: string
  parentId?: string
  coordinates?: { x: number; y: number }
  climate?: string
  resources?: string[]
}

// 国家数据
export interface NationData extends NamedEntity {
  description: string
  government: string
  culture: string
  economy: string
  military: string
  territories: string[] // GeographyData IDs
  relationships: EntityRelationship[]
}

// 势力数据
export interface FactionData extends NamedEntity {
  type: 'political' | 'military' | 'religious' | 'economic' | 'secret'
  description: string
  goals: string[]
  resources: string[]
  influence: number
  territories?: string[]
  members: string[] // CharacterData IDs
}

// 武力体系数据
export interface PowerSystemData extends NamedEntity {
  type: 'magic' | 'technology' | 'martial' | 'divine' | 'other'
  description: string
  levels: PowerLevel[]
  rules: string[]
  limitations: string[]
}

export interface PowerLevel {
  level: number
  name: string
  description: string
  abilities: string[]
  requirements: string[]
}

// 人物数据
export interface CharacterData extends NamedEntity, VersionedEntity {
  portrait?: {
    imageData: string
    layers: LayerData[]
    metadata: ImageMetadata
  }
  description: {
    appearance: string
    personality: string
    background: string
    abilities: Ability[]
  }
  relationships: EntityRelationship[]
  timeline: TimelineEvent[]
  factionId?: string
  powerLevel?: {
    systemId: string
    level: number
    abilities: string[]
  }
}

export interface Ability {
  id: string
  name: string
  description: string
  type: string
  powerSystemId?: string
}

// 统一关系数据模型
export type RelationshipType = 'family' | 'friend' | 'enemy' | 'ally' | 'mentor' | 'student' | 'lover' | 'rival' | 'political' | 'economic' | 'military' | 'cultural'

export interface EntityRelationship extends BaseEntity {
  sourceId: string
  targetId: string
  type: RelationshipType
  description: string
  strength: number // 1-10
  isPublic: boolean
  startDate?: string
  endDate?: string
}

// 关系历史事件接口
export interface RelationshipHistoryEvent {
  date: string
  event: string
  description?: string
  impact?: string
  strengthChange?: number
}

// 关系属性接口
export interface RelationshipProperties {
  isPublic?: boolean
  isOfficial?: boolean
  duration?: string
  conditions?: string[]
  benefits?: string[]
  obligations?: string[]
}

// 关系文档接口
export interface RelationshipDocument {
  name: string
  type: string
  date: string
  description?: string
}

// 关系影响因素接口
export interface RelationshipInfluences {
  externalFactors?: string[]
  keyEvents?: string[]
  mediators?: string[]
  obstacles?: string[]
}

// 关系未来展望接口
export interface RelationshipFuture {
  trajectory?: string
  potentialChanges?: string[]
  risks?: string[]
  opportunities?: string[]
}

// 完整的关系数据模型（与TypeORM实体对应）
export interface RelationshipData extends BaseEntity {
  worldId: string
  sourceId: string
  sourceType: string // character, nation, faction, geography等
  targetId: string
  targetType: string // character, nation, faction, geography等
  relationshipType: string // ally, enemy, neutral, family, trade, etc.
  status: string // active, inactive, historical, secret等
  strength?: number // -100 to 100, 负数表示敌对，正数表示友好
  description?: string
  history?: RelationshipHistoryEvent[]
  properties?: RelationshipProperties
  documents?: RelationshipDocument[]
  influences?: RelationshipInfluences
  future?: RelationshipFuture
}

// 统一时间线事件模型
export type EventType = 'political' | 'military' | 'cultural' | 'natural' | 'personal' | 'economic' | 'other'

export interface TimelineEvent extends NamedEntity {
  date: string
  title: string
  description: string
  type: EventType
  importance: number // 1-10
  relatedEntities: {
    characters: string[]
    locations: string[]
    factions: string[]
    nations: string[]
  }
}

// 地图数据
export interface MapData extends NamedEntity {
  dimensions: { width: number; height: number }
  type: string
  layers: {
    pixel: PixelLayerData[]
    vector: VectorLayerData[]
  }
  landmarks: LandmarkData[]
  regions: RegionData[]
  routes: RouteData[]
  scale: number
  projection: string
}

// 统一图层定义
export interface LayerData extends NamedEntity {
  visible: boolean
  opacity: number
  zIndex: number
}

export interface PixelLayerData extends LayerData {
  type: 'pixel'
  imageData: string
  filters?: ImageFilter[]
}

export interface VectorLayerData extends LayerData {
  type: 'vector'
  elements: VectorElement[]
}

export interface VectorElement {
  id: string
  type: 'path' | 'circle' | 'rectangle' | 'text' | 'marker'
  properties: Record<string, any>
  style: {
    fill?: string
    stroke?: string
    strokeWidth?: number
    opacity?: number
  }
}

export interface LandmarkData extends NamedEntity {
  type: string
  coordinates: { x: number; y: number }
  description: string
  importance: number
  relatedCharacters?: string[]
  relatedEvents?: string[]
}

export interface RegionData extends NamedEntity {
  boundaries: { x: number; y: number }[]
  type: string
  properties: Record<string, any>
}

export interface RouteData extends NamedEntity {
  points: { x: number; y: number }[]
  type: 'road' | 'river' | 'trade' | 'military' | 'other'
  description: string
}



// 统一世界观数据模型（用于数据传输和存储）
export interface UnifiedWorldData extends BaseMetadata {
  // 核心内容数据
  geography: GeographyData[]
  nations: NationData[]
  factions: FactionData[]
  powerSystems: PowerSystemData[]
  characters: CharacterData[]
  maps: MapData[]
  timeline: TimelineEvent[]
  relationships: EntityRelationship[]
  
  // 扩展数据
  items?: ItemData[]
  events?: TimelineEvent[]
}

// 简化的世界观数据模型
export interface WorldContent extends WorldData {
  // 核心内容数据
  geography: GeographyData[]
  nations: NationData[]
  factions: FactionData[]
  powerSystems: PowerSystemData[]
  characters: CharacterData[]
  maps: MapData[]
  timeline: TimelineEvent[]
  relationships: EntityRelationship[]
  
  // 扩展数据
  items?: ItemData[]
  events?: TimelineEvent[]
}

export interface ItemData extends NamedEntity {
  type: string
  description: string
  properties: Record<string, any>
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  value?: number
  ownerId?: string
}

// 完整的世界观数据模型（用于复杂场景）
export interface CompleteWorldData extends WorldContent {
  // 关联关系
  crossReferences: CrossReference[]
  
  // AI分析结果
  analysis?: {
    lastAnalyzed: Date
    consistency: ConsistencyReport
    suggestions: Suggestion[]
    insights: WorldInsight[]
  }
}

// 辅助类型

export interface CrossReference extends BaseEntity {
  sourceType: 'geography' | 'nation' | 'faction' | 'character' | 'map' | 'item' | 'event'
  sourceId: string
  targetType: 'geography' | 'nation' | 'faction' | 'character' | 'map' | 'item' | 'event'
  targetId: string
  relationship: string
  confidence: number
  context?: string
}

export interface ConsistencyReport {
  score: number
  issues: ConsistencyIssue[]
  lastChecked: Date
}

export interface ConsistencyIssue {
  id: string
  type: 'contradiction' | 'missing_info' | 'inconsistency'
  severity: 'low' | 'medium' | 'high'
  description: string
  affectedEntities: string[]
  suggestions: string[]
}

export interface Suggestion {
  id: string
  type: 'enhancement' | 'correction' | 'addition'
  title: string
  description: string
  targetEntity: string
  confidence: number
}

export interface WorldInsight {
  id: string
  category: 'theme' | 'pattern' | 'relationship' | 'potential'
  title: string
  description: string
  evidence: string[]
  confidence: number
}

// 图像相关类型
export interface ImageMetadata {
  width: number
  height: number
  format: string
  size: number
  createdAt: Date
}

export interface ImageFilter {
  type: string
  parameters: Record<string, any>
}

// 最近使用的文件类型已移至 shared/entities/RecentFile.entity.ts

// UI状态类型
export interface UIState {
  currentWorld?: CompleteWorldData
  activeModule: 'home' | 'world' | 'character' | 'map' | 'analysis'
  loading: boolean
  error?: string
  selectedEntityId?: string
  selectedEntityType?: string
}

// 类型工具和辅助函数
export type EntityId = string

export type EntityType = 'geography' | 'nation' | 'faction' | 'character' | 'map' | 'item' | 'event' | 'powerSystem'

export interface EntityReference {
  id: EntityId
  type: EntityType
  name?: string
}

// 创建实体数据类型（用于新建）
export type CreateEntityData<T extends BaseEntity> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>

// 更新实体数据类型（用于编辑）
export type UpdateEntityData<T extends BaseEntity> = Partial<Omit<T, 'id' | 'createdAt'>> & {
  id: string
  updatedAt: Date
}

// API响应类型
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// 查询结果类型
export interface QueryResult<T> {
  items: T[]
  total: number
  page?: number
  pageSize?: number
}

// 验证结果类型
export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
}

export interface ValidationError {
  field: string
  message: string
  code: string
}

// 实体类型映射
export interface EntityTypeMap {
  geography: GeographyData
  nation: NationData
  faction: FactionData
  character: CharacterData
  map: MapData
  item: ItemData
  event: TimelineEvent
  powerSystem: PowerSystemData
}

// 获取实体数据类型的工具类型
export type GetEntityData<T extends EntityType> = EntityTypeMap[T]