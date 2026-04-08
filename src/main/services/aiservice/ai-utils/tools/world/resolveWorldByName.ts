import { z } from 'zod'
import { worldbuildingService } from '../../../../worldbuilding/worldbuildingService'
import { defineAgentTool } from '../../core/agentTool'
import { worldPayloadSchema } from './shared'

const normalizeText = (value: unknown): string => String(value ?? '').trim().toLowerCase()

const resolveWorldByNameInputSchema = z.object({
  worldName: z.string().trim().min(1),
  allowFuzzy: z.boolean().optional(),
  limit: z.number().int().min(1).max(10).optional()
})

const resolveWorldByNameOutputSchema = z.object({
  count: z.number().int().min(0),
  matchStrategy: z.enum(['exact', 'substring', 'none']),
  worlds: z.array(worldPayloadSchema)
})

export const resolveWorldByNameTool = defineAgentTool({
  name: 'resolve_world_by_name',
  description: 'Resolve worldbuilding projects by world name, preferring exact matches and falling back to fuzzy substring matches.',
  inputSchema: resolveWorldByNameInputSchema,
  outputSchema: resolveWorldByNameOutputSchema,
  metadata: {
    whenToUse: [
      '已经知道世界名称，但还不知道 worldId',
      '用户用自然语言提到某个世界，需要先把名字解析成系统内 world 记录',
      '在调用 list_entities、delegate 类工具前，需要先稳定定位世界'
    ],
    whenNotToUse: [
      '已经明确知道 worldId',
      '问题和世界观项目无关',
      '只是想列出所有世界，不需要按名字解析'
    ],
    inputSummary: '提供 worldName；可选 allowFuzzy 和 limit。',
    outputSummary: '返回匹配世界列表，并标记本轮采用 exact、substring 还是 none 的匹配策略。',
    examples: [
      '用户说“方舟终章”，先调用 resolve_world_by_name 解析出对应 worldId，再继续查实体。'
    ],
    riskLevel: 'low',
    readOnly: true,
    idempotent: true
  },
  async execute(input) {
    const worlds = await worldbuildingService.listWorlds()
    const query = normalizeText(input.worldName)
    const limit = input.limit ?? 5
    const allowFuzzy = input.allowFuzzy !== false

    const exactMatches = worlds.filter((world) => normalizeText(world.name) === query)
    if (exactMatches.length > 0) {
      return {
        count: Math.min(exactMatches.length, limit),
        matchStrategy: 'exact' as const,
        worlds: exactMatches.slice(0, limit)
      }
    }

    if (allowFuzzy) {
      const fuzzyMatches = worlds.filter((world) => {
        const normalizedName = normalizeText(world.name)
        return normalizedName.includes(query) || query.includes(normalizedName)
      })
      if (fuzzyMatches.length > 0) {
        return {
          count: Math.min(fuzzyMatches.length, limit),
          matchStrategy: 'substring' as const,
          worlds: fuzzyMatches.slice(0, limit)
        }
      }
    }

    return {
      count: 0,
      matchStrategy: 'none' as const,
      worlds: []
    }
  },
  successMessage(data, input) {
    if (data.count === 0) {
      return `No world match was found for "${input.worldName}".`
    }
    return `Resolved ${data.count} world match(es) for "${input.worldName}" using ${data.matchStrategy} matching.`
  },
  nextSuggestions(data) {
    if (data.count === 0) {
      return ['If the name may be inaccurate, call list_worlds to inspect all available projects before retrying.']
    }
    return ['Use a returned world id before listing entities or delegating a task tied to that world.']
  }
})
