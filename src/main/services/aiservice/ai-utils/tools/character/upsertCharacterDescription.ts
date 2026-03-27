import { worldbuildingService } from '../../../../worldbuilding/worldbuildingService'
import { defineAgentTool } from '../../core/agentTool'
import {
  upsertCharacterDescriptionInputSchema,
  upsertCharacterDescriptionOutputSchema
} from './shared'

export const upsertCharacterDescriptionTool = defineAgentTool({
  name: 'upsert_character_description',
  description:
    'Update only the description field of the character_profile component for a character entity.',
  inputSchema: upsertCharacterDescriptionInputSchema,
  outputSchema: upsertCharacterDescriptionOutputSchema,
  metadata: {
    whenToUse: [
      '需要修改人物简介、经历、事迹、背景设定等描述性文本',
      '人物编辑子 agent 只允许写 character_profile.description',
      '已经通过 get_character_detail 确认目标人物存在'
    ],
    whenNotToUse: [
      '需要修改 title、summary、traits、abilities、tags 等其他 profile 字段',
      '需要修改 demographic、relation、portrait 等非 description 字段',
      '只是读取人物信息而不是写入'
    ],
    inputSummary: '提供 entityId 和新的 description 文本。',
    outputSummary: '返回更新后的 character_profile 组件。',
    examples: [
      '先读取人物详情，再调用 upsert_character_description 更新人物经历与叙事描述。'
    ],
    riskLevel: 'medium',
    readOnly: false,
    idempotent: false,
    completionSemantics: 'definitive'
  },
  async execute(input) {
    const detail = await worldbuildingService.getEntityDetail(input.entityId)
    if (!detail) {
      throw new Error(`Character not found: ${input.entityId}`)
    }
    if (detail.entity.type !== 'character') {
      throw new Error(`Entity ${input.entityId} is not a character.`)
    }

    const current =
      detail.components.find((component) => component.componentType === 'character_profile')?.data ?? {}

    const component = await worldbuildingService.upsertComponent({
      entityId: input.entityId,
      componentType: 'character_profile',
      data: {
        ...current,
        description: input.description
      }
    })

    return { component }
  },
  successMessage(data, input) {
    return `Updated character description for ${input.entityId} with component ${data.component.id}.`
  },
  buildReceipt(data, input) {
    return {
      kind: 'character_description_updated',
      summary: `character_profile.description for ${input.entityId} has been committed.`,
      payload: {
        entityId: input.entityId,
        componentId: data.component.id,
        description: input.description
      }
    }
  },
  nextSuggestions() {
    return ['Read the updated character detail again if you need to confirm the merged description.']
  },
  failureSuggestions: [
    'Confirm the target entityId first.',
    'Use get_character_detail before writing if the current description baseline is unclear.'
  ]
})
