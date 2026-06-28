import { characterImpressionService } from '../../../../worldbuilding/characterImpressionService'
import { defineAgentTool } from '../../core/agentTool'
import {
  getCharacterImpressionInputSchema,
  getCharacterImpressionOutputSchema
} from './shared'

export const getCharacterImpressionTool = defineAgentTool({
  name: 'get_character_impression',
  description:
    'Read the current structured main-agent impression associated with a character.',
  inputSchema: getCharacterImpressionInputSchema,
  outputSchema: getCharacterImpressionOutputSchema,
  metadata: {
    whenToUse: [
      '需要查看主 agent 已经为某个人物建立过的印象',
      '准备更新人物印象前，需要先读旧版本避免覆盖有价值判断',
      '用户询问“你怎么看这个人物”且问题依赖已保存人物印象'
    ],
    whenNotToUse: [
      '需要从叙事正文重新建立印象，应先读取人物叙事文本',
      '目标不是人物实体',
      '只是读取人物基础资料，应使用世界观读取工具'
    ],
    inputSummary: '提供 characterEntityId。',
    outputSummary: '返回 found 和 impression。impression 包含 structuredText、updateMarker、时间戳。',
    riskLevel: 'low',
    readOnly: true,
    idempotent: true,
    contextRetention: 'evidence',
    uiStage: {
      label: '正在读取人物印象',
      doneLabel: '人物印象读取完成',
      errorLabel: '人物印象读取失败'
    }
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
      return ['Read the character narrative documents and create a first impression if the user requested one.']
    }
    return ['Use the saved impression as context; update it only if the user asks or new narrative reading changes it.']
  }
})
