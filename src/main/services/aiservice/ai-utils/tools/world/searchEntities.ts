import { z } from 'zod'
import { worldbuildingService } from '../../../../worldbuilding/worldbuildingService'
import { defineAgentTool } from '../../core/agentTool'
import { worldEntityPayloadSchema, worldEntityTypeSchema, worldPayloadSchema } from './shared'

const normalizeText = (value: unknown): string => String(value ?? '').trim().toLowerCase()

const includesQuery = (value: unknown, query: string): boolean =>
  normalizeText(value).includes(query)

const searchEntitiesInputSchema = z
  .object({
    worldId: z.string().trim().min(1).optional(),
    worldName: z.string().trim().min(1).optional(),
    entityType: worldEntityTypeSchema.optional(),
    name: z.string().trim().min(1).optional(),
    keyword: z.string().trim().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional()
  })
  .refine(
    (input) =>
      Boolean(input.worldId || input.worldName || input.entityType || input.name || input.keyword),
    {
      message: 'At least one search condition is required.'
    }
  )

const searchEntitiesOutputSchema = z.object({
  resolvedWorldCount: z.number().int().min(0),
  count: z.number().int().min(0),
  entities: z.array(
    z.object({
      world: worldPayloadSchema,
      matchedFields: z.array(z.string()),
      entity: worldEntityPayloadSchema
    })
  )
})

export const searchEntitiesTool = defineAgentTool({
  name: 'search_entities',
  description: 'Search entities across one or more worlds by world selector, entity type, name, or keyword.',
  inputSchema: searchEntitiesInputSchema,
  outputSchema: searchEntitiesOutputSchema,
  metadata: {
    whenToUse: [
      '已经有部分线索，但还没有稳定的 entityId',
      '用户给了世界名、实体名或关键词，需要先找到候选实体',
      '主 agent 需要做比 list_entities 更接近自然语言的目标解析'
    ],
    whenNotToUse: [
      '已经明确知道 entityId，应直接调用 get_entity_detail',
      '只想列出某个世界的所有实体且 worldId 已明确，可直接用 list_entities',
      '查询明确只针对人物实体且需要人物字段过滤，可优先用 list_characters'
    ],
    inputSummary: '提供 worldId 或 worldName，可选 entityType；可再提供 name、keyword 和 limit。',
    outputSummary: '返回候选实体列表，每项包含所属 world、matchedFields 和 entity 基础信息。',
    examples: [
      '用户说“星港联邦的首都”，可先用 worldName + keyword + entityType=city 搜索候选实体。'
    ],
    riskLevel: 'low',
    readOnly: true,
    idempotent: true
  },
  async execute(input) {
    const allWorlds = await worldbuildingService.listWorlds()
    const worldId = input.worldId?.trim()
    const worldNameQuery = normalizeText(input.worldName)
    const nameQuery = normalizeText(input.name)
    const keywordQuery = normalizeText(input.keyword)
    const limit = input.limit ?? 20

    const resolvedWorlds = worldId
      ? allWorlds.filter((world) => world.id === worldId)
      : worldNameQuery
        ? allWorlds.filter((world) => {
            const normalizedName = normalizeText(world.name)
            return normalizedName === worldNameQuery || normalizedName.includes(worldNameQuery)
          })
        : allWorlds

    const matches: Array<z.infer<typeof searchEntitiesOutputSchema>['entities'][number]> = []

    for (const world of resolvedWorlds) {
      const entities = await worldbuildingService.listEntities(world.id, input.entityType)
      for (const entity of entities) {
        const matchedFields = new Set<string>()

        if (worldId && entity.worldId === worldId) {
          matchedFields.add('worldId')
        }
        if (worldNameQuery && includesQuery(world.name, worldNameQuery)) {
          matchedFields.add('worldName')
        }
        if (input.entityType && entity.type === input.entityType) {
          matchedFields.add('entityType')
        }
        if (nameQuery) {
          const matchedName =
            includesQuery(entity.name, nameQuery) ||
            includesQuery(entity.title, nameQuery)
          if (!matchedName) {
            continue
          }
          matchedFields.add('name')
        }
        if (keywordQuery) {
          const matchedKeyword =
            includesQuery(entity.name, keywordQuery) ||
            includesQuery(entity.title, keywordQuery) ||
            includesQuery(entity.summary, keywordQuery) ||
            includesQuery(entity.slug, keywordQuery) ||
            includesQuery(entity.type, keywordQuery)
          if (!matchedKeyword) {
            continue
          }
          matchedFields.add('keyword')
        }

        if (!nameQuery && !keywordQuery && matchedFields.size === 0) {
          matchedFields.add('scope')
        }

        matches.push({
          world,
          matchedFields: [...matchedFields],
          entity
        })

        if (matches.length >= limit) {
          return {
            resolvedWorldCount: resolvedWorlds.length,
            count: matches.length,
            entities: matches
          }
        }
      }
    }

    return {
      resolvedWorldCount: resolvedWorlds.length,
      count: matches.length,
      entities: matches
    }
  },
  successMessage(data) {
    return `Found ${data.count} entity candidate(s) across ${data.resolvedWorldCount} resolved world(s).`
  },
  nextSuggestions(data) {
    if (data.count === 0) {
      return ['Try changing the world selector, loosening the keyword, or falling back to list_worlds / list_entities.']
    }
    return ['Pick a returned entityId and call get_entity_detail to inspect the full record before making decisions.']
  }
})
