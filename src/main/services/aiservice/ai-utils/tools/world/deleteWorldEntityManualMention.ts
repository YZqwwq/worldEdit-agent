import { z } from 'zod'
import { worldEntityMentionIndexService } from '../../../../worldbuilding/worldEntityMentionIndexService'
import { defineAgentTool } from '../../core/agentTool'

const deleteWorldEntityManualMentionInputSchema = z.object({
  id: z.string().trim().min(1)
})

const deleteWorldEntityManualMentionOutputSchema = z.object({
  id: z.string(),
  deleted: z.boolean(),
  indexing: z.object({
    importedAutomatically: z.literal(true),
    timing: z.literal('next_search_or_rebuild'),
    explanation: z.string()
  })
})

export const deleteWorldEntityManualMentionTool = defineAgentTool({
  name: 'delete_world_entity_manual_mention',
  description:
    'Delete a manually maintained world entity mention alias. The BM25 mention index will be refreshed automatically on the next search or rebuild.',
  inputSchema: deleteWorldEntityManualMentionInputSchema,
  outputSchema: deleteWorldEntityManualMentionOutputSchema,
  metadata: {
    whenToUse: [
      '发现某个 manual mention 错误指向了实体，需要移除',
      '用户明确要求删除某个别名、简称、外号或称谓',
      '排查聚焦误命中后，需要撤销错误登记'
    ],
    whenNotToUse: ['还没有 mention id，应先调用 list_world_entity_manual_mentions'],
    inputSummary: '提供 manual mention id。',
    outputSummary: '返回 deleted，并说明索引会在下一次 search/rebuild 自动刷新。',
    riskLevel: 'medium',
    readOnly: false,
    idempotent: true,
    contextRetention: 'ephemeral'
  },
  async execute(input) {
    const deleted = await worldEntityMentionIndexService.deleteManualMention(input.id)
    return {
      id: input.id,
      deleted,
      indexing: {
        importedAutomatically: true as const,
        timing: 'next_search_or_rebuild' as const,
        explanation:
          'manual mention 删除后索引服务会标记 dirty；下一次 search/ensureLoaded/rebuild 会自动刷新索引表和内存 BM25。'
      }
    }
  },
  successMessage(data) {
    return data.deleted
      ? `Deleted manual mention ${data.id}; BM25 index will refresh automatically.`
      : `Manual mention ${data.id} was not found; no index refresh was needed.`
  },
  nextSuggestions(data) {
    if (!data.deleted) {
      return ['Call list_world_entity_manual_mentions to confirm the current mention ids.']
    }
    return [
      'No manual index rebuild is required. Future world focus searches will use the refreshed index.'
    ]
  }
})
