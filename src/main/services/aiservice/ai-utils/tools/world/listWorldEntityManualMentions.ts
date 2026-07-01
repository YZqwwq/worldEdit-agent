import { z } from 'zod'
import { worldEntityMentionIndexService } from '../../../../worldbuilding/worldEntityMentionIndexService'
import { defineAgentTool } from '../../core/agentTool'
import { worldEntityTypeSchema } from './shared'

const manualMentionSourceSchema = z.enum(['user', 'agent', 'reading_extraction', 'system'])

const manualMentionPayloadSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  entityId: z.string(),
  entityType: worldEntityTypeSchema,
  entityName: z.string(),
  mentionText: z.string(),
  weight: z.number(),
  source: manualMentionSourceSchema,
  note: z.string(),
  enabled: z.boolean(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
})

const listWorldEntityManualMentionsInputSchema = z.object({
  entityId: z.string().trim().min(1)
})

const listWorldEntityManualMentionsOutputSchema = z.object({
  entityId: z.string(),
  count: z.number().int().min(0),
  mentions: z.array(manualMentionPayloadSchema)
})

export const listWorldEntityManualMentionsTool = defineAgentTool({
  name: 'list_world_entity_manual_mentions',
  description:
    'List manually maintained mention aliases for a world entity. These aliases feed the world focus BM25 mention index.',
  inputSchema: listWorldEntityManualMentionsInputSchema,
  outputSchema: listWorldEntityManualMentionsOutputSchema,
  metadata: {
    whenToUse: [
      '需要查看某个世界观实体已经登记了哪些别名、简称、外号或用户常用称呼',
      '在新增实体称呼前，需要避免重复登记',
      '排查世界观瞬时感知为什么会把某个称呼聚焦到该实体'
    ],
    whenNotToUse: ['还不知道 entityId', '只是要搜索实体候选，应先使用世界观读取工具'],
    inputSummary: '提供 entityId。',
    outputSummary:
      '返回该实体的 manual mention 列表；这些源数据会在索引重建时自动导入 BM25 索引表。',
    examples: ['查看人物“李青岚”是否已经登记“青岚”“李姑娘”等称呼。'],
    riskLevel: 'low',
    readOnly: true,
    idempotent: true
  },
  async execute(input) {
    const mentions = await worldEntityMentionIndexService.listManualMentions(input.entityId)
    return {
      entityId: input.entityId,
      count: mentions.length,
      mentions
    }
  },
  successMessage(data) {
    return `Found ${data.count} manual mention${data.count === 1 ? '' : 's'} for entity ${data.entityId}.`
  },
  nextSuggestions(data) {
    if (data.count === 0) {
      return [
        'If the user has a stable nickname or alias for this entity, call upsert_world_entity_manual_mention.'
      ]
    }
    return [
      'Use upsert_world_entity_manual_mention to add missing aliases, or delete_world_entity_manual_mention to remove wrong aliases.'
    ]
  }
})
