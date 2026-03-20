import { z } from 'zod'
import { worldbuildingService } from '../../../../worldbuilding/worldbuildingService'
import { defineAgentTool } from '../../core/agentTool'
import {
  worldEntityPayloadSchema,
  worldEntityTypeSchema
} from './shared'

const listEntitiesInputSchema = z.object({
  worldId: z.string().trim().min(1),
  entityType: worldEntityTypeSchema.optional()
})

const listEntitiesOutputSchema = z.object({
  worldId: z.string(),
  entityType: worldEntityTypeSchema.optional(),
  count: z.number().int().min(0),
  entities: z.array(worldEntityPayloadSchema)
})

export const listEntitiesTool = defineAgentTool({
  name: 'list_entities',
  description:
    'List entities in a specific worldbuilding project, optionally filtered by entity type.',
  inputSchema: listEntitiesInputSchema,
  outputSchema: listEntitiesOutputSchema,
  metadata: {
    whenToUse: [
      '已经知道 worldId，需要查看这个世界里有哪些实体',
      '需要按实体类型筛选，例如只看人物、国家或城市',
      '在读取单个实体详情前，需要先找到候选 entityId'
    ],
    whenNotToUse: ['还不知道 worldId', '目标已经明确为某个具体 entityId，应直接读取详情'],
    inputSummary: '提供 worldId，可选提供 entityType 过滤。',
    outputSummary:
      '返回指定世界下的实体列表，包含 count 和 entities 数组；每个实体含 id、type、name、summary、status 等基础信息。',
    examples: [
      '先调用 list_worlds 获取 worldId，再调用 list_entities 查看该世界中的人物或国家列表。'
    ],
    riskLevel: 'low',
    readOnly: true,
    idempotent: true
  },
  async execute(input) {
    const entities = await worldbuildingService.listEntities(input.worldId, input.entityType)

    return {
      worldId: input.worldId,
      entityType: input.entityType,
      count: entities.length,
      entities
    }
  },
  successMessage(data, input) {
    const typeLabel = input.entityType ? ` of type ${input.entityType}` : ''
    return `Found ${data.count} entit${data.count === 1 ? 'y' : 'ies'} in world ${input.worldId}${typeLabel}.`
  },
  nextSuggestions(data) {
    if (data.count === 0) {
      return ['No matching entities were found. Confirm the worldId or create new entities if needed.']
    }
    return ['Pick an entityId from the result and call get_entity_detail to inspect full components and relations.']
  }
})
