import { characterImpressionService } from '../../../../worldbuilding/characterImpressionService'
import { defineAgentTool } from '../../core/agentTool'
import { getCharacterImpressionInputSchema, getCharacterImpressionOutputSchema } from './shared'

export const getCharacterImpressionTool = defineAgentTool({
  name: 'get_character_impression',
  description: 'Read the current structured main-agent impression associated with a character.',
  inputSchema: getCharacterImpressionInputSchema,
  outputSchema: getCharacterImpressionOutputSchema,
  metadata: {
    description: {
      purpose: '读取人物当前保存的结构化主 Agent 印象。',
      inputSummary: '提供 characterEntityId。',
      outputSummary: '返回 found 和 impression。'
    },
    display: {
      visibility: 'visible',
      stage: {
        label: '正在读取人物印象',
        doneLabel: '人物印象读取完成',
        errorLabel: '人物印象读取失败'
      }
    },
    execution: {
      level: 'safe',
      readOnly: true,
      idempotent: true,
      completionSemantics: 'definitive'
    },
    retention: { context: 'evidence' }
  },
  async execute(input) {
    const impression = await characterImpressionService.getImpression(input.characterEntityId)
    return {
      found: Boolean(impression),
      impression
    }
  },
  successMessage(data, input) {
    return data.found
      ? `Loaded character impression for ${input.characterEntityId}.`
      : `No character impression exists for ${input.characterEntityId}.`
  },
  nextSuggestions(data) {
    if (!data.found) {
      return [
        '尚无已保存印象。结合本轮实际读取的文本形成初步认识，明确材料范围；形成看法不等于立即持久化。'
      ]
    }
    return [
      '将旧印象与本轮实际读取的材料比较：哪些认识得到支持、补充或需要修订。旧印象不是权威事实，局部新判断不自动覆盖长期印象。'
    ]
  }
})
