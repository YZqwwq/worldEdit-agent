import * as z from 'zod'
import { defineAgentTool } from '../../core/agentTool'
import { listToolsetCatalog } from '../../toolkits/toolsetCatalog'

const toolCatalogIntentSchema = z.enum([
  'network_search',
  'world_read',
  'task_inspection',
  'math',
  'background_task',
  'unknown'
])

const queryToolCatalogInputSchema = z.object({
  intent: toolCatalogIntentSchema.optional(),
  purpose: z.string().trim().max(500).optional(),
  toolsetIds: z.array(z.string().trim().min(1)).max(10).optional(),
  maxResults: z.number().int().min(1).max(12).optional()
})

const toolsetCatalogItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  activationHints: z.array(z.string()),
  whenToUse: z.array(z.string()),
  whenNotToUse: z.array(z.string()),
  toolCount: z.number().int().min(0),
  toolNames: z.array(z.string())
})

const queryToolCatalogOutputSchema = z.object({
  intent: toolCatalogIntentSchema.optional(),
  purpose: z.string(),
  count: z.number().int().min(0),
  toolsets: z.array(toolsetCatalogItemSchema)
})

const normalize = (value: string): string => value.trim().toLowerCase()

const tokenizePurpose = (purpose: string): string[] => {
  const normalizedPurpose = normalize(purpose)
  const coarseParts = normalizedPurpose
    .split(/[\s,，。；;、:：/\\|()[\]{}"'“”‘’!?！？]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  const cjkBigrams: string[] = []
  const cjkRuns = normalizedPurpose.match(/[\u4e00-\u9fff]{2,}/g) ?? []
  for (const run of cjkRuns) {
    for (let index = 0; index < run.length - 1; index += 1) {
      cjkBigrams.push(run.slice(index, index + 2))
    }
  }
  return [...new Set([...coarseParts, ...cjkBigrams])]
}

const scoreToolset = (
  toolset: z.infer<typeof toolsetCatalogItemSchema>,
  purpose: string
): number => {
  const normalizedPurpose = normalize(purpose)
  if (!normalizedPurpose) return 1

  const haystack = normalize(
    [
      toolset.id,
      toolset.title,
      toolset.summary,
      ...toolset.tags,
      ...toolset.activationHints,
      ...toolset.whenToUse,
      ...toolset.toolNames
    ].join(' ')
  )
  const parts = tokenizePurpose(normalizedPurpose)

  let score = 0
  for (const part of parts) {
    if (haystack.includes(part)) score += 1
  }
  return score
}

const INTENT_TOOLSET_IDS: Record<z.infer<typeof toolCatalogIntentSchema>, string[]> = {
  network_search: ['network_web_search'],
  world_read: ['world_read'],
  task_inspection: ['task_inspection'],
  math: ['utility_math'],
  background_task: [],
  unknown: []
}

export const queryToolCatalogTool = defineAgentTool({
  name: 'query_tool_catalog',
  description:
    'Query the lightweight toolset catalog before activating specialized tools.',
  inputSchema: queryToolCatalogInputSchema,
  outputSchema: queryToolCatalogOutputSchema,
  metadata: {
    whenToUse: [
      '默认工具不足以完成用户请求，需要寻找某类专门能力',
      '你知道任务意图，但不知道应该激活哪个工具集',
      '用户提出外部查询、世界观数据读取、长任务处理或后台能力需求'
    ],
    whenNotToUse: [
      '当前默认工具已经足够完成任务',
      '你已经明确知道需要激活的 toolsetId，可直接调用 activate_toolset'
    ],
    inputSummary:
      '可选 intent 标注能力类型；可选 purpose 描述需要的能力；可选 toolsetIds 用于精确查询；maxResults 限制返回数量。',
    outputSummary:
      '返回少量匹配工具集的轻量目录，只包含用途、激活提示和工具名，不返回完整工具 schema。',
    usageContract: [
      '本工具只查询工具底图，不会激活工具集。',
      '当意图明确时优先传 intent，例如联网搜索传 network_search，读取世界观传 world_read。',
      '拿到候选工具集后，如确实需要其中能力，再调用 activate_toolset。',
      '不要把未返回的工具集当成已存在能力。'
    ],
    riskLevel: 'low',
    readOnly: true,
    idempotent: true,
    contextRetention: 'ephemeral'
  },
  async execute(input) {
    const purpose = input.purpose?.trim() || ''
    const requestedIds = new Set((input.toolsetIds ?? []).map(normalize))
    const intentIds = new Set(input.intent ? INTENT_TOOLSET_IDS[input.intent].map(normalize) : [])
    const maxResults = input.maxResults ?? 6
    const catalog = listToolsetCatalog()

    const ranked = catalog
      .map((toolset) => ({
        toolset,
        score:
          requestedIds.size > 0
            ? requestedIds.has(normalize(toolset.id)) ? 100 : 0
            : intentIds.size > 0 && intentIds.has(normalize(toolset.id))
              ? 80 + scoreToolset(toolset, purpose)
            : scoreToolset(toolset, purpose)
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.toolset.id.localeCompare(b.toolset.id))

    const fallbackRanked =
      requestedIds.size > 0
        ? []
        : catalog.map((toolset) => ({ toolset, score: 1 }))
    const toolsets = (ranked.length > 0 ? ranked : fallbackRanked)
      .slice(0, maxResults)
      .map((item) => item.toolset)

    return {
      intent: input.intent,
      purpose,
      count: toolsets.length,
      toolsets
    }
  },
  successMessage(data) {
    if (data.count === 0) return 'No matching toolsets are currently discoverable.'
    return `Found ${data.count} candidate toolset(s): ${data.toolsets.map((item) => item.id).join(', ')}.`
  },
  buildReceipt(data) {
    return {
      kind: 'tool_catalog_queried',
      summary:
        data.count > 0
          ? `已找到候选工具集：${data.toolsets.map((item) => item.id).join(', ')}`
          : '未找到候选工具集。',
      payload: {
        toolsetIds: data.toolsets.map((item) => item.id)
      }
    }
  },
  nextSuggestions(data) {
    if (data.count === 0) {
      return ['Use the default tools, or explain that no suitable toolset is available.']
    }
    return ['If one candidate matches the request, activate it with activate_toolset before using its tools.']
  }
})
