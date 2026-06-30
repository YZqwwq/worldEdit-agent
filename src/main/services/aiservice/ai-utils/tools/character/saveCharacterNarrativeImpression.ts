import { characterImpressionService } from '../../../../worldbuilding/characterImpressionService'
import { defineAgentTool } from '../../core/agentTool'
import {
  saveCharacterNarrativeImpressionInputSchema,
  saveCharacterNarrativeImpressionOutputSchema
} from './shared'

const buildUpdateMarker = (input: {
  updateMarker?: string
  sourceReadingTaskId?: string
  sourceMission?: string
  evidenceSummary?: string
}): string => {
  const explicit = input.updateMarker?.trim()
  if (explicit) return explicit

  const lines = [
    input.sourceReadingTaskId ? `readingTaskId: ${input.sourceReadingTaskId}` : '',
    input.sourceMission ? `mission: ${input.sourceMission}` : '',
    input.evidenceSummary ? `evidence: ${input.evidenceSummary}` : ''
  ].filter(Boolean)

  return lines.join('\n').slice(0, 20000)
}

export const saveCharacterNarrativeImpressionTool = defineAgentTool({
  name: 'save_character_narrative_impression',
  description:
    'Save the refreshed agent impression synthesized from completed character narrative reading evidence.',
  inputSchema: saveCharacterNarrativeImpressionInputSchema,
  outputSchema: saveCharacterNarrativeImpressionOutputSchema,
  metadata: {
    whenToUse: [
      '已经按 read_character_narrative_task_batch 读完必要人物文本，需要保存最终人物印象',
      '阅读任务 hasMore=false，agent 已经综合各 unit mission 形成结构化人物画像',
      '用户要求把基于人物文本阅读得到的 Agent 印象保存下来',
      '人物原本没有已保存印象，或者旧印象过旧/证据不足/范围不足，本轮阅读已经完成并形成了新的稳定判断',
      '用户明确要求重新认识、重新评价、更新人物画像，且本轮已完成对应范围阅读'
    ],
    whenNotToUse: [
      '还没有读取必要 narrative batch，或者阅读任务尚未完成',
      '只是临时回答用户问题，不需要持久化人物印象',
      '已有印象已经足以回答当前问题，且用户没有要求保存新印象',
      '目标不是人物实体',
      'structuredText 没有证据来源或不区分事实与主观看法'
    ],
    inputSummary:
      '提供 characterEntityId 和 structuredText；可选传 sourceReadingTaskId、sourceMission、evidenceSummary 或 updateMarker。',
    outputSummary:
      '返回保存后的人物印象记录，包含 structuredText、updateMarker、createdAt、updatedAt。',
    usageContract: [
      '本工具写入 character_impression_record 关联表，不修改人物实体本体或 character_profile。',
      'structuredText 应使用 Markdown，并至少包含：核心印象、性格/行为、关键经历、关系、矛盾/未知、主 Agent 主观看法、证据来源。',
      '证据来源必须列出关键 documentId/path 或 reading task 信息，避免无来源断言。',
      '如果本次只阅读了部分文件，必须在 structuredText 中明确“基于部分文本”。',
      '重新形成印象的典型条件：没有旧印象；旧印象 updatedAt 早于文本更新；旧印象没有证据来源；用户要求重新评价；用户问题超出旧印象覆盖范围；本轮选择了新的文件/文件树。',
      '保存前必须确认阅读任务已经覆盖本次 mission 所需范围；如果 hasMore=true，不要保存最终印象。',
      '写入成功后可以告诉用户人物印象已保存，但不要声称修改了人物设定正文。'
    ],
    riskLevel: 'medium',
    readOnly: false,
    idempotent: false,
    completionSemantics: 'definitive',
    contextRetention: 'evidence',
    uiStage: {
      label: '正在保存阅读后人物印象',
      doneLabel: '阅读后人物印象保存完成',
      errorLabel: '阅读后人物印象保存失败'
    }
  },
  async execute(input) {
    const impression = await characterImpressionService.upsertImpression({
      characterEntityId: input.characterEntityId,
      structuredText: input.structuredText,
      updateMarker: buildUpdateMarker(input)
    })
    return { impression }
  },
  successMessage(data) {
    return `Saved narrative-based character impression for ${data.impression.characterEntityId}.`
  },
  buildReceipt(data) {
    return {
      kind: 'character_narrative_impression_saved',
      summary: `基于人物文本阅读形成的 Agent 印象已保存到 ${data.impression.characterEntityId} 的关联记录。`,
      payload: {
        characterEntityId: data.impression.characterEntityId,
        structuredTextLength: data.impression.structuredText.length,
        updateMarker: data.impression.updateMarker,
        updatedAt: data.impression.updatedAt
      }
    }
  },
  nextSuggestions() {
    return [
      'Tell the user the narrative-based character impression has been saved.',
      'Mention any evidence limits or partial-reading scope that remains important.'
    ]
  },
  failureSuggestions: [
    'Confirm the target characterEntityId exists and is a character.',
    'If structuredText is empty, synthesize a concise impression from the completed reading task before retrying.',
    'Include source document paths or reading task evidence before saving.'
  ]
})
