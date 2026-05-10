import { randomUUID } from 'node:crypto'
import { AppDataSource } from '../../database'
import { WorldRecord } from '../../../share/entity/database/WorldRecord'
import { WorldEntityRecord } from '../../../share/entity/database/WorldEntityRecord'
import { WorldEntityComponentRecord } from '../../../share/entity/database/WorldEntityComponentRecord'
import { WorldEntityRelationRecord } from '../../../share/entity/database/WorldEntityRelationRecord'
import type {
  CreateWorldEntityInput,
  CreateWorldEntityRelationInput,
  CreateWorldInput,
  UpdateWorldEntityInput,
  UpdateWorldInput,
  UpsertWorldEntityComponentInput,
  WorldEntityComponentPayload,
  WorldEntityDetailPayload,
  WorldEntityPayload,
  WorldEntityRelationPayload,
  WorldPayload
} from '@share/cache/worldbuilding/worldbuilding'
import {
  buildWorldbuildingSchemaCatalog,
  buildStarterComponentSeeds,
  ensureComponentAllowedForEntityType,
  ensureRelationAllowedForEntityTypes,
  getWorldbuildingEntityDefinition,
  listWorldbuildingComponentDefinitions,
  listWorldbuildingEntityDefinitions,
  listWorldbuildingRelationDefinitions,
  validateWorldbuildingComponentData,
  validateWorldbuildingRelationData
} from '@share/cache/worldbuilding/definitions'

const DEFAULT_SCHEMA_VERSION = 1

type CharacterProfileSearchData = {
  title?: string
  summary?: string
  description?: string
  personalityTraits?: string[]
  abilities?: string[]
  tags?: string[]
}

type CharacterDemographicSearchData = {
  basicInfo?: {
    order?: string[]
    fields?: Record<
      string,
      {
        label?: string
        kind?: string
        value?: string | number | null
        entityType?: string
        custom?: boolean
        locked?: boolean
      }
    >
  }
}

type SearchCharacterEntitiesInput = {
  worldId?: string
  keyword?: string
  name?: string
  title?: string
  summary?: string
  gender?: string
  raceEntityId?: string
  factionEntityId?: string
  nationEntityId?: string
  birthplaceEntityId?: string
  personalityTraits?: string[]
  abilities?: string[]
  tags?: string[]
}

type CharacterSearchMatchPayload = {
  worldId: string
  worldName: string
  matchedFields: string[]
  entity: WorldEntityPayload
  profile: CharacterProfileSearchData
  demographic: CharacterDemographicSearchData
}

const normalizeSearchText = (value: unknown): string => String(value ?? '').trim().toLowerCase()

const normalizeSearchList = (value: string[] | undefined): string[] =>
  (value ?? []).map(normalizeSearchText).filter(Boolean)

const includesSearchText = (value: unknown, query?: string): boolean => {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return true
  return normalizeSearchText(value).includes(normalizedQuery)
}

const includesAllSearchValues = (source: unknown, queries: string[]): boolean => {
  if (queries.length === 0) return true

  const values = Array.isArray(source)
    ? source.map(normalizeSearchText).filter(Boolean)
    : [normalizeSearchText(source)].filter(Boolean)

  return queries.every((query) => values.some((value) => value.includes(query)))
}

const getBasicInfoValue = (demographic: CharacterDemographicSearchData, key: string): unknown =>
  demographic.basicInfo?.fields?.[key]?.value

const getBasicInfoSearchValues = (demographic: CharacterDemographicSearchData): unknown[] =>
  Object.values(demographic.basicInfo?.fields ?? {}).flatMap((field) => [
    field.label,
    field.value,
    field.entityType
  ])

const parseJsonObject = (input: string, fallback: Record<string, unknown> = {}): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(input)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // ignore bad persisted payloads and fall back to empty objects
  }
  return fallback
}

const toWorldPayload = (record: WorldRecord): WorldPayload => ({
  id: record.id,
  name: record.name,
  summary: record.summary || '',
  status: record.status,
  schemaVersion: record.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
  createdAt: record.createdAt?.toISOString(),
  updatedAt: record.updatedAt?.toISOString()
})

const toEntityPayload = (record: WorldEntityRecord): WorldEntityPayload => ({
  id: record.id,
  worldId: record.worldId,
  type: record.type,
  name: record.name,
  slug: record.slug || '',
  title: record.title || '',
  summary: record.summary || '',
  status: record.status,
  schemaVersion: record.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
  createdAt: record.createdAt?.toISOString(),
  updatedAt: record.updatedAt?.toISOString()
})

const toComponentPayload = (record: WorldEntityComponentRecord): WorldEntityComponentPayload => ({
  id: record.id,
  entityId: record.entityId,
  componentType: record.componentType,
  schemaVersion: record.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
  data: parseJsonObject(record.dataJson),
  createdAt: record.createdAt?.toISOString(),
  updatedAt: record.updatedAt?.toISOString()
})

const toRelationPayload = (record: WorldEntityRelationRecord): WorldEntityRelationPayload => ({
  id: record.id,
  worldId: record.worldId,
  sourceEntityId: record.sourceEntityId,
  targetEntityId: record.targetEntityId,
  relationType: record.relationType,
  direction: record.direction,
  data: parseJsonObject(record.dataJson),
  startTimeId: record.startTimeId || '',
  endTimeId: record.endTimeId || '',
  createdAt: record.createdAt?.toISOString(),
  updatedAt: record.updatedAt?.toISOString()
})

class WorldbuildingService {
  private get worldRepo() {
    return AppDataSource.getRepository(WorldRecord)
  }

  private get entityRepo() {
    return AppDataSource.getRepository(WorldEntityRecord)
  }

  private get componentRepo() {
    return AppDataSource.getRepository(WorldEntityComponentRecord)
  }

  private get relationRepo() {
    return AppDataSource.getRepository(WorldEntityRelationRecord)
  }

  async createWorld(input: CreateWorldInput): Promise<WorldPayload> {
    const name = String(input.name || '').trim()
    if (!name) throw new Error('World name is required')

    const record = this.worldRepo.create({
      id: randomUUID(),
      name,
      summary: String(input.summary || '').trim(),
      status: input.status || 'active',
      schemaVersion: DEFAULT_SCHEMA_VERSION
    })
    const saved = await this.worldRepo.save(record)
    return toWorldPayload(saved)
  }

  async listWorlds(): Promise<WorldPayload[]> {
    const worlds = await this.worldRepo.find({
      order: { updatedAt: 'DESC' }
    })
    return worlds.map(toWorldPayload)
  }

  async updateWorld(input: UpdateWorldInput): Promise<WorldPayload> {
    const worldId = String(input.worldId || '').trim()
    const name = String(input.name || '').trim()
    if (!worldId) throw new Error('worldId is required')
    if (!name) throw new Error('World name is required')

    const record = await this.worldRepo.findOneBy({ id: worldId })
    if (!record) throw new Error(`World not found: ${worldId}`)

    record.name = name
    record.summary = String(input.summary || '').trim()
    record.status = input.status || record.status || 'active'

    const saved = await this.worldRepo.save(record)
    return toWorldPayload(saved)
  }

  async deleteWorld(worldId: string): Promise<void> {
    const normalizedWorldId = String(worldId || '').trim()
    if (!normalizedWorldId) throw new Error('worldId is required')

    await AppDataSource.transaction(async (manager) => {
      const world = await manager.findOne(WorldRecord, { where: { id: normalizedWorldId } })
      if (!world) throw new Error(`World not found: ${normalizedWorldId}`)

      const entities = await manager.find(WorldEntityRecord, {
        where: { worldId: normalizedWorldId },
        select: ['id']
      })
      const entityIds = entities.map((item) => item.id)

      if (entityIds.length > 0) {
        await manager
          .createQueryBuilder()
          .delete()
          .from(WorldEntityComponentRecord)
          .where('entityId IN (:...entityIds)', { entityIds })
          .execute()
      }

      await manager.delete(WorldEntityRelationRecord, { worldId: normalizedWorldId })
      await manager.delete(WorldEntityRecord, { worldId: normalizedWorldId })
      await manager.delete(WorldRecord, { id: normalizedWorldId })
    })
  }

  async createEntity(input: CreateWorldEntityInput): Promise<WorldEntityPayload> {
    const worldId = String(input.worldId || '').trim()
    const name = String(input.name || '').trim()
    if (!worldId) throw new Error('worldId is required')
    if (!name) throw new Error('Entity name is required')

    const world = await this.worldRepo.findOneBy({ id: worldId })
    if (!world) throw new Error(`World not found: ${worldId}`)

    const slug = String(input.slug || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')

    const record = this.entityRepo.create({
      id: randomUUID(),
      worldId,
      type: input.type,
      name,
      slug,
      title: String(input.title || '').trim(),
      summary: String(input.summary || '').trim(),
      status: input.status || 'active',
      schemaVersion: DEFAULT_SCHEMA_VERSION
    })
    const saved = await this.entityRepo.save(record)

    const starterSeeds = input.initializeStarterComponents
      ? buildStarterComponentSeeds(input.type, input.initialComponents ?? [])
      : []
    const adHocSeeds =
      input.initializeStarterComponents === true
        ? []
        : (input.initialComponents ?? [])

    for (const componentSeed of [...starterSeeds, ...adHocSeeds]) {
      await this.upsertComponent({
        entityId: saved.id,
        componentType: componentSeed.componentType,
        schemaVersion: componentSeed.schemaVersion,
        data: componentSeed.data ?? {}
      })
    }

    return toEntityPayload(saved)
  }

  async listEntities(worldId: string, type?: WorldEntityPayload['type']): Promise<WorldEntityPayload[]> {
    const normalizedWorldId = String(worldId || '').trim()
    if (!normalizedWorldId) throw new Error('worldId is required')

    const where = type
      ? { worldId: normalizedWorldId, type }
      : { worldId: normalizedWorldId }

    const records = await this.entityRepo.find({
      where,
      order: { updatedAt: 'DESC' }
    })
    return records.map(toEntityPayload)
  }

  async searchCharacterEntities(input: SearchCharacterEntitiesInput): Promise<CharacterSearchMatchPayload[]> {
    const worldId = String(input.worldId || '').trim()
    const keyword = normalizeSearchText(input.keyword)
    const name = normalizeSearchText(input.name)
    const title = normalizeSearchText(input.title)
    const summary = normalizeSearchText(input.summary)
    const gender = normalizeSearchText(input.gender)
    const raceEntityId = normalizeSearchText(input.raceEntityId)
    const factionEntityId = normalizeSearchText(input.factionEntityId)
    const nationEntityId = normalizeSearchText(input.nationEntityId)
    const birthplaceEntityId = normalizeSearchText(input.birthplaceEntityId)
    const personalityTraits = normalizeSearchList(input.personalityTraits)
    const abilities = normalizeSearchList(input.abilities)
    const tags = normalizeSearchList(input.tags)

    const records = await this.entityRepo.find({
      where: worldId ? { worldId, type: 'character' } : { type: 'character' },
      order: { updatedAt: 'DESC' }
    })

    if (records.length === 0) {
      return []
    }

    const entityIds = records.map((record) => record.id)
    const componentRecords = await this.componentRepo
      .createQueryBuilder('component')
      .where('component.entityId IN (:...entityIds)', { entityIds })
      .andWhere('component.componentType IN (:...componentTypes)', {
        componentTypes: ['character_profile', 'character_demographic']
      })
      .getMany()

    const worldIds = [...new Set(records.map((record) => record.worldId))]
    const worlds = await this.worldRepo.find({
      where: worldIds.map((id) => ({ id }))
    })
    const worldNameMap = new Map(worlds.map((record) => [record.id, record.name]))

    const componentMap = new Map<
      string,
      {
        profile: CharacterProfileSearchData
        demographic: CharacterDemographicSearchData
      }
    >()

    for (const componentRecord of componentRecords) {
      const bucket = componentMap.get(componentRecord.entityId) ?? {
        profile: {},
        demographic: {}
      }
      const data = parseJsonObject(componentRecord.dataJson)
      if (componentRecord.componentType === 'character_profile') {
        bucket.profile = data as CharacterProfileSearchData
      } else if (componentRecord.componentType === 'character_demographic') {
        bucket.demographic = data as CharacterDemographicSearchData
      }
      componentMap.set(componentRecord.entityId, bucket)
    }

    const matches: CharacterSearchMatchPayload[] = []

    for (const record of records) {
      const componentBucket = componentMap.get(record.id) ?? { profile: {}, demographic: {} }
      const profile = componentBucket.profile
      const demographic = componentBucket.demographic
      const matchedFields = new Set<string>()

      if (worldId) {
        matchedFields.add('worldId')
      }

      const keywordMatched =
        !keyword ||
        [
          record.name,
          record.title,
          record.summary,
          profile.title,
          profile.summary,
          profile.description,
          ...(profile.personalityTraits ?? []),
          ...(profile.abilities ?? []),
          ...(profile.tags ?? []),
          ...getBasicInfoSearchValues(demographic)
        ].some((value) => includesSearchText(value, keyword))

      if (!keywordMatched) continue
      if (keyword) matchedFields.add('keyword')

      const nameMatched = includesSearchText(record.name, name)
      if (!nameMatched) continue
      if (name) matchedFields.add('name')

      const titleMatched = includesSearchText(record.title || profile.title, title)
      if (!titleMatched) continue
      if (title) matchedFields.add('title')

      const summaryMatched = includesSearchText(record.summary || profile.summary, summary)
      if (!summaryMatched) continue
      if (summary) matchedFields.add('summary')

      const genderMatched = includesSearchText(getBasicInfoValue(demographic, 'gender'), gender)
      if (!genderMatched) continue
      if (gender) matchedFields.add('gender')

      const raceMatched = includesSearchText(getBasicInfoValue(demographic, 'race'), raceEntityId)
      if (!raceMatched) continue
      if (raceEntityId) matchedFields.add('raceEntityId')

      const factionMatched = includesSearchText(getBasicInfoValue(demographic, 'faction'), factionEntityId)
      if (!factionMatched) continue
      if (factionEntityId) matchedFields.add('factionEntityId')

      const nationMatched = includesSearchText(getBasicInfoValue(demographic, 'nation'), nationEntityId)
      if (!nationMatched) continue
      if (nationEntityId) matchedFields.add('nationEntityId')

      const birthplaceMatched = includesSearchText(
        getBasicInfoValue(demographic, 'birthplace'),
        birthplaceEntityId
      )
      if (!birthplaceMatched) continue
      if (birthplaceEntityId) matchedFields.add('birthplaceEntityId')

      const traitsMatched = includesAllSearchValues(profile.personalityTraits, personalityTraits)
      if (!traitsMatched) continue
      if (personalityTraits.length > 0) matchedFields.add('personalityTraits')

      const abilitiesMatched = includesAllSearchValues(profile.abilities, abilities)
      if (!abilitiesMatched) continue
      if (abilities.length > 0) matchedFields.add('abilities')

      const tagsMatched = includesAllSearchValues(profile.tags, tags)
      if (!tagsMatched) continue
      if (tags.length > 0) matchedFields.add('tags')

      matches.push({
        worldId: record.worldId,
        worldName: worldNameMap.get(record.worldId) ?? '',
        matchedFields: [...matchedFields],
        entity: toEntityPayload(record),
        profile,
        demographic
      })
    }

    return matches
  }

  async updateEntity(input: UpdateWorldEntityInput): Promise<WorldEntityPayload> {
    const entityId = String(input.entityId || '').trim()
    const name = String(input.name || '').trim()
    if (!entityId) throw new Error('entityId is required')
    if (!name) throw new Error('Entity name is required')

    const record = await this.entityRepo.findOneBy({ id: entityId })
    if (!record) throw new Error(`Entity not found: ${entityId}`)

    record.name = name
    record.slug = String(input.slug || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
    record.title = String(input.title || '').trim()
    record.summary = String(input.summary || '').trim()
    record.status = input.status || record.status || 'active'

    const saved = await this.entityRepo.save(record)
    return toEntityPayload(saved)
  }

  async deleteEntity(entityId: string): Promise<void> {
    const normalizedEntityId = String(entityId || '').trim()
    if (!normalizedEntityId) throw new Error('entityId is required')

    await AppDataSource.transaction(async (manager) => {
      const entity = await manager.findOne(WorldEntityRecord, { where: { id: normalizedEntityId } })
      if (!entity) throw new Error(`Entity not found: ${normalizedEntityId}`)

      await manager.delete(WorldEntityComponentRecord, { entityId: normalizedEntityId })

      await manager
        .createQueryBuilder()
        .delete()
        .from(WorldEntityRelationRecord)
        .where('sourceEntityId = :entityId OR targetEntityId = :entityId', {
          entityId: normalizedEntityId
        })
        .execute()

      await manager.delete(WorldEntityRecord, { id: normalizedEntityId })
    })
  }

  async upsertComponent(
    input: UpsertWorldEntityComponentInput
  ): Promise<WorldEntityComponentPayload> {
    const entityId = String(input.entityId || '').trim()
    const componentType = String(input.componentType || '').trim()
    if (!entityId) throw new Error('entityId is required')
    if (!componentType) throw new Error('componentType is required')

    const entity = await this.entityRepo.findOneBy({ id: entityId })
    if (!entity) throw new Error(`Entity not found: ${entityId}`)

    ensureComponentAllowedForEntityType(componentType, entity.type)
    const normalizedData = validateWorldbuildingComponentData(componentType, input.data)

    let record = await this.componentRepo.findOneBy({ entityId, componentType })
    if (!record) {
      record = this.componentRepo.create({
        id: randomUUID(),
        entityId,
        componentType
      })
    }

    record.schemaVersion = input.schemaVersion ?? DEFAULT_SCHEMA_VERSION
    record.dataJson = JSON.stringify(normalizedData)

    const saved = await this.componentRepo.save(record)
    return toComponentPayload(saved)
  }

  async listComponents(entityId: string): Promise<WorldEntityComponentPayload[]> {
    const normalizedEntityId = String(entityId || '').trim()
    if (!normalizedEntityId) throw new Error('entityId is required')

    const records = await this.componentRepo.find({
      where: { entityId: normalizedEntityId },
      order: { updatedAt: 'DESC' }
    })
    return records.map(toComponentPayload)
  }

  async createRelation(
    input: CreateWorldEntityRelationInput
  ): Promise<WorldEntityRelationPayload> {
    const worldId = String(input.worldId || '').trim()
    const sourceEntityId = String(input.sourceEntityId || '').trim()
    const targetEntityId = String(input.targetEntityId || '').trim()
    const relationType = String(input.relationType || '').trim()

    if (!worldId) throw new Error('worldId is required')
    if (!sourceEntityId) throw new Error('sourceEntityId is required')
    if (!targetEntityId) throw new Error('targetEntityId is required')
    if (!relationType) throw new Error('relationType is required')

    const [world, sourceEntity, targetEntity] = await Promise.all([
      this.worldRepo.findOneBy({ id: worldId }),
      this.entityRepo.findOneBy({ id: sourceEntityId }),
      this.entityRepo.findOneBy({ id: targetEntityId })
    ])

    if (!world) throw new Error(`World not found: ${worldId}`)
    if (!sourceEntity) throw new Error(`Source entity not found: ${sourceEntityId}`)
    if (!targetEntity) throw new Error(`Target entity not found: ${targetEntityId}`)
    if (sourceEntity.worldId !== worldId || targetEntity.worldId !== worldId) {
      throw new Error('Relation entities must belong to the same world')
    }

    const normalizedData = validateWorldbuildingRelationData(relationType, input.data)
    const expectedDirection = ensureRelationAllowedForEntityTypes(
      relationType,
      sourceEntity.type,
      targetEntity.type
    )
    if (input.direction && input.direction !== expectedDirection) {
      throw new Error(
        `Relation "${relationType}" must use direction "${expectedDirection}", received "${input.direction}"`
      )
    }

    const record = this.relationRepo.create({
      id: randomUUID(),
      worldId,
      sourceEntityId,
      targetEntityId,
      relationType,
      direction: expectedDirection,
      dataJson: JSON.stringify(normalizedData),
      startTimeId: String(input.startTimeId || '').trim(),
      endTimeId: String(input.endTimeId || '').trim()
    })
    const saved = await this.relationRepo.save(record)
    return toRelationPayload(saved)
  }

  async listRelationsForEntity(entityId: string): Promise<WorldEntityRelationPayload[]> {
    const normalizedEntityId = String(entityId || '').trim()
    if (!normalizedEntityId) throw new Error('entityId is required')

    const records = await this.relationRepo
      .createQueryBuilder('relation')
      .where('relation.sourceEntityId = :entityId', { entityId: normalizedEntityId })
      .orWhere('relation.targetEntityId = :entityId', { entityId: normalizedEntityId })
      .orderBy('relation.updatedAt', 'DESC')
      .getMany()

    return records.map(toRelationPayload)
  }

  async getEntityDetail(entityId: string): Promise<WorldEntityDetailPayload | null> {
    const normalizedEntityId = String(entityId || '').trim()
    if (!normalizedEntityId) throw new Error('entityId is required')

    const entity = await this.entityRepo.findOneBy({ id: normalizedEntityId })
    if (!entity) return null

    const [components, relations] = await Promise.all([
      this.listComponents(normalizedEntityId),
      this.listRelationsForEntity(normalizedEntityId)
    ])

    return {
      entity: toEntityPayload(entity),
      components,
      relations
    }
  }

  listEntityDefinitions() {
    return listWorldbuildingEntityDefinitions()
  }

  listComponentDefinitions(entityType?: WorldEntityPayload['type']) {
    return listWorldbuildingComponentDefinitions(entityType)
  }

  listRelationDefinitions() {
    return listWorldbuildingRelationDefinitions()
  }

  getSchemaCatalog() {
    return buildWorldbuildingSchemaCatalog()
  }

  getEntityDefinition(entityType: WorldEntityPayload['type']) {
    return getWorldbuildingEntityDefinition(entityType)
  }
}

export const worldbuildingService = new WorldbuildingService()
