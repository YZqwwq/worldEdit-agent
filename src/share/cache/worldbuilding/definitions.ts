import { z } from 'zod'
import type {
  WorldEntityComponentSeedInput,
  WorldEntityType,
  WorldbuildingComponentDefinition,
  WorldbuildingEntityDefinition
} from './worldbuilding'

const nonEmptyString = z.string().trim().max(5000)
const entityRef = z.string().trim().max(120).default('')
const stringList = z.array(z.string().trim().min(1).max(120)).max(50).default([])

const characterProfileSchema = z.object({
  title: z.string().trim().max(120).default(''),
  summary: z.string().trim().max(1000).default(''),
  description: nonEmptyString.default(''),
  personalityTraits: stringList,
  abilities: stringList,
  tags: stringList
})

const characterDemographicSchema = z.object({
  age: z.number().int().min(0).max(100000).nullable().default(null),
  ageLabel: z.string().trim().max(120).default(''),
  gender: z.string().trim().max(60).default(''),
  raceEntityId: entityRef,
  factionEntityId: entityRef,
  nationEntityId: entityRef,
  birthplaceEntityId: entityRef
})

const raceProfileSchema = z.object({
  summary: z.string().trim().max(1000).default(''),
  description: nonEmptyString.default(''),
  origin: z.string().trim().max(500).default(''),
  lifespan: z.string().trim().max(120).default(''),
  physicalTraits: stringList,
  culturalTraits: stringList,
  abilities: stringList
})

const factionProfileSchema = z.object({
  summary: z.string().trim().max(1000).default(''),
  description: nonEmptyString.default(''),
  category: z.string().trim().max(120).default(''),
  ideology: z.string().trim().max(240).default(''),
  goals: stringList,
  baseEntityId: entityRef,
  sphereOfInfluence: z.string().trim().max(240).default('')
})

const nationProfileSchema = z.object({
  summary: z.string().trim().max(1000).default(''),
  description: nonEmptyString.default(''),
  governmentType: z.string().trim().max(120).default(''),
  capitalEntityId: entityRef,
  dominantRaceEntityId: entityRef,
  ideology: z.string().trim().max(240).default(''),
  coreTerritories: stringList
})

const componentSchemas = {
  character_profile: characterProfileSchema,
  character_demographic: characterDemographicSchema,
  race_profile: raceProfileSchema,
  faction_profile: factionProfileSchema,
  nation_profile: nationProfileSchema
} as const

type RegisteredComponentType = keyof typeof componentSchemas

const componentDefinitions: Record<RegisteredComponentType, WorldbuildingComponentDefinition> = {
  character_profile: {
    componentType: 'character_profile',
    displayName: '人物档案',
    description: '角色的核心描述、个性和能力概览。',
    entityTypes: ['character'],
    schemaVersion: 1,
    starterData: characterProfileSchema.parse({})
  },
  character_demographic: {
    componentType: 'character_demographic',
    displayName: '人物基础属性',
    description: '年龄、性别、所属种族与势力等基础归属信息。',
    entityTypes: ['character'],
    schemaVersion: 1,
    starterData: characterDemographicSchema.parse({})
  },
  race_profile: {
    componentType: 'race_profile',
    displayName: '种族档案',
    description: '种族来源、寿命、文化与能力特征。',
    entityTypes: ['race'],
    schemaVersion: 1,
    starterData: raceProfileSchema.parse({})
  },
  faction_profile: {
    componentType: 'faction_profile',
    displayName: '势力档案',
    description: '势力类别、理念、目标和影响范围。',
    entityTypes: ['faction'],
    schemaVersion: 1,
    starterData: factionProfileSchema.parse({})
  },
  nation_profile: {
    componentType: 'nation_profile',
    displayName: '国家档案',
    description: '国家体制、首都、主导种族与核心领土。',
    entityTypes: ['nation'],
    schemaVersion: 1,
    starterData: nationProfileSchema.parse({})
  }
}

const entityDefinitions: Record<string, WorldbuildingEntityDefinition> = {
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
