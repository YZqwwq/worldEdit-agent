import { z } from 'zod'
import { worldbuildingService } from '../../../../worldbuilding/worldbuildingService'
import { defineAgentTool } from '../../core/agentTool'
import { worldEntityDetailPayloadSchema } from './shared'

const getEntityDetailInputSchema = z.object({
  entityId: z.string().trim().min(1)
})

const getEntityDetailOutputSchema = z.object({
  found: z.boolean(),
  detail: worldEntityDetailPayloadSchema.nullable()
})

export const getEntityDetailTool = defineAgentTool({
  name: 'get_entity_detail',
  description:
    'Get the full detail of a specific entity, including its base entity data, components, and relations.',
  inputSchema: getEntityDetailInputSchema,
  outputSchema: getEntityDetailOutputSchema,
  metadata: {
    whenToUse: [
      '已经知道 entityId，需要查看该实体的完整内容',
      '在修改实体前，需要读取它现有的组件和关系',
      '需要确认某个实体当前被如何描述和关联'
    ],
    whenNotToUse: ['还没有 entityId', '只需要知道某个世界里有哪些实体，应先用 list_entities'],
    inputSummary: '提供 entityId。',
    outputSummary:
      '返回 found 和 detail。detail 中包含 entity 基础信息、components 数组、relations 数组。',
    examples: [
      '先通过 list_entities 找到 entityId，再调用 get_entity_detail 读取完整组件和关系。'
    ],
    riskLevel: 'low',
    readOnly: true,
    idempotent: true
  },
  async execute(input) {
    const detail = await worldbuildingService.getEntityDetail(input.entityId)

    return {
      found: detail !== null,
      detail
    }
  },
  successMessage(data, input) {
    if (!data.found) {
      return `No entity detail was found for entityId ${input.entityId}.`
    }
    return `Loaded full detail for entity ${data.detail?.entity.name || input.entityId}.`
  },
  nextSuggestions(data) {
    if (!data.found) {
      return ['Confirm the entityId first, or call list_entities to find a valid entity.']
    }
    return ['Use the returned components and relations as the source of truth before applying any updates.']
  }
})
