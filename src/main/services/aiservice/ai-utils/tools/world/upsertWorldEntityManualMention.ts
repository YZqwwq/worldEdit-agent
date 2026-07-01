import { z } from 'zod'
import { worldEntityMentionIndexService } from '../../../../worldbuilding/worldEntityMentionIndexService'
import { defineAgentTool } from '../../core/agentTool'
import { worldEntityTypeSchema } from './shared'

const manualMentionSourceSchema = z.enum(['user', 'agent', 'reading_extraction', 'system'])

const upsertWorldEntityManualMentionInputSchema = z.object({
  entityId: z.string().trim().min(1),
  mentionText: z.string().trim().min(1),
  weight: z.number().min(0.1).max(2).optional(),
  source: manualMentionSourceSchema.optional(),
  note: z.string().trim().max(500).optional(),
  enabled: z.boolean().optional()
})

const upsertWorldEntityManualMentionOutputSchema = z.object({
  mention: z.object({
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
  }),
  indexing: z.object({
    importedAutomatically: z.literal(true),
    timing: z.literal('next_search_or_rebuild'),
    explanation: z.string()
  })
})

export const upsertWorldEntityManualMentionTool = defineAgentTool({
  name: 'upsert_world_entity_manual_mention',
  description:
    'Create or update a manually maintained mention alias for a world entity. The alias is source data and will be imported into the BM25 mention index automatically.',
  inputSchema: upsertWorldEntityManualMentionInputSchema,
  outputSchema: upsertWorldEntityManualMentionOutputSchema,
  metadata: {
    whenToUse: [
      '用户明确说某个简称、昵称、外号、称谓指向某个世界观实体',
      'Agent 已经确认一个称呼稳定指向某个 entity，需要提升后续瞬时感知命中率',
      '从人物文本中读到明确别名、称号或常用称呼，并需要纳入聚焦检索'
    ],
    whenNotToUse: [
      '还没有确认该称呼究竟指向哪个 entity',
      '同一个称呼可能同时指向多个重要实体且尚未消歧',
      '用户只是临时比喻或一次性描述，不应持久登记'
    ],
    inputSummary:
      '提供 entityId 和 mentionText；可选 weight/source/note/enabled。weight 越高越容易被 BM25 聚焦采用。',
    outputSummary: '返回保存后的 manual mention，并说明索引会在下一次 search/rebuild 自动导入。',
    usageContract: [
      '登记前应尽量确认 entityId 正确。',
      '不要把含糊的一次性描述持久登记为 manual mention。',
      '保存后不需要手动重建索引；下一次世界观聚焦搜索会自动导入。'
    ],
    examples: [
      '用户确认“青岚”就是人物“李青岚”的常用简称后，登记 mentionText=青岚。',
      '读到文本“世人称她为青岚剑主”后，为该人物登记 mentionText=青岚剑主，source=reading_extraction。'
    ],
    riskLevel: 'medium',
    readOnly: false,
    idempotent: true,
    contextRetention: 'ephemeral'
  },
  async execute(input) {
    const mention = await worldEntityMentionIndexService.upsertManualMention(input)
    return {
      mention,
      indexing: {
        importedAutomatically: true as const,
        timing: 'next_search_or_rebuild' as const,
        explanation:
          'manual mention 已保存为源数据；索引服务已标记 dirty，下一次 search/ensureLoaded/rebuild 会自动导入索引表并重建内存 BM25。'
      }
    }
  },
  successMessage(data) {
    return `Saved manual mention "${data.mention.mentionText}" for ${data.mention.entityName}; it will be imported into the BM25 index automatically.`
  },
  nextSuggestions() {
    return [
      'No manual index rebuild is required. Future world focus searches will use this alias after automatic import.'
    ]
  },
  buildReceipt(data) {
    return {
      kind: 'world_entity_manual_mention_upserted',
      summary: `${data.mention.entityName}: ${data.mention.mentionText}`,
      payload: {
        mentionId: data.mention.id,
        entityId: data.mention.entityId,
        mentionText: data.mention.mentionText
      }
    }
  }
})
