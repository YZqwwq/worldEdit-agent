import type {
  TaskExecutorKind,
  TaskLifecycleState,
  TaskStatus
} from '@share/cache/AItype/states/taskLifecycleState'
import type { AgentTool } from '../core/agentTool'

export type ToolAudience = 'main_agent' | 'child_agent' | 'shared'
export type ToolAccess = 'read' | 'write' | 'delegate' | 'control'
export type ToolCapabilityLayer = 'core' | 'domain' | 'network' | 'sub_agent' | 'background_toolset'
export type ToolActivationMode = 'always' | 'manual' | 'task_context'
export type ToolVisibilityTier = 'core' | 'quick_access' | 'activated' | 'hidden'
export type ToolQuickAccessScope = 'tool' | 'toolset'
export type ToolTaskContextRequirement = {
  match: 'active_task' | 'available_capability'
  executorKinds?: TaskExecutorKind[]
  taskStatuses?: TaskStatus[]
}

export type ToolActivationState = {
  activeToolsets?: string[]
  activeTools?: string[]
  quickToolsets?: string[]
  quickTools?: string[]
  toolCallCounts?: Record<string, number>
  taskLifecycle?: TaskLifecycleState
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
  taskContext?: ToolTaskContextRequirement
}

export type ChildAgentToolRegistry = Record<TaskExecutorKind, AgentToolRegistryEntry[]>

export type ToolRegistryValidationOptions = {
  registryName: string
  entries: AgentToolRegistryEntry[]
  toolsets: ToolsetRegistryEntry[]
  allowedAudiences: ToolAudience[]
}

const normalize = (value: string): string => value.trim().toLowerCase()

export const listEnabledEntries = (entries: AgentToolRegistryEntry[]): AgentToolRegistryEntry[] =>
  entries.filter((entry) => entry.enabled)

export const getToolTurnCallCount = (
  entry: AgentToolRegistryEntry,
  state?: ToolActivationState
): number => state?.toolCallCounts?.[entry.tool.name] ?? state?.toolCallCounts?.[entry.key] ?? 0

export const isToolCallLimitReached = (
  entry: AgentToolRegistryEntry,
  state?: ToolActivationState
): boolean =>
  entry.turnCallLimit !== undefined && getToolTurnCallCount(entry, state) >= entry.turnCallLimit

export const incrementToolTurnCallCount = (
  entry: AgentToolRegistryEntry,
  counts: Record<string, number>
): Record<string, number> => ({
  ...counts,
  [entry.tool.name]: getToolTurnCallCount(entry, { toolCallCounts: counts }) + 1
})

export const isToolVisible = (
  entry: AgentToolRegistryEntry,
  state?: ToolActivationState
): boolean => {
  if (!entry.enabled) return false
  if (isToolCallLimitReached(entry, state)) {
    return false
  }
  if (entry.activationMode === 'always') return true
  if (entry.activationMode === 'task_context') {
    const requirement = entry.taskContext
    if (!requirement) return false
    if (requirement.match === 'active_task') {
      const activeTask = state?.taskLifecycle?.activeTask
      if (!activeTask) return false
      if (
        requirement.executorKinds?.length &&
        !requirement.executorKinds.includes(activeTask.executorKind)
      ) {
        return false
      }
      if (
        requirement.taskStatuses?.length &&
        !requirement.taskStatuses.includes(activeTask.status)
      ) {
        return false
      }
      return true
    }

    const capability = state?.taskLifecycle?.capability
    if (!capability?.available) return false
    if (normalize(capability.requiredToolName) !== normalize(entry.tool.name)) return false
    return (
      !requirement.executorKinds?.length ||
      requirement.executorKinds.includes(capability.executorKind)
    )
  }

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
  if (!isToolVisible(entry, state)) return 'hidden'
  if (entry.activationMode === 'always') return 'core'
  if (entry.activationMode === 'task_context') return 'activated'

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
): ToolsetRegistryEntry[] => toolsets.filter((toolset) => toolset.discoverable !== false)

const requireNonEmpty = (value: string, label: string, errors: string[]): void => {
  if (!value.trim()) errors.push(`${label} must not be empty.`)
}

export const validateToolRegistry = (options: ToolRegistryValidationOptions): void => {
  const errors: string[] = []
  const toolsetIds = new Map<string, string>()
  const keys = new Map<string, string>()
  const toolNames = new Map<string, string>()
  const allowedAudiences = new Set(options.allowedAudiences)

  for (const toolset of options.toolsets) {
    requireNonEmpty(toolset.id, 'Toolset id', errors)
    requireNonEmpty(toolset.title, `Toolset "${toolset.id}" title`, errors)
    requireNonEmpty(toolset.summary, `Toolset "${toolset.id}" summary`, errors)
    const normalizedId = normalize(toolset.id)
    const existingId = toolsetIds.get(normalizedId)
    if (existingId) {
      errors.push(`Duplicate toolset id "${toolset.id}" conflicts with "${existingId}".`)
    } else if (normalizedId) {
      toolsetIds.set(normalizedId, toolset.id)
    }
  }

  for (const entry of options.entries) {
    const label = entry.key || entry.tool.name || '<unnamed>'
    requireNonEmpty(entry.key, `Registry entry key for "${label}"`, errors)
    requireNonEmpty(entry.tool.name, `Tool name for "${label}"`, errors)
    requireNonEmpty(entry.toolsetId, `Toolset id for "${label}"`, errors)
    requireNonEmpty(entry.category, `Category for "${label}"`, errors)
    requireNonEmpty(entry.capabilityGroup, `Capability group for "${label}"`, errors)
    requireNonEmpty(entry.capabilitySummary, `Capability summary for "${label}"`, errors)

    const normalizedKey = normalize(entry.key)
    const normalizedToolName = normalize(entry.tool.name)
    const existingKey = keys.get(normalizedKey)
    const existingToolName = toolNames.get(normalizedToolName)
    if (existingKey) {
      errors.push(`Duplicate registry key "${entry.key}" conflicts with "${existingKey}".`)
    } else if (normalizedKey) {
      keys.set(normalizedKey, entry.key)
    }
    if (existingToolName) {
      errors.push(`Duplicate tool name "${entry.tool.name}" conflicts with "${existingToolName}".`)
    } else if (normalizedToolName) {
      toolNames.set(normalizedToolName, entry.tool.name)
    }
    if (normalizedKey !== normalizedToolName) {
      errors.push(`Registry key "${entry.key}" must match tool name "${entry.tool.name}".`)
    }
    if (!toolsetIds.has(normalize(entry.toolsetId))) {
      errors.push(`Tool "${label}" references unknown toolset "${entry.toolsetId}".`)
    }
    if (!allowedAudiences.has(entry.audience)) {
      errors.push(
        `Tool "${label}" audience "${entry.audience}" is not allowed in ${options.registryName}.`
      )
    }
    if (entry.access === 'read' && !entry.tool.agentMetadata.readOnly) {
      errors.push(`Read tool "${label}" must declare agentMetadata.readOnly=true.`)
    }
    if (entry.access === 'write' && entry.tool.agentMetadata.readOnly) {
      errors.push(`Write tool "${label}" must declare agentMetadata.readOnly=false.`)
    }
    if (
      entry.tool.agentMetadata.executionLevel === 'confirmation_required' &&
      entry.turnCallLimit !== 1
    ) {
      errors.push(
        `Confirmation-required tool "${label}" must declare turnCallLimit=1 so one confirmation cannot authorize repeated execution.`
      )
    }
    if (
      entry.turnCallLimit !== undefined &&
      (!Number.isInteger(entry.turnCallLimit) || entry.turnCallLimit < 1)
    ) {
      errors.push(`Tool "${label}" turnCallLimit must be a positive integer.`)
    }
    if (entry.activationMode === 'task_context' && !entry.taskContext) {
      errors.push(`Task-context tool "${label}" must declare taskContext requirements.`)
    }
    if (entry.activationMode !== 'task_context' && entry.taskContext) {
      errors.push(`Non-task-context tool "${label}" must not declare taskContext requirements.`)
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid ${options.registryName} (${errors.length} issue${errors.length === 1 ? '' : 's'}):\n- ${errors.join('\n- ')}`
    )
  }
}

export const toToolMap = (entries: AgentToolRegistryEntry[]): Record<string, AgentTool> => {
  const tools: Record<string, AgentTool> = {}
  const normalizedNames = new Set<string>()
  for (const entry of entries) {
    const normalizedName = normalize(entry.tool.name)
    if (normalizedNames.has(normalizedName)) {
      throw new Error(`Duplicate tool name cannot be mapped: "${entry.tool.name}".`)
    }
    normalizedNames.add(normalizedName)
    tools[entry.tool.name] = entry.tool
  }
  return tools
}
