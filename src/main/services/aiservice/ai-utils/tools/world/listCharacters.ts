import { z } from 'zod'
import { worldbuildingService } from '../../../../worldbuilding/worldbuildingService'
import { defineAgentTool } from '../../core/agentTool'
import { worldEntityPayloadSchema } from './shared'

const nonEmptyString = z.string().trim().min(1)
const nonEmptyStringList = z.array(nonEmptyString).max(10)

const listCharactersInputSchema = z
  .object({
    worldId: nonEmptyString.optional(),
    keyword: nonEmptyString.optional(),
    name: nonEmptyString.optional(),
    title: nonEmptyString.optional(),
    summary: nonEmptyString.optional(),
    gender: nonEmptyString.optional(),
    raceEntityId: nonEmptyString.optional(),
    factionEntityId: nonEmptyString.optional(),
    nationEntityId: nonEmptyString.optional(),
    birthplaceEntityId: nonEmptyString.optional(),
    personalityTraits: nonEmptyStringList.optional(),
    abilities: nonEmptyStringList.optional(),
    tags: nonEmptyStringList.optional()
  })
  .refine(
    (input) =>
      Boolean(
        input.worldId ||
          input.keyword ||
          input.name ||
          input.title ||
          input.summary ||
          input.gender ||
          input.raceEntityId ||
          input.factionEntityId ||
          input.nationEntityId ||
          input.birthplaceEntityId ||
          (input.personalityTraits?.length ?? 0) > 0 ||
          (input.abilities?.length ?? 0) > 0 ||
          (input.tags?.length ?? 0) > 0
      ),
    {
      message: 'At least one search condition is required.'
    }
  )

const characterProfileSummarySchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  personalityTraits: z.array(z.string()).optional(),
  abilities: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional()
})

const characterDemographicSummarySchema = z.object({
  basicInfo: z
    .object({
      order: z.array(z.string()).optional(),
      fields: z
        .record(
          z.string(),
          z.object({
            label: z.string().optional(),
            kind: z.string().optional(),
            value: z.union([z.string(), z.number(), z.null()]).optional(),
            entityType: z.string().optional(),
            custom: z.boolean().optional(),
            locked: z.boolean().optional()
          })
        )
        .optional()
    })
    .optional()
})

const listCharactersOutputSchema = z.object({
  count: z.number().int().min(0),
  characters: z.array(
    z.object({
      worldId: z.string(),
      worldName: z.string(),
      matchedFields: z.array(z.string()),
      entity: worldEntityPayloadSchema,
      profile: characterProfileSummarySchema,
      demographic: characterDemographicSummarySchema
    })
  )
})

export const listCharactersTool = defineAgentTool({
  name: 'list_characters',
  description:
    'List character entities using worldId, character name, or other supported character fields.',
  inputSchema: listCharactersInputSchema,
  outputSchema: listCharactersOutputSchema,
  metadata: {
    whenToUse: [
      '需要按人物姓名、称号、摘要、性格特征、能力或归属字段查找人物',
      '已知 worldId，但还不知道对应人物的 entityId',
      '只知道部分人物线索，需要先得到候选人物列表'
    ],
    whenNotToUse: ['已经明确知道 entityId，应直接调用 get_entity_detail', '要查询的不是人物实体'],
    inputSummary:
      '提供至少一个查询条件，可使用 worldId、keyword、name、title、summary、gender、raceEntityId、factionEntityId、nationEntityId、birthplaceEntityId、personalityTraits、abilities、tags。基础信息查询会匹配 character_demographic.basicInfo 中的默认字段。',
    outputSummary:
      '返回人物候选列表。每项包含 worldId、worldName、matchedFields、entity 基础信息，以及 profile / demographic 的摘要字段。',
    examples: [
      '提供 worldId + name 查找某个世界中的人物',
      '只提供 keyword 或 abilities，在所有世界中筛出可能的人物'
    ],
    riskLevel: 'low',
    readOnly: true,
    idempotent: true
  },
  async execute(input) {
    const characters = await worldbuildingService.searchCharacterEntities(input)

    return {
      count: characters.length,
      characters
    }
  },
  successMessage(data) {
    return `Found ${data.count} matching character candidate(s).`
  },
  nextSuggestions(data) {
    if (data.count === 0) {
      return ['Try loosening the filters, or confirm the worldId and character clues before retrying.']
    }
    return ['Pick a returned entityId and call get_entity_detail to inspect the full character record before modifying it.']
  }
})
