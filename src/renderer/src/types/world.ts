// 世界观数据类型定义

// 基础元数据
export interface BaseMetadata {
  id: string
  name: string
  createdAt: Date
  updatedAt: Date
  version: string
}

// 世界观主体数据
export interface WorldData extends BaseMetadata {
  description: string
  thumbnail?: string
  tags: string[]
  author: string
  lastModified: Date
}

// 地域数据
export interface GeographyData {
  id: string
  name: string
  type: 'continent' | 'country' | 'region' | 'city' | 'landmark'
  description: string
  parentId?: string
  coordinates?: { x: number; y: number }
  climate?: string
  resources?: string[]
}

// 国家数据
export interface NationData {
  id: string
  name: string
  description: string
  government: string
  culture: string
  economy: string
  military: string
  territories: string[] // GeographyData IDs
  relationships: RelationshipData[]
}

// 势力数据
export interface FactionData {
  id: string
  name: string
  type: 'political' | 'military' | 'religious' | 'economic' | 'secret'
  description: string
  goals: string[]
  resources: string[]
  influence: number
  territories?: string[]
  members: string[] // CharacterData IDs
}

// 武力体系数据
export interface PowerSystemData {
  id: string
  name: string
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
export interface CharacterData extends BaseMetadata {
  portrait?: {
    imageData: string
    layers: Layer[]
    metadata: ImageMetadata
  }
  description: {
    appearance: string
    personality: string
    background: string
    abilities: Ability[]
  }
  relationships: Relationship[]
  timeline: CharacterEvent[]
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

export interface Relationship {
  targetId: string
  type: 'family' | 'friend' | 'enemy' | 'ally' | 'mentor' | 'student' | 'lover' | 'rival'
  description: string
  strength: number // 1-10
}

export interface CharacterEvent {
  id: string
  date: string
  title: string
  description: string
  importance: number // 1-10
  relatedCharacters?: string[]
  relatedLocations?: string[]
}

// 地图数据
export interface MapData extends BaseMetadata {
  dimensions: { width: number; height: number }
  layers: {
    pixel: PixelLayerData[]
    vector: VectorLayerData[]
  }
  landmarks: Landmark[]
  regions: Region[]
  routes: Route[]
  scale: number
  projection: string
}

export interface Layer {
  id: string
  name: string
  visible: boolean
  opacity: number
  zIndex: number
}

export interface PixelLayerData extends Layer {
  type: 'pixel'
  imageData: string
  filters?: ImageFilter[]
}

export interface VectorLayerData extends Layer {
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

export interface Landmark {
  id: string
  name: string
  type: string
  coordinates: { x: number; y: number }
  description: string
  importance: number
  relatedCharacters?: string[]
  relatedEvents?: string[]
}

export interface Region {
  id: string
  name: string
  boundaries: { x: number; y: number }[]
  type: string
  properties: Record<string, any>
}

export interface Route {
  id: string
  name: string
  points: { x: number; y: number }[]
  type: 'road' | 'river' | 'trade' | 'military' | 'other'
  description: string
}

// 关系数据
export interface RelationshipData {
  id: string
  sourceId: string
  targetId: string
  type: string
  description: string
  strength: number
  isPublic: boolean
}

// 统一世界观数据模型
export interface UnifiedWorldData extends BaseMetadata {
  // WorldData properties
  description: string
  thumbnail?: string
  tags: string[]
  author: string
  lastModified: Date
  
  // 世界观内容数据
  geography: GeographyData[]
  nations: NationData[]
  factions: FactionData[]
  powerSystems: PowerSystemData[]
  timeline: TimelineEvent[]
  characters: CharacterData[]
  maps: MapData[]
  
  // 关联关系
  relationships: {
    textToCharacter: TextCharacterLink[]
    textToMap: TextMapLink[]
    characterToMap: CharacterMapLink[]
    crossReferences: CrossReference[]
  }
  
  // AI分析结果
  analysis?: {
    lastAnalyzed: Date
    consistency: ConsistencyReport
    suggestions: Suggestion[]
    insights: WorldInsight[]
  }
}

// 辅助类型
export interface TimelineEvent {
  id: string
  date: string
  title: string
  description: string
  type: 'political' | 'military' | 'cultural' | 'natural' | 'other'
  importance: number
  relatedEntities: {
    characters: string[]
    locations: string[]
    factions: string[]
  }
}

export interface TextCharacterLink {
  textId: string
  characterId: string
  context: string
  relevance: number
}

export interface TextMapLink {
  textId: string
  mapId: string
  locationId?: string
  context: string
}

export interface CharacterMapLink {
  characterId: string
  mapId: string
  locationId?: string
  relationship: string
}

export interface CrossReference {
  id: string
  sourceType: 'text' | 'character' | 'map'
  sourceId: string
  targetType: 'text' | 'character' | 'map'
  targetId: string
  relationship: string
  confidence: number
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

// 最近使用的文件
export interface RecentFile {
  id: string
  name: string
  path: string
  lastOpened: Date
  thumbnail?: string
  type: 'world'
}

// UI状态类型
export interface UIState {
  currentWorld?: UnifiedWorldData
  activeModule: 'home' | 'text' | 'character' | 'map' | 'ai'
  loading: boolean
  error?: string
}