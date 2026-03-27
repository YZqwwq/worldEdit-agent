import { worldbuildingService } from '../../../../worldbuilding/worldbuildingService'
import { defineAgentTool } from '../../core/agentTool'
import {
  upsertCharacterProfileInputSchema,
  upsertCharacterProfileOutputSchema
} from './shared'

export const upsertCharacterProfileTool = defineAgentTool({
  name: 'upsert_character_profile',
  description:
    'Update the character_profile component for a character entity by applying a partial patch.',
  inputSchema: upsertCharacterProfileInputSchema,
  outputSchema: upsertCharacterProfileOutputSchema,
  metadata: {
    whenToUse: [
      '需要更新人物简介、详细描述、性格特征、能力或标签',
      '需要把人物事迹、经历、秘密或转折写入 character_profile.description',
      '人物编辑子 agent 已确认这是 profile 层改动',
      '已经通过 get_character_detail 确认目标人物存在'
    ],
    whenNotToUse: ['目标不是人物实体', '只是读取人物信息而不是写入', '需要修改关系数据'],
    inputSummary: '提供 entityId 和要写入 character_profile 的 patch 字段。',
    outputSummary: '返回更新后的 character_profile 组件。',
    examples: [
      '先读取人物详情，再调用 upsert_character_profile 更新 summary 或 description。',
      '当 editingDirection=character_deeds 时，应优先使用该工具把人物事迹写入 description。'
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
        ...input.patch
      }
    })

    return { component }
  },
  successMessage(data, input) {
    return `Updated character_profile for ${input.entityId} with component ${data.component.id}.`
  },
  buildReceipt(data, input) {
    return {
      kind: 'character_profile_updated',
      summary: `character_profile for ${input.entityId} has been committed.`,
      payload: {
        entityId: input.entityId,
        componentId: data.component.id,
        patch: input.patch
      }
    }
  },
  nextSuggestions() {
    return ['Read the updated character detail again if you need to confirm the merged result.']
  },
  failureSuggestions: [
    'Confirm the target entityId first.',
    'Use get_character_detail before writing if the current profile baseline is unclear.'
  ]
})
