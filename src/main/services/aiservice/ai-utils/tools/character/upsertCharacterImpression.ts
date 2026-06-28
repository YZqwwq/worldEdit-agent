import { characterImpressionService } from '../../../../worldbuilding/characterImpressionService'
import { defineAgentTool } from '../../core/agentTool'
import {
  upsertCharacterImpressionInputSchema,
  upsertCharacterImpressionOutputSchema
} from './shared'

export const upsertCharacterImpressionTool = defineAgentTool({
  name: 'upsert_character_impression',
  description:
    'Create or replace the structured main-agent impression associated with a character.',
  inputSchema: upsertCharacterImpressionInputSchema,
  outputSchema: upsertCharacterImpressionOutputSchema,
  metadata: {
    whenToUse: [
      '已经稳定读完人物叙事文本，需要把人物画像/印象写入关联表',
      '用户明确要求更新主 agent 对某个人物的看法或画像',
      '后台人物阅读任务完成后，需要提交最终结构化印象'
    ],
    whenNotToUse: [
      '还没有读完人物文本，不应提前写入最终印象',
      '只是临时讨论人物，不需要持久化',
      '目标不是人物实体'
    ],
    inputSummary:
      '提供 characterEntityId、structuredText；updateMarker 可留空，后续用于增量更新标识。',
    outputSummary:
      '返回保存后的人物印象记录。structuredText 推荐使用 Markdown 分段：外貌、性格、行为、能力、事迹、关系、矛盾/未知、主 agent 主观看法、证据来源。',
    usageContract: [
      '写入前应已经读取所有必要 narrative batch，除非用户明确只要求基于部分文本生成。',
      'structuredText 必须保留证据来源章节，列出关键 documentId/path，避免无来源断言。',
      'updateMarker 第一版可以传空字符串，后续增量更新机制再填入。'
    ],
    riskLevel: 'medium',
    readOnly: false,
    idempotent: false,
    completionSemantics: 'definitive',
    contextRetention: 'evidence',
    uiStage: {
      label: '正在保存人物印象',
      doneLabel: '人物印象保存完成',
      errorLabel: '人物印象保存失败'
    }
  },
  async execute(input) {
    const impression = await characterImpressionService.upsertImpression(input)
    return { impression }
  },
  successMessage(data) {
    return `Saved character impression for ${data.impression.characterEntityId}.`
  },
  buildReceipt(data) {
    return {
      kind: 'character_impression_saved',
      summary: `人物印象已保存到 ${data.impression.characterEntityId} 的关联记录。`,
      payload: {
        characterEntityId: data.impression.characterEntityId,
        structuredTextLength: data.impression.structuredText.length,
        updateMarker: data.impression.updateMarker,
        updatedAt: data.impression.updatedAt
      }
    }
  },
  nextSuggestions() {
    return ['Tell the user the character impression has been saved, and mention any uncertainty that remained in the evidence.']
  },
  failureSuggestions: [
    'Confirm the target characterEntityId exists and is a character.',
    'If structuredText is empty, synthesize a concise impression from the read narrative evidence before retrying.'
  ]
})
