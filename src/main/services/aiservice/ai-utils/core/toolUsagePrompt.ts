import type { AgentToolRegistryEntry, ToolActivationState } from '../toolkits/toolRegistryTypes'
import { getToolVisibilityTier } from '../toolkits/toolRegistryTypes'

const CAPABILITY_LAYER_DESCRIPTIONS: Record<string, string> = {
  core: '核心工具：低成本、默认可见，用于工具底图查询、工具集激活、时间确认和短期历史回忆。',
  domain: '领域工具：访问本地世界观、角色、任务等业务数据库；默认按工具集激活后使用。',
  network: '联网工具：访问外部公开信息；默认按工具集激活后使用。',
  sub_agent: '子 agent 协作：启动或继续后台子 agent 流程，不用于普通查询。',
  background_toolset: '后台工具集：用于可暂停、可继续的后台人格化任务。'
}

const groupEntries = (
  entries: AgentToolRegistryEntry[]
): Array<{ layer: string; group: string; entries: AgentToolRegistryEntry[] }> => {
  const groups = new Map<string, { layer: string; group: string; entries: AgentToolRegistryEntry[] }>()
  for (const entry of entries) {
    const key = `${entry.capabilityLayer}:${entry.capabilityGroup}`
    const group = groups.get(key) ?? {
      layer: entry.capabilityLayer,
      group: entry.capabilityGroup,
      entries: []
    }
    group.entries.push(entry)
    groups.set(key, group)
  }
  return [...groups.values()]
}

export function buildToolUsageSystemPrompt(
  toolRegistryEntries: AgentToolRegistryEntry[],
  state?: ToolActivationState
): string | null {
  if (toolRegistryEntries.length === 0) {
    return null
  }

  const visibleLayers = [...new Set(toolRegistryEntries.map((entry) => entry.capabilityLayer))]
  const capabilityMap = visibleLayers
    .map((layer) => CAPABILITY_LAYER_DESCRIPTIONS[layer] ?? `${layer}：可用工具层。`)
    .join('\n')

  const toolSections = groupEntries(toolRegistryEntries)
    .map((group) => {
      const tools = group.entries
        .map((entry, index) => {
          const registeredTool = entry.tool
          const metadata = registeredTool.agentMetadata
          const tier = getToolVisibilityTier(entry, state)
          const tierLabel =
            tier === 'core'
              ? '常驻核心'
              : tier === 'quick_access'
                ? '常用快捷槽'
                : tier === 'activated'
                  ? '已激活工具集'
                  : '隐藏'
          const lines = [
            `${index + 1}. ${registeredTool.name}`,
            `可见层级：${tierLabel}`,
            `类别：${entry.category}；访问：${entry.access}；面向：${entry.audience}`,
            `能力摘要：${entry.capabilitySummary}`,
            `用途：${registeredTool.baseDescription}`,
            `何时使用：${metadata.whenToUse.join('；')}`,
            `不要使用：${metadata.whenNotToUse?.join('；') || '当问题不需要该工具时不要调用。'}`,
            `输入：${metadata.inputSummary}`,
            `输出：${metadata.outputSummary}`,
            `结果保留：${metadata.contextRetention}`,
            `风险级别：${metadata.riskLevel}；只读：${metadata.readOnly ? '是' : '否'}；幂等：${metadata.idempotent ? '是' : '否'}`
          ]

          if (typeof entry.turnCallLimit === 'number') {
            lines.push(`本轮调用上限：${entry.turnCallLimit} 次；成功后应基于工具证据回答，不要重复调用。`)
          }

          if (metadata.usageContract?.length) {
            lines.push(`调用契约：${metadata.usageContract.join('；')}`)
          }

          if (metadata.examples?.length) {
            lines.push(`示例：${metadata.examples.join('；')}`)
          }

          return lines.join('\n')
        })
        .join('\n\n')

      return `【${group.group} / ${group.layer}】\n${tools}`
    })
    .join('\n\n')

  return [
    '工具使用规则：',
    '0. 工具分三层：常驻核心工具始终可用；常用快捷槽最多 3 个，来自近期高频专门工具或工具集，可直接调用；按需工具集默认隐藏，需要先查询底图再激活。',
    '1. 遇到本地数据库、世界观状态、配置或其他真实系统状态问题时，优先调用工具确认，不要猜测。',
    '2. 在执行写入、删除或修改类动作前，先使用只读工具确认目标对象存在且上下文准确。',
    '3. 如果工具返回 ok=false，必须依据 error/message 向用户说明限制或失败原因，不要伪造成功结果。',
    '4. 如果用户问题可以被工具精确回答，应优先依据工具结果作答，而不是依赖通用常识推断。',
    '5. 如果最近几轮已经通过工具或明确回复确认了 worldId、worldName、entityId 等结构化标识，后续调用写入类或委派类工具时必须优先沿用这些已确认标识，不要无故丢失。',
    '6. 只有在上下文确实无法唯一定位目标时，才向用户追问；如果系统内已经能唯一确定目标，不要重复向用户索取已经确认过的信息。',
    '7. 专门工具集默认不可见；需要本地领域、联网、后台或高成本能力时，如果当前可用工具里没有合适快捷工具，先调用 query_tool_catalog 查询工具底图，再用 activate_toolset 激活，不要假设隐藏工具已经可用。',
    '8. 当没有合适工具时，再明确告诉用户当前能力边界。',
    '',
    '工具能力地图：',
    capabilityMap,
    '',
    '当前可用工具：',
    toolSections
  ].join('\n')
}
