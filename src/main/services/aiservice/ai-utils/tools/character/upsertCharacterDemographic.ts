import { worldbuildingService } from '../../../../worldbuilding/worldbuildingService'
import { defineAgentTool } from '../../core/agentTool'
import {
  upsertCharacterDemographicInputSchema,
  upsertCharacterDemographicOutputSchema
} from './shared'

export const upsertCharacterDemographicTool = defineAgentTool({
  name: 'upsert_character_demographic',
  description:
    'Update the character_demographic component for a character entity by applying a partial patch.',
  inputSchema: upsertCharacterDemographicInputSchema,
  outputSchema: upsertCharacterDemographicOutputSchema,
  metadata: {
    whenToUse: [
      '需要更新年龄、性别、身高标签或归属类基础属性',
      '人物编辑子 agent 已确认这是 demographic 层改动',
      '已经通过 get_character_detail 确认目标人物存在'
    ],
    whenNotToUse: ['目标不是人物实体', '只是查询人物信息', '需要创建或修改关系边'],
    inputSummary: '提供 entityId 和要写入 character_demographic 的 patch 字段。',
    outputSummary: '返回更新后的 character_demographic 组件。',
    examples: ['先读取人物详情，再调用 upsert_character_demographic 更新 ageLabel 或 gender。'],
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
      detail.components.find((component) => component.componentType === 'character_demographic')?.data ?? {}

    const component = await worldbuildingService.upsertComponent({
      entityId: input.entityId,
      componentType: 'character_demographic',
      data: {
        ...current,
        ...input.patch
      }
    })

    return { component }
  },
  successMessage(data, input) {
    return `Updated character_demographic for ${input.entityId} with component ${data.component.id}.`
  },
  buildReceipt(data, input) {
    return {
      kind: 'character_demographic_updated',
      summary: `character_demographic for ${input.entityId} has been committed.`,
      payload: {
        entityId: input.entityId,
        componentId: data.component.id,
        patch: input.patch
      }
    }
  },
  nextSuggestions() {
    return ['Read the updated character detail again if you need to verify the demographic fields.']
  },
  failureSuggestions: [
    'Confirm the target entityId first.',
    'If you need relation edits, use dedicated relation tools instead of demographic writes.'
  ]
})
