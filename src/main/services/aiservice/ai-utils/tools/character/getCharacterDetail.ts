import { worldbuildingService } from '../../../../worldbuilding/worldbuildingService'
import { defineAgentTool } from '../../core/agentTool'
import {
  getCharacterDetailInputSchema,
  getCharacterDetailOutputSchema
} from './shared'

export const getCharacterDetailTool = defineAgentTool({
  name: 'get_character_detail',
  description:
    'Get the full detail of a character entity, including base entity data, components, and relations.',
  inputSchema: getCharacterDetailInputSchema,
  outputSchema: getCharacterDetailOutputSchema,
  metadata: {
    whenToUse: [
      '已经知道人物 entityId，需要读取人物完整资料',
      '在修改人物前，需要先确认人物当前的 profile、demographic 和 relations',
      '人物编辑子 agent 需要把角色现状作为编辑基线'
    ],
    whenNotToUse: ['目标不是人物实体', '还没有 entityId，应先用人物查询工具定位目标'],
    inputSummary: '提供 character 实体的 entityId。',
    outputSummary:
      '返回 found 和 detail。detail 中包含 character 的 entity、components、relations。',
    examples: ['先调用 get_character_detail 读取角色完整档案，再决定如何更新 profile 或 demographic。'],
    riskLevel: 'low',
    readOnly: true,
    idempotent: true
  },
  async execute(input) {
    const detail = await worldbuildingService.getEntityDetail(input.entityId)
    if (!detail) {
      return {
        found: false,
        detail: null
      }
    }

    if (detail.entity.type !== 'character') {
      throw new Error(`Entity ${input.entityId} is not a character.`)
    }

    return {
      found: true,
      detail
    }
  },
  successMessage(data, input) {
    if (!data.found) {
      return `No character detail was found for entityId ${input.entityId}.`
    }
    return `Loaded full detail for character ${data.detail?.entity.name || input.entityId}.`
  },
  nextSuggestions(data) {
    if (!data.found) {
      return ['Confirm the character entityId first, or use list_characters to find a valid target.']
    }
    return ['Use the returned components and relations as the source of truth before editing the character.']
  }
})
