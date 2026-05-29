import type { TaskExecutorKind } from '@share/cache/AItype/states/taskLifecycleState'
import type { AgentTool } from '../core/agentTool'

export type ToolAudience = 'main_agent' | 'child_agent' | 'shared'
export type ToolAccess = 'read' | 'write' | 'delegate' | 'control'
export type ToolCapabilityLayer =
  | 'core'
  | 'domain'
  | 'network'
  | 'sub_agent'
  | 'background_toolset'
export type ToolActivationMode = 'always' | 'manual' | 'task_context'
export type ToolVisibilityTier = 'core' | 'quick_access' | 'activated' | 'hidden'
export type ToolQuickAccessScope = 'tool' | 'toolset'

export type ToolActivationState = {
  activeToolsets?: string[]
  activeTools?: string[]
  quickToolsets?: string[]
  quickTools?: string[]
  suppressedTools?: string[]
}

export type ToolsetRegistryEntry = {
  id: string
  title: string
  summary: string
  tags: string[]
  activationHints: string[]
  whenToUse: string[]
  whenNotToUse?: string[]
  discoverable?: boolean
  quickAccessEligible?: boolean
  quickAccessScope?: ToolQuickAccessScope
}

export type AgentToolRegistryEntry = {
  key: string
  tool: AgentTool
  toolsetId: string
  category: string
  capabilityLayer: ToolCapabilityLayer
  capabilityGroup: string
  capabilitySummary: string
  audience: ToolAudience
  access: ToolAccess
  activationMode: ToolActivationMode
  enabled: boolean
  tags?: string[]
  quickAccessEligible?: boolean
  quickAccessScope?: ToolQuickAccessScope
  turnCallLimit?: number
}

export type ChildAgentToolRegistry = Record<TaskExecutorKind, AgentToolRegistryEntry[]>

const normalize = (value: string): string => value.trim().toLowerCase()

export const listEnabledEntries = (
  entries: AgentToolRegistryEntry[]
): AgentToolRegistryEntry[] => entries.filter((entry) => entry.enabled)

export const isToolVisible = (
  entry: AgentToolRegistryEntry,
  state?: ToolActivationState
): boolean => {
  if (!entry.enabled) return false
  const suppressedTools = new Set((state?.suppressedTools ?? []).map(normalize))
  if (
    suppressedTools.has(normalize(entry.key)) ||
    suppressedTools.has(normalize(entry.tool.name))
  ) {
    return false
  }
  if (entry.activationMode === 'always') return true

  const activeToolsets = new Set((state?.activeToolsets ?? []).map(normalize))
  const activeTools = new Set((state?.activeTools ?? []).map(normalize))
  const quickToolsets = new Set((state?.quickToolsets ?? []).map(normalize))
  const quickTools = new Set((state?.quickTools ?? []).map(normalize))
  return (
    activeToolsets.has(normalize(entry.toolsetId)) ||
    activeTools.has(normalize(entry.key)) ||
    activeTools.has(normalize(entry.tool.name)) ||
    quickToolsets.has(normalize(entry.toolsetId)) ||
    quickTools.has(normalize(entry.key)) ||
    quickTools.has(normalize(entry.tool.name))
  )
}

export const getToolVisibilityTier = (
  entry: AgentToolRegistryEntry,
  state?: ToolActivationState
): ToolVisibilityTier => {
  if (!entry.enabled) return 'hidden'
  const suppressedTools = new Set((state?.suppressedTools ?? []).map(normalize))
  if (
    suppressedTools.has(normalize(entry.key)) ||
    suppressedTools.has(normalize(entry.tool.name))
  ) {
    return 'hidden'
  }
  if (entry.activationMode === 'always') return 'core'

  const activeToolsets = new Set((state?.activeToolsets ?? []).map(normalize))
  const activeTools = new Set((state?.activeTools ?? []).map(normalize))
  if (
    activeToolsets.has(normalize(entry.toolsetId)) ||
    activeTools.has(normalize(entry.key)) ||
    activeTools.has(normalize(entry.tool.name))
  ) {
    return 'activated'
  }

  const quickToolsets = new Set((state?.quickToolsets ?? []).map(normalize))
  const quickTools = new Set((state?.quickTools ?? []).map(normalize))
  if (
    quickToolsets.has(normalize(entry.toolsetId)) ||
    quickTools.has(normalize(entry.key)) ||
    quickTools.has(normalize(entry.tool.name))
  ) {
    return 'quick_access'
  }

  return 'hidden'
}

export const listVisibleEntries = (
  entries: AgentToolRegistryEntry[],
  state?: ToolActivationState
): AgentToolRegistryEntry[] => entries.filter((entry) => isToolVisible(entry, state))

export const listDiscoverableToolsets = (
  toolsets: ToolsetRegistryEntry[]
): ToolsetRegistryEntry[] =>
  toolsets.filter((toolset) => toolset.discoverable !== false)

export const toToolMap = (
  entries: AgentToolRegistryEntry[]
): Record<string, AgentTool> =>
  Object.fromEntries(entries.map((entry) => [entry.tool.name, entry.tool])) as Record<
    string,
    AgentTool
  >
