import * as z from 'zod'
import { defineAgentTool } from '../../core/agentTool'
import { listToolsetCatalog } from '../../toolkits/toolsetCatalog'

const activateToolsetInputSchema = z.object({
  toolsetIds: z.array(z.string().trim().min(1)).min(1).max(8),
  purpose: z.string().trim().max(500).optional()
})

const activateToolsetOutputSchema = z.object({
  purpose: z.string(),
  activatedToolsets: z.array(z.string()),
  activatedTools: z.array(z.string()),
  missingToolsets: z.array(z.string())
})

const normalize = (value: string): string => value.trim().toLowerCase()

export const activateToolsetTool = defineAgentTool({
  name: 'activate_toolset',
  description:
    'Activate one or more specialized toolsets so their concrete tools become visible in the next model step.',
  inputSchema: activateToolsetInputSchema,
  outputSchema: activateToolsetOutputSchema,
  metadata: {
    whenToUse: [
      '已经通过 query_tool_catalog 找到匹配工具集，需要使用其中具体工具',
      '后台任务或任务上下文明确给出了 toolsetId，需要恢复对应能力',
      '默认工具无法完成请求，但已明确知道要激活哪个工具集'
    ],
    whenNotToUse: [
      '还不知道应该使用哪个工具集时，应先调用 query_tool_catalog',
      '当前默认工具已经足够完成任务',
      '只是想了解工具目录而不打算使用具体能力'
    ],
    inputSummary:
      '输入一个或多个 toolsetIds，并可附带 purpose 说明激活目的。',
    outputSummary:
      '返回已激活工具集、下一轮会出现的工具名，以及不存在的工具集 id。',
    usageContract: [
      '本工具只激活工具集，不直接执行具体能力。',
      '激活成功后，下一次模型循环才能看到该工具集里的真实工具 schema。',
      '如果 missingToolsets 非空，不要编造这些工具集的能力。'
    ],
    riskLevel: 'low',
    readOnly: true,
    idempotent: true,
    contextRetention: 'ephemeral'
  },
  async execute(input) {
    const purpose = input.purpose?.trim() || ''
    const catalog = listToolsetCatalog()
    const catalogById = new Map(catalog.map((toolset) => [normalize(toolset.id), toolset]))
    const requested = [...new Set(input.toolsetIds.map((item) => item.trim()).filter(Boolean))]
    const activatedToolsets: string[] = []
    const activatedTools: string[] = []
    const missingToolsets: string[] = []

    for (const toolsetId of requested) {
      const toolset = catalogById.get(normalize(toolsetId))
      if (!toolset) {
        missingToolsets.push(toolsetId)
        continue
      }

      activatedToolsets.push(toolset.id)
      activatedTools.push(...toolset.toolNames)
    }

    return {
      purpose,
      activatedToolsets,
      activatedTools: [...new Set(activatedTools)],
      missingToolsets
    }
  },
  successMessage(data) {
    const activated = data.activatedToolsets.join(', ') || 'none'
    const missing = data.missingToolsets.length > 0
      ? ` Missing: ${data.missingToolsets.join(', ')}.`
      : ''
    return `Activated toolset(s): ${activated}.${missing}`
  },
  buildReceipt(data) {
    return {
      kind: 'toolsets_activated',
      summary:
        data.activatedToolsets.length > 0
          ? `已激活工具集：${data.activatedToolsets.join(', ')}`
          : '没有工具集被激活。',
      payload: {
        activatedToolsets: data.activatedToolsets,
        activatedTools: data.activatedTools,
        missingToolsets: data.missingToolsets
      }
    }
  },
  nextSuggestions(data) {
    if (data.activatedToolsets.length === 0) {
      return ['Query the catalog again or explain that no matching toolset exists.']
    }
    return ['In the next model step, call a concrete tool from the activated toolset if it matches the task.']
  }
})
