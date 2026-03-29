import { worldbuildingService } from '../../../../worldbuilding/worldbuildingService'
import { defineAgentTool } from '../../core/agentTool'
import {
  upsertCharacterDescriptionInputSchema,
  upsertCharacterDescriptionOutputSchema
} from './shared'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

const logUpsertCharacterDescriptionTrace = (input: {
  stage: string
  message: string
  data?: Record<string, unknown>
}): void => {
  const line =
    `[upsert_character_description stage=${input.stage}] ${input.message}` +
    (input.data ? ` ${JSON.stringify(input.data)}` : '')

  try {
    const logPath = join(process.cwd(), 'src/main/services/log/logs/debug.log')
    appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`)
  } catch {
    // ignore local debug log failures
  }

  console.error(line)
}

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
    logUpsertCharacterDescriptionTrace({
      stage: 'execute_enter',
      message: 'Starting execute().',
      data: {
        entityId: input.entityId,
        descriptionLength: input.description.length
      }
    })

    const detail = await worldbuildingService.getEntityDetail(input.entityId)
    logUpsertCharacterDescriptionTrace({
      stage: 'detail_loaded',
      message: 'Loaded character detail before write.',
      data: {
        found: Boolean(detail),
        entityType: detail?.entity.type ?? null
      }
    })

    if (!detail) {
      throw new Error(`Character not found: ${input.entityId}`)
    }
    if (detail.entity.type !== 'character') {
      throw new Error(`Entity ${input.entityId} is not a character.`)
    }

    const current =
      detail.components.find((component) => component.componentType === 'character_profile')?.data ?? {}

    logUpsertCharacterDescriptionTrace({
      stage: 'upsert_start',
      message: 'Calling worldbuildingService.upsertComponent().',
      data: {
        entityId: input.entityId,
        previousDescriptionLength:
          typeof current.description === 'string' ? current.description.length : 0
      }
    })

    const component = await worldbuildingService.upsertComponent({
      entityId: input.entityId,
      componentType: 'character_profile',
      data: {
        ...current,
        description: input.description
      }
    })

    logUpsertCharacterDescriptionTrace({
      stage: 'upsert_success',
      message: 'worldbuildingService.upsertComponent() completed.',
      data: {
        entityId: input.entityId,
        componentId: component.id
      }
    })

    return { component }
  },
  successMessage(data, input) {
    return `Updated character description for ${input.entityId} with component ${data.component.id}.`
  },
  buildReceipt(data, input) {
    logUpsertCharacterDescriptionTrace({
      stage: 'build_receipt',
      message: 'Building definitive receipt after successful write.',
      data: {
        entityId: input.entityId,
        componentId: data.component.id
      }
    })

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
