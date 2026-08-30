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
        'Read the character narrative documents and create a first impression if the user requested one.'
      ]
    }
    return [
      'Use the saved impression as context; update it only if the user asks or new narrative reading changes it.'
    ]
  }
})
