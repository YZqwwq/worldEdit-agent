import type { TaskExecutorKind } from '@share/cache/AItype/states/taskLifecycleState'
import type { AgentTool } from '../core/agentTool'

export type ToolAudience = 'main_agent' | 'child_agent' | 'shared'
export type ToolAccess = 'read' | 'write' | 'delegate' | 'control'
export type ToolCapabilityLayer = 'core' | 'domain' | 'extension' | 'sub_agent'

export type ToolVisibilityState = {
  enabledExtensionTools?: string[]
}

export type AgentToolRegistryEntry = {
  key: string
  tool: AgentTool
  category: string
  capabilityLayer: ToolCapabilityLayer
  capabilityGroup: string
  capabilitySummary: string
  audience: ToolAudience
  access: ToolAccess
  enabled: boolean
  defaultVisible?: boolean
  discoverable?: boolean
}

export type ChildAgentToolRegistry = Record<TaskExecutorKind, AgentToolRegistryEntry[]>

export const listEnabledEntries = (
  entries: AgentToolRegistryEntry[]
): AgentToolRegistryEntry[] => entries.filter((entry) => entry.enabled)

export const isToolVisible = (
  entry: AgentToolRegistryEntry,
  state?: ToolVisibilityState
): boolean => {
  if (!entry.enabled) return false
  if (entry.defaultVisible !== false) return true
  if (entry.capabilityLayer !== 'extension') return false

  const enabledExtensionTools = new Set(state?.enabledExtensionTools ?? [])
  return enabledExtensionTools.has(entry.key) || enabledExtensionTools.has(entry.tool.name)
}

export const listVisibleEntries = (
  entries: AgentToolRegistryEntry[],
  state?: ToolVisibilityState
): AgentToolRegistryEntry[] => entries.filter((entry) => isToolVisible(entry, state))

export const listDiscoverableExtensionEntries = (
  entries: AgentToolRegistryEntry[]
): AgentToolRegistryEntry[] =>
  entries.filter(
    (entry) =>
      entry.enabled &&
      entry.capabilityLayer === 'extension' &&
      entry.discoverable !== false
  )

export const toToolMap = (
  entries: AgentToolRegistryEntry[]
): Record<string, AgentTool> =>
  Object.fromEntries(entries.map((entry) => [entry.tool.name, entry.tool])) as Record<
    string,
    AgentTool
  >
