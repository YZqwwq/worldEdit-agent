import type {
  AgentToolRegistryEntry,
  ToolActivationState,
  ToolsetRegistryEntry
} from '../toolkits/toolRegistryTypes'

const normalize = (value: string): string => value.trim().toLowerCase()

const buildQuickToolsetDirectory = (
  state: ToolActivationState | undefined,
  toolsets: ToolsetRegistryEntry[]
): string[] => {
  const quickIds = new Set((state?.quickToolsets ?? []).map(normalize))
  if (quickIds.size === 0) return []

  const entries = toolsets
    .filter((toolset) => quickIds.has(normalize(toolset.id)))
    .map((toolset) => `- ${toolset.id}：${toolset.summary}`)

  return entries.length > 0
    ? ['常用工具集目录（仅目录，调用前仍需 activate_toolset）：', ...entries]
    : []
}

/**
 * Tool names, descriptions and input schemas are already supplied through bindTools.
 * Keep this projection limited to cross-tool rules and lightweight directory hints.
 */
export function buildToolUsageSystemPrompt(
  toolRegistryEntries: AgentToolRegistryEntry[],
  state?: ToolActivationState,
  toolsets: ToolsetRegistryEntry[] = []
): string | null {
  if (toolRegistryEntries.length === 0) return null
  void toolRegistryEntries

  return [
    '工具调用原则：',
    '1. 本地状态和外部事实优先用工具确认；不要猜测。',
    '2. 参数尽量使用用户语言和最近结果中的稳定标识；不要编造 ID。',
    '3. 只读工具可返回多个候选；写入、删除和委派必须先唯一定位目标。',
    '4. 工具失败也是可消费结果：根据 message、候选和 nextSuggestions 调整调用或继续回答，不要直接中止整轮。',
    '5. 当前工具不足时先 query_tool_catalog，再 activate_toolset；未激活的工具集不可调用。',
    '6. eventual 工具只有 completion.state=completed 才表示工作完成。',
    ...buildQuickToolsetDirectory(state, toolsets)
  ].join('\n')
}
