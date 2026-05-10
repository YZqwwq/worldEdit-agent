import * as z from 'zod'
import { defineAgentTool } from '../../core/agentTool'
import { listExtensionToolCatalog } from '../../toolkits/extensionToolCatalog'
import { toolUsageStatsService } from '../../toolkits/toolUsageStatsService'

const getExtendToolsInputSchema = z.object({
  purpose: z.string().trim().max(400).optional(),
  toolNames: z.array(z.string().trim().min(1)).max(10).optional()
})

const extensionToolInfoSchema = z.object({
  name: z.string(),
  category: z.string(),
  capabilityGroup: z.string(),
  summary: z.string(),
  whenToUse: z.array(z.string()),
  inputSummary: z.string(),
  outputSummary: z.string()
})

const frequentExtensionToolSchema = extensionToolInfoSchema.extend({
  usageCount: z.number().int().min(0),
  lastUsedAtIso: z.string()
})

const getExtendToolsOutputSchema = z.object({
  purpose: z.string(),
  count: z.number().int().min(0),
  tools: z.array(extensionToolInfoSchema),
  frequentTools: z.array(frequentExtensionToolSchema),
  activatedToolNames: z.array(z.string())
})

const normalize = (value: string): string => value.trim().toLowerCase()

const scoreTool = (
  tool: z.infer<typeof extensionToolInfoSchema>,
  purpose: string
): number => {
  const normalizedPurpose = normalize(purpose)
  if (!normalizedPurpose) return 1

  const haystack = normalize(
    [
      tool.name,
      tool.category,
      tool.capabilityGroup,
      tool.summary,
      tool.inputSummary,
      tool.outputSummary,
      ...tool.whenToUse
    ].join(' ')
  )
  const parts = normalizedPurpose
    .split(/[\s,，。；;、]+/)
    .map((part) => part.trim())
    .filter(Boolean)

  let score = 0
  for (const part of parts) {
    if (haystack.includes(part)) score += 1
  }
  return score
}

export const getExtendToolsTool = defineAgentTool({
  name: 'get_extend_tools',
  description:
    'List and activate discoverable extension tools without exposing them in the default tool set.',
  inputSchema: getExtendToolsInputSchema,
  outputSchema: getExtendToolsOutputSchema,
  metadata: {
    whenToUse: [
      '当前默认工具无法满足需求，需要看看是否有可按需启用的拓展工具',
      '问题可能需要联网搜索、外部能力、高成本工具或未来插件能力',
      '你不确定系统是否提供某类拓展能力时，先调用本工具查看目录'
    ],
    whenNotToUse: [
      '基础工具或领域工具已经足够完成任务',
      '只是需要当前时间、短期历史回忆、世界观数据库读取或子 agent 委派',
      '用户没有提出任何需要拓展能力的需求'
    ],
    inputSummary:
      '可选 purpose 描述你需要拓展能力的原因；如果已知道工具名，可传 toolNames 精确激活。',
    outputSummary:
      '返回可发现拓展工具的简要目录、历史常用拓展工具 top3，并激活 returned activatedToolNames 供下一次模型循环调用。',
    usageContract: [
      '本工具只发现并激活拓展工具，不直接执行拓展能力。',
      '拿到 activatedToolNames 后，下一次模型循环才会看到这些拓展工具的真实 schema。',
      '不要编造未返回的拓展工具名称；如果 count=0，应向用户说明当前没有合适拓展能力。'
    ],
    riskLevel: 'low',
    readOnly: true,
    idempotent: true,
    contextRetention: 'ephemeral'
  },
  async execute(input) {
    const purpose = input.purpose?.trim() || ''
    const requestedNames = new Set((input.toolNames ?? []).map(normalize))
    const catalog = listExtensionToolCatalog()
    const catalogByName = new Map(catalog.map((tool) => [normalize(tool.name), tool]))
    const frequentTools = (await toolUsageStatsService.listTopExtensionTools(3))
      .map((stats) => {
        const tool = catalogByName.get(normalize(stats.toolName))
        if (!tool) return null
        return {
          ...tool,
          usageCount: stats.usageCount,
          lastUsedAtIso: stats.lastUsedAtIso
        }
      })
      .filter((item): item is z.infer<typeof frequentExtensionToolSchema> => item != null)
    const ranked = catalog
      .map((tool) => ({
        tool,
        score:
          requestedNames.size > 0
            ? requestedNames.has(normalize(tool.name)) ? 100 : 0
            : scoreTool(tool, purpose)
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))

    const tools =
      ranked.length > 0
        ? ranked.map((item) => item.tool)
        : catalog
    const activatedToolNames = tools.map((tool) => tool.name)

    return {
      purpose,
      count: tools.length,
      tools,
      frequentTools,
      activatedToolNames
    }
  },
  successMessage(data) {
    if (data.count === 0) {
      return 'No matching extension tools are currently discoverable.'
    }
    return `Activated ${data.count} extension tool(s): ${data.activatedToolNames.join(', ')}.`
  },
  buildReceipt(data) {
    return {
      kind: 'extension_tools_discovered',
      summary:
        data.count > 0
          ? `已激活拓展工具：${data.activatedToolNames.join(', ')}`
          : '未找到可激活的拓展工具。',
      payload: {
        activatedToolNames: data.activatedToolNames,
        frequentToolNames: data.frequentTools.map((tool) => tool.name)
      }
    }
  },
  nextSuggestions(data) {
    if (data.count === 0) {
      return ['Use the default tools, or explain that no suitable extension tool is available.']
    }
    return ['In the next model step, call one of the activated extension tools if it matches the user request.']
  }
})
