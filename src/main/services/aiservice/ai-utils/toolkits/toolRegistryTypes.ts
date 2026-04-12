import type { TaskExecutorKind } from '@share/cache/AItype/states/taskLifecycleState'
import type { AgentTool } from '../core/agentTool'

export type ToolAudience = 'main_agent' | 'child_agent' | 'shared'
export type ToolAccess = 'read' | 'write' | 'delegate' | 'control'

export type AgentToolRegistryEntry = {
  key: string
  tool: AgentTool
  category: string
  audience: ToolAudience
  access: ToolAccess
  enabled: boolean
}

export type ChildAgentToolRegistry = Record<TaskExecutorKind, AgentToolRegistryEntry[]>

export const listEnabledEntries = (
  entries: AgentToolRegistryEntry[]
): AgentToolRegistryEntry[] => entries.filter((entry) => entry.enabled)

export const toToolMap = (
  entries: AgentToolRegistryEntry[]
): Record<string, AgentTool> =>
  Object.fromEntries(entries.map((entry) => [entry.tool.name, entry.tool])) as Record<
    string,
    AgentTool
  >
