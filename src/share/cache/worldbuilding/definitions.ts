import { z } from 'zod'
import type {
  RelationDirection,
  WorldEntityComponentSeedInput,
  WorldEntityType,
  WorldbuildingComponentDefinition,
  WorldbuildingEntityDefinition,
  WorldbuildingFieldDefinition,
  WorldbuildingRelationDefinition,
  WorldbuildingSchemaCatalogPayload
} from './worldbuilding'

const shortText = z.string().trim().max(240).default('')
const mediumText = z.string().trim().max(1000).default('')
const longText = z.string().trim().max(5000).default('')
const richLongText = z.string().trim().max(40000).default('')
const entityRef = z.string().trim().max(120).default('')
const stringList = z.array(z.string().trim().min(1).max(120)).max(50).default([])
const entityRefList = z.array(z.string().trim().min(1).max(120)).max(50).default([])
const relationNotesSchema = z.object({
  summary: mediumText,
  notes: stringList,
  confidence: z.number().min(0).max(1).nullable().default(null)
})

const editorAppearanceSchema = z.object({
  fontScale: z.number().min(0.9).max(1.4).default(1),
  lineHeight: z.number().min(1.5).max(2.2).default(1.75),
  contentWidth: z.number().min(640).max(1200).default(860),
  paragraphSpacing: z.number().min(0.5).max(1.4).default(0.75),
  headingScale: z.number().min(0.9).max(1.35).default(1)
})

const portraitTransformSchema = z.object({
  offsetX: z.number().min(-2000).max(2000).default(0),
  offsetY: z.number().min(-2000).max(2000).default(0),
  scale: z.number().min(0.45).max(2.5).default(1)
})

const portraitVisualLayerSchema = z.object({
  imageUrl: z.string().trim().max(2000).default(''),
  resourceUrl: z.string().trim().max(2000).default(''),
  x: z.number().min(0).max(1).default(0.5),
  y: z.number().min(0).max(1).default(0.5),
  scale: z.number().min(0.4).max(2.4).default(1),
  width: z.number().int().min(1).max(50000).optional(),
  height: z.number().int().min(1).max(50000).optional()
})

const portraitTextBlockSchema = z.object({
  id: z.string().trim().max(120),
  fieldKey: z
    .enum(['name', 'title', 'summary', 'age', 'gender', 'race', 'faction', 'nation', 'birthplace', 'height'])
    .default('name'),
  rect: z.object({
    x: z.number().min(0).max(1).default(0.16),
    y: z.number().min(0).max(1).default(0.14),
    w: z.number().min(0.12).max(0.72).default(0.32),
    h: z.number().min(0.08).max(0.42).default(0.14)
  }),
  fontFamily: z.string().trim().max(240).default('"Noto Serif SC", "Source Han Serif SC", serif'),
  fontWeight: z.enum(['400', '500', '600', '700']).default('600'),
  fontStyle: z.enum(['normal', 'italic']).default('normal'),
  textAlign: z.enum(['left', 'center', 'right']).default('left'),
  textColor: z.string().trim().max(32).default('#111111'),
  boxStyle: z.enum(['none', 'frosted', 'fill']).default('frosted')
})

const portraitStudioSchema = z.object({
  mode: z.enum(['portrait', 'landscape']).default('portrait'),
  background: portraitVisualLayerSchema.default({
    imageUrl: '',
    resourceUrl: '',
    x: 0.5,
    y: 0.5,
    scale: 1.08
  }),
  character: portraitVisualLayerSchema.default({
    imageUrl: '',
    resourceUrl: '',
    x: 0.5,
    y: 0.56,
    scale: 1
  }),
  textBlocks: z.array(portraitTextBlockSchema).max(20).default([])
})

const portraitStudiosByModeSchema = z.object({
  portrait: portraitStudioSchema.default(
    portraitStudioSchema.parse({
      mode: 'portrait'
    })
  ),
  landscape: portraitStudioSchema.default(
    portraitStudioSchema.parse({
      mode: 'landscape'
    })
  )
})

const portraitDocumentResourceUrlsSchema = z.object({
  portrait: z.string().trim().max(2000).default(''),
  landscape: z.string().trim().max(2000).default('')
})

const field = (
  key: string,
  displayName: string,
  description: string,
  fieldKind: WorldbuildingFieldDefinition['fieldKind'],
  options: Partial<WorldbuildingFieldDefinition> = {}
): WorldbuildingFieldDefinition => ({
  key,
  displayName,
  description,
  fieldKind,
  ...options
})

const characterProfileSchema = z.object({
  title: z.string().trim().max(120).default(''),
  summary: mediumText,
  description: richLongText,
  descriptionFormat: z.enum(['markdown', 'html']).default('markdown'),
  portraitResourceUrl: z.string().trim().max(2000).default(''),
  portraitDocumentResourceUrl: z.string().trim().max(2000).default(''),
  portraitDocumentResourceUrls: portraitDocumentResourceUrlsSchema.default(
    portraitDocumentResourceUrlsSchema.parse({})
  ),
  portraitTransform: portraitTransformSchema.default(portraitTransformSchema.parse({})),
  portraitStudio: portraitStudioSchema.default(portraitStudioSchema.parse({})),
  portraitStudiosByMode: portraitStudiosByModeSchema.default(portraitStudiosByModeSchema.parse({})),
  portraitActiveMode: z.enum(['portrait', 'landscape']).default('portrait'),
  layoutVariant: z.enum(['v1', 'v2', 'v3']).default('v1'),
  editorAppearance: editorAppearanceSchema.default(editorAppearanceSchema.parse({})),
  personalityTraits: stringList,
  abilities: stringList,
  tags: stringList
})

const characterDemographicSchema = z.object({
  age: z.number().int().min(0).max(100000).nullable().default(null),
  ageLabel: z.string().trim().max(120).default(''),
  heightLabel: z.string().trim().max(120).default(''),
  gender: z.string().trim().max(60).default(''),
  raceEntityId: entityRef,
  factionEntityId: entityRef,
  nationEntityId: entityRef,
  birthplaceEntityId: entityRef
})

const raceProfileSchema = z.object({
  summary: mediumText,
  description: longText,
  origin: shortText,
  lifespan: z.string().trim().max(120).default(''),
  physicalTraits: stringList,
  culturalTraits: stringList,
  abilities: stringList
})

const factionProfileSchema = z.object({
  summary: mediumText,
  description: longText,
  category: z.string().trim().max(120).default(''),
  ideology: shortText,
  goals: stringList,
  baseEntityId: entityRef,
  sphereOfInfluence: shortText
})

const nationProfileSchema = z.object({
  summary: mediumText,
  description: longText,
  governmentType: z.string().trim().max(120).default(''),
  capitalEntityId: entityRef,
  dominantRaceEntityId: entityRef,
  ideology: shortText,
  coreTerritories: stringList
})

const cityProfileSchema = z.object({
  summary: mediumText,
  description: longText,
  nationEntityId: entityRef,
  regionEntityId: entityRef,
  populationLabel: z.string().trim().max(120).default(''),
  landmarks: stringList,
  tags: stringList
})

const regionProfileSchema = z.object({
  summary: mediumText,
  description: longText,
  climate: z.string().trim().max(120).default(''),
  terrain: stringList,
  controllingNationEntityId: entityRef,
  majorCityEntityIds: entityRefList
})

const mapProfileSchema = z.object({
  summary: mediumText,
  description: longText,
  mapKind: z.string().trim().max(120).default(''),
  representedRegionEntityIds: entityRefList,
  scaleLabel: z.string().trim().max(120).default(''),
  layerNotes: stringList
})

const mapLocationProfileSchema = z.object({
  summary: mediumText,
  description: longText,
  mapEntityId: entityRef,
  parentRegionEntityId: entityRef,
  coordinateLabel: z.string().trim().max(120).default(''),
  tags: stringList
})

const eventProfileSchema = z.object({
  summary: mediumText,
  description: longText,
  eventType: z.string().trim().max(120).default(''),
  locationEntityId: entityRef,
  participantEntityIds: entityRefList,
  eraLabel: z.string().trim().max(120).default(''),
  consequences: stringList
})

const itemProfileSchema = z.object({
  summary: mediumText,
  description: longText,
  category: z.string().trim().max(120).default(''),
  ownerEntityId: entityRef,
  originEntityId: entityRef,
  abilities: stringList,
  tags: stringList
})

const ruleProfileSchema = z.object({
  summary: mediumText,
  description: longText,
  category: z.string().trim().max(120).default(''),
  scopeLabel: z.string().trim().max(240).default(''),
  exceptions: stringList,
  examples: stringList
})

const customProfileSchema = z.object({
  summary: mediumText,
  description: longText,
  category: z.string().trim().max(120).default(''),
  referenceEntityIds: entityRefList,
  tags: stringList
})

const componentSchemas = {
  character_profile: characterProfileSchema,
  character_demographic: characterDemographicSchema,
  race_profile: raceProfileSchema,
  faction_profile: factionProfileSchema,
  nation_profile: nationProfileSchema,
  city_profile: cityProfileSchema,
  region_profile: regionProfileSchema,
  map_profile: mapProfileSchema,
  map_location_profile: mapLocationProfileSchema,
  event_profile: eventProfileSchema,
  item_profile: itemProfileSchema,
  rule_profile: ruleProfileSchema,
  custom_profile: customProfileSchema
} as const

const relationSchemas = {
  parent_of: relationNotesSchema,
  member_of: relationNotesSchema,
  governs: relationNotesSchema,
  located_in: relationNotesSchema,
  part_of: relationNotesSchema,
  allied_with: relationNotesSchema,
  hostile_to: relationNotesSchema,
  originates_from: relationNotesSchema,
  possesses: relationNotesSchema,
  participates_in: relationNotesSchema
} as const

type RegisteredComponentType = keyof typeof componentSchemas
type RegisteredRelationType = keyof typeof relationSchemas

const relationFields = [
  field('summary', '关系摘要', '这条关系的简短说明。', 'text', { multiline: true }),
  field('notes', '备注', '补充说明或证据点。', 'string_list'),
  field('confidence', '可信度', '如果这是推断性设定，可记录 0-1 的置信度。', 'number')
]

const componentDefinitions: Record<RegisteredComponentType, WorldbuildingComponentDefinition> = {
  character_profile: {
    componentType: 'character_profile',
    displayName: '人物档案',
    description: '角色的核心描述、个性和能力概览。',
    entityTypes: ['character'],
    schemaVersion: 1,
    starterData: characterProfileSchema.parse({}),
    fields: [
      field('title', '称号', '角色的头衔、代称或常用称呼。', 'string'),
      field('summary', '摘要', '一句话概括角色定位。', 'text'),
      field('description', '详细描述', '角色的完整描述文案。', 'text', { multiline: true }),
      field('portraitResourceUrl', '立绘资源', '角色立绘的静态资源地址。', 'string'),
      field('portraitDocumentResourceUrl', '立绘工程文件', '完整保留图层信息的立绘工程资源地址。', 'string'),
      field('portraitDocumentResourceUrls', '多画幅立绘工程文件', '按竖屏与横屏分别保存的立绘工程资源地址。', 'text'),
      field('portraitTransform', '立绘变换', '角色立绘的位置偏移与缩放。', 'text'),
      field('portraitStudio', '立绘编辑状态', '立绘编辑器保存的轻量图层状态。', 'text'),
      field('portraitStudiosByMode', '多画幅立绘状态', '按竖屏与横屏分别保存的立绘编辑状态。', 'text'),
      field('portraitActiveMode', '当前编辑画幅', '立绘编辑器最近一次使用的画幅模式。', 'string'),
      field('layoutVariant', '排版方案', '角色卡面使用的布局版本。', 'string'),
      field('personalityTraits', '性格特征', '角色稳定的性格关键词。', 'string_list'),
      field('abilities', '能力', '角色拥有的能力、技能或专长。', 'string_list'),
      field('tags', '标签', '便于检索的自由标签。', 'string_list')
    ]
  },
  character_demographic: {
    componentType: 'character_demographic',
    displayName: '人物基础属性',
    description: '年龄、性别、所属种族与势力等基础归属信息。',
    entityTypes: ['character'],
    schemaVersion: 1,
    starterData: characterDemographicSchema.parse({}),
    fields: [
      field('age', '年龄', '角色的数字年龄，可为空。', 'number'),
      field('ageLabel', '年龄标签', '例如幼年、青年、永生体等。', 'string'),
      field('heightLabel', '身高', '身高描述，例如 172cm。', 'string'),
      field('gender', '性别', '角色的性别或性别认同。', 'string'),
      field('raceEntityId', '所属种族', '引用一个种族实体。', 'entity_ref', {
        entityTypes: ['race']
      }),
      field('factionEntityId', '所属势力', '引用一个势力实体。', 'entity_ref', {
        entityTypes: ['faction']
      }),
      field('nationEntityId', '所属国家', '引用一个国家实体。', 'entity_ref', {
        entityTypes: ['nation']
      }),
      field('birthplaceEntityId', '出生地', '引用一个城市或区域实体。', 'entity_ref', {
        entityTypes: ['city', 'region']
      })
    ]
  },
  race_profile: {
    componentType: 'race_profile',
    displayName: '种族档案',
    description: '种族来源、寿命、文化与能力特征。',
    entityTypes: ['race'],
    schemaVersion: 1,
    starterData: raceProfileSchema.parse({}),
    fields: [
      field('summary', '摘要', '一句话概括这个种族。', 'text'),
      field('description', '详细描述', '种族的完整介绍。', 'text', { multiline: true }),
      field('origin', '起源', '神话或历史起源。', 'string'),
      field('lifespan', '寿命', '寿命范围或寿命特征。', 'string'),
      field('physicalTraits', '生理特征', '体貌与生理关键词。', 'string_list'),
      field('culturalTraits', '文化特征', '共同文化习惯或价值观。', 'string_list'),
      field('abilities', '天赋能力', '种族共有能力。', 'string_list')
    ]
  },
  faction_profile: {
    componentType: 'faction_profile',
    displayName: '势力档案',
    description: '势力类别、理念、目标和影响范围。',
    entityTypes: ['faction'],
    schemaVersion: 1,
    starterData: factionProfileSchema.parse({}),
    fields: [
      field('summary', '摘要', '一句话概括这个势力。', 'text'),
      field('description', '详细描述', '势力的完整介绍。', 'text', { multiline: true }),
      field('category', '类别', '如宗教、军团、商会、学院。', 'string'),
      field('ideology', '理念', '核心主张、信条或意识形态。', 'string'),
      field('goals', '目标', '势力追求的长期目标。', 'string_list'),
      field('baseEntityId', '据点', '主要据点，引用城市或区域。', 'entity_ref', {
        entityTypes: ['city', 'region']
      }),
      field('sphereOfInfluence', '影响范围', '势力影响力的覆盖说明。', 'string')
    ]
  },
  nation_profile: {
    componentType: 'nation_profile',
    displayName: '国家档案',
    description: '国家体制、首都、主导种族与核心领土。',
    entityTypes: ['nation'],
    schemaVersion: 1,
    starterData: nationProfileSchema.parse({}),
    fields: [
      field('summary', '摘要', '一句话概括这个国家。', 'text'),
      field('description', '详细描述', '国家的完整介绍。', 'text', { multiline: true }),
      field('governmentType', '政体', '如帝国、联邦、城邦。', 'string'),
      field('capitalEntityId', '首都', '引用一个城市实体。', 'entity_ref', {
        entityTypes: ['city']
      }),
      field('dominantRaceEntityId', '主导种族', '引用一个种族实体。', 'entity_ref', {
        entityTypes: ['race']
      }),
      field('ideology', '核心理念', '国家的政治或文化主轴。', 'string'),
      field('coreTerritories', '核心领土', '领土名称或区域标签。', 'string_list')
    ]
  },
  city_profile: {
    componentType: 'city_profile',
    displayName: '城市档案',
    description: '城市的地理归属、人口与地标。',
    entityTypes: ['city'],
    schemaVersion: 1,
    starterData: cityProfileSchema.parse({}),
    fields: [
      field('summary', '摘要', '一句话概括这座城市。', 'text'),
      field('description', '详细描述', '城市风貌、功能和故事背景。', 'text', { multiline: true }),
      field('nationEntityId', '所属国家', '引用一个国家实体。', 'entity_ref', {
        entityTypes: ['nation']
      }),
      field('regionEntityId', '所属区域', '引用一个区域实体。', 'entity_ref', {
        entityTypes: ['region']
      }),
      field('populationLabel', '人口标签', '例如百万人口、要塞小镇。', 'string'),
      field('landmarks', '地标', '城市中的代表性地点。', 'string_list'),
      field('tags', '标签', '检索辅助标签。', 'string_list')
    ]
  },
  region_profile: {
    componentType: 'region_profile',
    displayName: '区域档案',
    description: '区域的气候、地形和所属体系。',
    entityTypes: ['region'],
    schemaVersion: 1,
    starterData: regionProfileSchema.parse({}),
    fields: [
      field('summary', '摘要', '一句话概括这个区域。', 'text'),
      field('description', '详细描述', '区域生态、文化和战略价值。', 'text', { multiline: true }),
      field('climate', '气候', '该区域主要气候。', 'string'),
      field('terrain', '地形', '地貌与地形关键词。', 'string_list'),
      field('controllingNationEntityId', '主要控制国家', '引用一个国家实体。', 'entity_ref', {
        entityTypes: ['nation']
      }),
      field('majorCityEntityIds', '重要城市', '引用多个城市实体。', 'entity_ref_list', {
        entityTypes: ['city']
      })
    ]
  },
  map_profile: {
    componentType: 'map_profile',
    displayName: '地图档案',
    description: '地图的覆盖范围、类型和图层说明。',
    entityTypes: ['map'],
    schemaVersion: 1,
    starterData: mapProfileSchema.parse({}),
    fields: [
      field('summary', '摘要', '一句话概括这张地图。', 'text'),
      field('description', '详细描述', '地图用途、风格和构图说明。', 'text', { multiline: true }),
      field('mapKind', '地图类型', '如政治地图、地形图、航海图。', 'string'),
      field('representedRegionEntityIds', '表现区域', '引用多个区域实体。', 'entity_ref_list', {
        entityTypes: ['region']
      }),
      field('scaleLabel', '比例信息', '地图比例或尺度说明。', 'string'),
      field('layerNotes', '图层说明', '不同图层或标记说明。', 'string_list')
    ]
  },
  map_location_profile: {
    componentType: 'map_location_profile',
    displayName: '地图标注档案',
    description: '地图上的标注点、坐标和归属。',
    entityTypes: ['map_location'],
    schemaVersion: 1,
    starterData: mapLocationProfileSchema.parse({}),
    fields: [
      field('summary', '摘要', '一句话概括这个标注点。', 'text'),
      field('description', '详细描述', '这个地点的用途与背景。', 'text', { multiline: true }),
      field('mapEntityId', '所在地图', '引用一张地图实体。', 'entity_ref', {
        entityTypes: ['map']
      }),
      field('parentRegionEntityId', '所属区域', '引用一个区域实体。', 'entity_ref', {
        entityTypes: ['region']
      }),
      field('coordinateLabel', '坐标标签', '地图上的坐标或位置表达。', 'string'),
      field('tags', '标签', '检索辅助标签。', 'string_list')
    ]
  },
  event_profile: {
    componentType: 'event_profile',
    displayName: '事件档案',
    description: '事件的类型、参与方、地点和后果。',
    entityTypes: ['event'],
    schemaVersion: 1,
    starterData: eventProfileSchema.parse({}),
    fields: [
      field('summary', '摘要', '一句话概括事件。', 'text'),
      field('description', '详细描述', '事件经过、起因与影响。', 'text', { multiline: true }),
      field('eventType', '事件类型', '如战争、政变、灾变、庆典。', 'string'),
      field('locationEntityId', '发生地点', '引用一个城市、区域或地图标注实体。', 'entity_ref', {
        entityTypes: ['city', 'region', 'map_location']
      }),
      field('participantEntityIds', '参与方', '引用多个角色、势力或国家实体。', 'entity_ref_list', {
        entityTypes: ['character', 'faction', 'nation', 'race']
      }),
      field('eraLabel', '时代标签', '如第一纪元末、王朝中期。', 'string'),
      field('consequences', '结果', '事件造成的直接后果。', 'string_list')
    ]
  },
  item_profile: {
    componentType: 'item_profile',
    displayName: '物品档案',
    description: '物品的用途、来源、持有者和能力。',
    entityTypes: ['item'],
    schemaVersion: 1,
    starterData: itemProfileSchema.parse({}),
    fields: [
      field('summary', '摘要', '一句话概括该物品。', 'text'),
      field('description', '详细描述', '物品外观、来历和用途。', 'text', { multiline: true }),
      field('category', '类别', '如神器、武器、凭证、材料。', 'string'),
      field('ownerEntityId', '当前持有者', '引用角色、势力或国家实体。', 'entity_ref', {
        entityTypes: ['character', 'faction', 'nation']
      }),
      field('originEntityId', '来源', '引用事件、地区或势力实体。', 'entity_ref', {
        entityTypes: ['event', 'region', 'faction', 'nation']
      }),
      field('abilities', '效果', '物品能力或特殊性质。', 'string_list'),
      field('tags', '标签', '检索辅助标签。', 'string_list')
    ]
  },
  rule_profile: {
    componentType: 'rule_profile',
    displayName: '规则档案',
    description: '世界中的法则、制度或系统规则。',
    entityTypes: ['rule'],
    schemaVersion: 1,
    starterData: ruleProfileSchema.parse({}),
    fields: [
      field('summary', '摘要', '一句话概括该规则。', 'text'),
      field('description', '详细描述', '规则内容、适用场景与影响。', 'text', { multiline: true }),
      field('category', '类别', '如魔法法则、政治法令、社会习俗。', 'string'),
      field('scopeLabel', '适用范围', '说明这条规则作用于哪里或谁。', 'string'),
      field('exceptions', '例外', '不受此规则约束的情况。', 'string_list'),
      field('examples', '案例', '帮助理解这条规则的例子。', 'string_list')
    ]
  },
  custom_profile: {
    componentType: 'custom_profile',
    displayName: '自定义档案',
    description: '暂未归类的实体，可用来自定义扩展。',
    entityTypes: ['custom'],
    schemaVersion: 1,
    starterData: customProfileSchema.parse({}),
    fields: [
      field('summary', '摘要', '一句话概括该实体。', 'text'),
      field('description', '详细描述', '该实体的完整说明。', 'text', { multiline: true }),
      field('category', '类别', '自定义分类名。', 'string'),
      field('referenceEntityIds', '关联实体', '引用相关实体。', 'entity_ref_list'),
      field('tags', '标签', '检索辅助标签。', 'string_list')
    ]
  }
}

const entityDefinitions: Record<WorldEntityType, WorldbuildingEntityDefinition> = {
  character: {
    entityType: 'character',
    displayName: '人物',
    description: '世界中的角色个体。',
    starterComponentTypes: ['character_profile', 'character_demographic']
  },
  race: {
    entityType: 'race',
    displayName: '种族',
    description: '具有共同生理或文化特征的群体。',
    starterComponentTypes: ['race_profile']
  },
  faction: {
    entityType: 'faction',
    displayName: '势力',
    description: '组织、阵营、公会或政治团体。',
    starterComponentTypes: ['faction_profile']
  },
  nation: {
    entityType: 'nation',
    displayName: '国家',
    description: '具有主权、领土与政治结构的国家实体。',
    starterComponentTypes: ['nation_profile']
  },
  city: {
    entityType: 'city',
    displayName: '城市',
    description: '世界中的城市、聚落或据点。',
    starterComponentTypes: ['city_profile']
  },
  region: {
    entityType: 'region',
    displayName: '区域',
    description: '大陆、行省、荒原、群岛等地理区域。',
    starterComponentTypes: ['region_profile']
  },
  map: {
    entityType: 'map',
    displayName: '地图',
    description: '世界地图、局部地图或专题地图。',
    starterComponentTypes: ['map_profile']
  },
  map_location: {
    entityType: 'map_location',
    displayName: '地图标注',
    description: '地图上的位置标记、地点注释或坐标点。',
    starterComponentTypes: ['map_location_profile']
  },
  event: {
    entityType: 'event',
    displayName: '事件',
    description: '世界中的历史事件、冲突、仪式或灾变。',
    starterComponentTypes: ['event_profile']
  },
  item: {
    entityType: 'item',
    displayName: '物品',
    description: '具备叙事意义的物件、神器或工具。',
    starterComponentTypes: ['item_profile']
  },
  rule: {
    entityType: 'rule',
    displayName: '规则',
    description: '世界中的制度、法则、魔法规则或习俗。',
    starterComponentTypes: ['rule_profile']
  },
  custom: {
    entityType: 'custom',
    displayName: '自定义',
    description: '尚未归类的实体类型，用于扩展。',
    starterComponentTypes: ['custom_profile']
  }
}

const relationDefinitions: Record<RegisteredRelationType, WorldbuildingRelationDefinition> = {
  parent_of: {
    relationType: 'parent_of',
    displayName: '亲属 / 上代',
    description: '角色之间的亲属或上代关系。',
    sourceEntityTypes: ['character'],
    targetEntityTypes: ['character'],
    direction: 'directed',
    schemaVersion: 1,
    starterData: relationSchemas.parent_of.parse({}),
    fields: relationFields
  },
  member_of: {
    relationType: 'member_of',
    displayName: '成员隶属',
    description: '角色、城市或组织隶属于更大的势力或国家。',
    sourceEntityTypes: ['character', 'city', 'faction'],
    targetEntityTypes: ['faction', 'nation', 'region'],
    direction: 'directed',
    schemaVersion: 1,
    starterData: relationSchemas.member_of.parse({}),
    fields: relationFields
  },
  governs: {
    relationType: 'governs',
    displayName: '治理 / 统治',
    description: '角色、势力或国家对某个目标实施治理或统治。',
    sourceEntityTypes: ['character', 'faction', 'nation'],
    targetEntityTypes: ['nation', 'city', 'region', 'faction'],
    direction: 'directed',
    schemaVersion: 1,
    starterData: relationSchemas.governs.parse({}),
    fields: relationFields
  },
  located_in: {
    relationType: 'located_in',
    displayName: '位于',
    description: '实体在地理上位于某个区域、国家或地图中。',
    sourceEntityTypes: ['city', 'region', 'map_location', 'event', 'item', 'faction'],
    targetEntityTypes: ['region', 'nation', 'map', 'city'],
    direction: 'directed',
    schemaVersion: 1,
    starterData: relationSchemas.located_in.parse({}),
    fields: relationFields
  },
  part_of: {
    relationType: 'part_of',
    displayName: '组成 / 隶属部分',
    description: '一个实体是另一个实体的组成部分。',
    sourceEntityTypes: ['city', 'region', 'map_location', 'item', 'faction'],
    targetEntityTypes: ['region', 'nation', 'map', 'item', 'faction'],
    direction: 'directed',
    schemaVersion: 1,
    starterData: relationSchemas.part_of.parse({}),
    fields: relationFields
  },
  allied_with: {
    relationType: 'allied_with',
    displayName: '同盟',
    description: '两个实体之间的联盟或合作关系。',
    sourceEntityTypes: ['character', 'faction', 'nation', 'race'],
    targetEntityTypes: ['character', 'faction', 'nation', 'race'],
    direction: 'undirected',
    schemaVersion: 1,
    starterData: relationSchemas.allied_with.parse({}),
    fields: relationFields
  },
  hostile_to: {
    relationType: 'hostile_to',
    displayName: '敌对',
    description: '两个实体之间的敌对或冲突关系。',
    sourceEntityTypes: ['character', 'faction', 'nation', 'race'],
    targetEntityTypes: ['character', 'faction', 'nation', 'race'],
    direction: 'undirected',
    schemaVersion: 1,
    starterData: relationSchemas.hostile_to.parse({}),
    fields: relationFields
  },
  originates_from: {
    relationType: 'originates_from',
    displayName: '起源于',
    description: '实体来源于某个地区、国家、事件或种族。',
    sourceEntityTypes: ['character', 'race', 'item', 'faction'],
    targetEntityTypes: ['region', 'nation', 'city', 'event', 'race'],
    direction: 'directed',
    schemaVersion: 1,
    starterData: relationSchemas.originates_from.parse({}),
    fields: relationFields
  },
  possesses: {
    relationType: 'possesses',
    displayName: '持有 / 拥有',
    description: '角色、势力或国家拥有某个物品或规则资源。',
    sourceEntityTypes: ['character', 'faction', 'nation'],
    targetEntityTypes: ['item', 'rule'],
    direction: 'directed',
    schemaVersion: 1,
    starterData: relationSchemas.possesses.parse({}),
    fields: relationFields
  },
  participates_in: {
    relationType: 'participates_in',
    displayName: '参与',
    description: '角色、势力、国家等参与某个事件。',
    sourceEntityTypes: ['character', 'faction', 'nation', 'race', 'item'],
    targetEntityTypes: ['event'],
    direction: 'directed',
    schemaVersion: 1,
    starterData: relationSchemas.participates_in.parse({}),
    fields: relationFields
  }
}

export const listWorldbuildingEntityDefinitions = (): WorldbuildingEntityDefinition[] =>
  Object.values(entityDefinitions)

export const getWorldbuildingEntityDefinition = (
  entityType: WorldEntityType
): WorldbuildingEntityDefinition | null => entityDefinitions[entityType] ?? null

export const listWorldbuildingComponentDefinitions = (
  entityType?: WorldEntityType
): WorldbuildingComponentDefinition[] => {
  const all = Object.values(componentDefinitions)
  if (!entityType) return all
  return all.filter((definition) => definition.entityTypes.includes(entityType))
}

export const getWorldbuildingComponentDefinition = (
  componentType: string
): WorldbuildingComponentDefinition | null =>
  componentDefinitions[componentType as RegisteredComponentType] ?? null

export const listWorldbuildingRelationDefinitions = (): WorldbuildingRelationDefinition[] =>
  Object.values(relationDefinitions)

export const getWorldbuildingRelationDefinition = (
  relationType: string
): WorldbuildingRelationDefinition | null =>
  relationDefinitions[relationType as RegisteredRelationType] ?? null

export const buildWorldbuildingSchemaCatalog = (): WorldbuildingSchemaCatalogPayload => ({
  entityDefinitions: listWorldbuildingEntityDefinitions(),
  componentDefinitions: listWorldbuildingComponentDefinitions(),
  relationDefinitions: listWorldbuildingRelationDefinitions()
})

export const validateWorldbuildingComponentData = (
  componentType: string,
  data: unknown
): Record<string, unknown> => {
  const schema = componentSchemas[componentType as RegisteredComponentType]

  if (!schema) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error(`Component "${componentType}" must be a JSON object`)
    }
    return data as Record<string, unknown>
  }

  return schema.parse(data ?? {}) as Record<string, unknown>
}

export const validateWorldbuildingRelationData = (
  relationType: string,
  data: unknown
): Record<string, unknown> => {
  const schema = relationSchemas[relationType as RegisteredRelationType]

  if (!schema) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error(`Relation "${relationType}" must be a JSON object`)
    }
    return data as Record<string, unknown>
  }

  return schema.parse(data ?? {}) as Record<string, unknown>
}

export const ensureComponentAllowedForEntityType = (
  componentType: string,
  entityType: WorldEntityType
): void => {
  const definition = getWorldbuildingComponentDefinition(componentType)
  if (!definition) return
  if (!definition.entityTypes.includes(entityType)) {
    throw new Error(`Component "${componentType}" is not allowed for entity type "${entityType}"`)
  }
}

export const ensureRelationAllowedForEntityTypes = (
  relationType: string,
  sourceEntityType: WorldEntityType,
  targetEntityType: WorldEntityType
): RelationDirection => {
  const definition = getWorldbuildingRelationDefinition(relationType)
  if (!definition) {
    return 'directed'
  }

  if (!definition.sourceEntityTypes.includes(sourceEntityType)) {
    throw new Error(
      `Relation "${relationType}" is not allowed for source entity type "${sourceEntityType}"`
    )
  }

  if (!definition.targetEntityTypes.includes(targetEntityType)) {
    throw new Error(
      `Relation "${relationType}" is not allowed for target entity type "${targetEntityType}"`
    )
  }

  return definition.direction
}

export const buildStarterComponentSeeds = (
  entityType: WorldEntityType,
  overrides: WorldEntityComponentSeedInput[] = []
): WorldEntityComponentSeedInput[] => {
  const entityDefinition = getWorldbuildingEntityDefinition(entityType)
  if (!entityDefinition) {
    return overrides
  }

  const overrideMap = new Map(overrides.map((item) => [item.componentType, item]))

  const starterSeeds = entityDefinition.starterComponentTypes.map((componentType) => {
    const definition = getWorldbuildingComponentDefinition(componentType)
    const override = overrideMap.get(componentType)
    return {
      componentType,
      schemaVersion: override?.schemaVersion ?? definition?.schemaVersion ?? 1,
      data: {
        ...(definition?.starterData ?? {}),
        ...((override?.data as Record<string, unknown> | undefined) ?? {})
      }
    }
  })

  const extraOverrides = overrides.filter(
    (item) => !entityDefinition.starterComponentTypes.includes(item.componentType)
  )

  return [...starterSeeds, ...extraOverrides]
}
