import type { TaskExecutorKind } from '@share/cache/AItype/states/taskLifecycleState'
import type { AgentTool } from '../core/agentTool'
import { getCharacterDetailTool } from '../tools/character/getCharacterDetail'
import { upsertCharacterDescriptionTool } from '../tools/character/upsertCharacterDescription'
import { continueActiveChildAgentTool } from '../tools/task/continueActiveChildAgent'
import { delegateCharacterEditorTool } from '../tools/task/delegateCharacterEditor'
import { getActiveTaskContextTool } from '../tools/task/getActiveTaskContext'
import { getTaskDetailTool } from '../tools/task/getTaskDetail'
import { addTool } from '../tools/utility/add'
import { getTimeTool } from '../tools/utility/getTime'
import { getEntityDetailTool } from '../tools/world/getEntityDetail'
import { getWorldSchemaCatalogTool } from '../tools/world/getWorldSchemaCatalog'
import { listCharactersTool } from '../tools/world/listCharacters'
import { listEntitiesTool } from '../tools/world/listEntities'
import { listWorldsTool } from '../tools/world/listWorlds'
import { resolveWorldByNameTool } from '../tools/world/resolveWorldByName'
import { searchEntitiesTool } from '../tools/world/searchEntities'

export type ToolAudience = 'main_agent' | 'child_agent' | 'shared'
export type ToolAccess = 'read' | 'write' | 'delegate' | 'control'

export type ToolScope =
  | {
      kind: 'main_agent'
    }
  | {
      kind: 'child_agent'
      executorKind: TaskExecutorKind
    }

export type UnifiedToolRegistryEntry = {
  key: string
  tool: AgentTool
  category: string
  audience: ToolAudience
  access: ToolAccess
  enabled: boolean
  scopes: ToolScope[]
}

const toToolMap = (entries: UnifiedToolRegistryEntry[]): Record<string, AgentTool> =>
  Object.fromEntries(entries.map((entry) => [entry.tool.name, entry.tool])) as Record<string, AgentTool>

const hasMainAgentScope = (entry: UnifiedToolRegistryEntry): boolean =>
  entry.enabled && entry.scopes.some((scope) => scope.kind === 'main_agent')

const hasExecutorScope = (
  entry: UnifiedToolRegistryEntry,
  executorKind: TaskExecutorKind
): boolean =>
  entry.enabled &&
  entry.scopes.some(
    (scope) => scope.kind === 'child_agent' && scope.executorKind === executorKind
  )

export const unifiedToolRegistry: UnifiedToolRegistryEntry[] = [
  {
    key: addTool.name,
    tool: addTool,
    category: 'utility',
    audience: 'main_agent',
    access: 'read',
    enabled: true,
    scopes: [{ kind: 'main_agent' }]
  },
  {
    key: getTimeTool.name,
    tool: getTimeTool,
    category: 'utility',
    audience: 'main_agent',
    access: 'read',
    enabled: true,
    scopes: [{ kind: 'main_agent' }]
  },
  {
    key: continueActiveChildAgentTool.name,
    tool: continueActiveChildAgentTool,
    category: 'task_protocol',
    audience: 'main_agent',
    access: 'control',
    enabled: true,
    scopes: [{ kind: 'main_agent' }]
  },
  {
    key: delegateCharacterEditorTool.name,
    tool: delegateCharacterEditorTool,
    category: 'task_protocol',
    audience: 'main_agent',
    access: 'delegate',
    enabled: true,
    scopes: [{ kind: 'main_agent' }]
  },
  {
    key: getActiveTaskContextTool.name,
    tool: getActiveTaskContextTool,
    category: 'task_protocol',
    audience: 'main_agent',
    access: 'read',
    enabled: true,
    scopes: [{ kind: 'main_agent' }]
  },
  {
    key: getTaskDetailTool.name,
    tool: getTaskDetailTool,
    category: 'task_inspection',
    audience: 'main_agent',
    access: 'read',
    enabled: true,
    scopes: [{ kind: 'main_agent' }]
  },
  {
    key: getEntityDetailTool.name,
    tool: getEntityDetailTool,
    category: 'world_read',
    audience: 'main_agent',
    access: 'read',
    enabled: true,
    scopes: [{ kind: 'main_agent' }]
  },
  {
    key: getWorldSchemaCatalogTool.name,
    tool: getWorldSchemaCatalogTool,
    category: 'world_read',
    audience: 'main_agent',
    access: 'read',
    enabled: true,
    scopes: [{ kind: 'main_agent' }]
  },
  {
    key: listCharactersTool.name,
    tool: listCharactersTool,
    category: 'world_read',
    audience: 'main_agent',
    access: 'read',
    enabled: true,
    scopes: [{ kind: 'main_agent' }]
  },
  {
    key: listEntitiesTool.name,
    tool: listEntitiesTool,
    category: 'world_read',
    audience: 'main_agent',
    access: 'read',
    enabled: true,
    scopes: [{ kind: 'main_agent' }]
  },
  {
    key: listWorldsTool.name,
    tool: listWorldsTool,
    category: 'world_read',
    audience: 'main_agent',
    access: 'read',
    enabled: true,
    scopes: [{ kind: 'main_agent' }]
  },
  {
    key: resolveWorldByNameTool.name,
    tool: resolveWorldByNameTool,
    category: 'world_read',
    audience: 'main_agent',
    access: 'read',
    enabled: true,
    scopes: [{ kind: 'main_agent' }]
  },
  {
    key: searchEntitiesTool.name,
    tool: searchEntitiesTool,
    category: 'world_read',
    audience: 'main_agent',
    access: 'read',
    enabled: true,
    scopes: [{ kind: 'main_agent' }]
  },
  {
    key: getCharacterDetailTool.name,
    tool: getCharacterDetailTool,
    category: 'character_read',
    audience: 'child_agent',
    access: 'read',
    enabled: true,
    scopes: [{ kind: 'child_agent', executorKind: 'character_editor' }]
  },
  {
    key: upsertCharacterDescriptionTool.name,
    tool: upsertCharacterDescriptionTool,
    category: 'character_write',
    audience: 'child_agent',
    access: 'write',
    enabled: true,
    scopes: [{ kind: 'child_agent', executorKind: 'character_editor' }]
  }
]

export const getToolEntriesForMainAgent = (): UnifiedToolRegistryEntry[] =>
  unifiedToolRegistry.filter(hasMainAgentScope)

export const getToolsForMainAgent = (): Record<string, AgentTool> =>
  toToolMap(getToolEntriesForMainAgent())

export const getToolEntriesForExecutor = (
  executorKind: TaskExecutorKind
): UnifiedToolRegistryEntry[] => unifiedToolRegistry.filter((entry) => hasExecutorScope(entry, executorKind))

export const getToolsForExecutor = (
  executorKind: TaskExecutorKind
): Record<string, AgentTool> => toToolMap(getToolEntriesForExecutor(executorKind))
