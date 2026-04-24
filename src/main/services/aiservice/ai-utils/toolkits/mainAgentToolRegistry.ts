import type { AgentToolRegistryEntry } from './toolRegistryTypes'
import { listEnabledEntries, toToolMap } from './toolRegistryTypes'
import { continueActiveChildAgentTool } from '../tools/task/continueActiveChildAgent'
import { delegateCharacterEditorTool } from '../tools/task/delegateCharacterEditor'
import { getActiveTaskContextTool } from '../tools/task/getActiveTaskContext'
import { getTaskDetailTool } from '../tools/task/getTaskDetail'
import { officialWebSearchTool } from '../tools/network/officialWebSearch'
import { addTool } from '../tools/utility/add'
import { getEntityDetailTool } from '../tools/world/getEntityDetail'
import { getWorldSchemaCatalogTool } from '../tools/world/getWorldSchemaCatalog'
import { listCharactersTool } from '../tools/world/listCharacters'
import { listEntitiesTool } from '../tools/world/listEntities'
import { listWorldsTool } from '../tools/world/listWorlds'
import { resolveWorldByNameTool } from '../tools/world/resolveWorldByName'
import { searchEntitiesTool } from '../tools/world/searchEntities'

export const mainAgentToolRegistry: AgentToolRegistryEntry[] = [
  {
    key: addTool.name,
    tool: addTool,
    category: 'utility',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: officialWebSearchTool.name,
    tool: officialWebSearchTool,
    category: 'network_read',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: continueActiveChildAgentTool.name,
    tool: continueActiveChildAgentTool,
    category: 'task_protocol',
    audience: 'main_agent',
    access: 'control',
    enabled: true
  },
  {
    key: delegateCharacterEditorTool.name,
    tool: delegateCharacterEditorTool,
    category: 'task_protocol',
    audience: 'main_agent',
    access: 'delegate',
    enabled: true
  },
  {
    key: getActiveTaskContextTool.name,
    tool: getActiveTaskContextTool,
    category: 'task_protocol',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: getTaskDetailTool.name,
    tool: getTaskDetailTool,
    category: 'task_inspection',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: getEntityDetailTool.name,
    tool: getEntityDetailTool,
    category: 'world_read',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: getWorldSchemaCatalogTool.name,
    tool: getWorldSchemaCatalogTool,
    category: 'world_read',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: listCharactersTool.name,
    tool: listCharactersTool,
    category: 'world_read',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: listEntitiesTool.name,
    tool: listEntitiesTool,
    category: 'world_read',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: listWorldsTool.name,
    tool: listWorldsTool,
    category: 'world_read',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: resolveWorldByNameTool.name,
    tool: resolveWorldByNameTool,
    category: 'world_read',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: searchEntitiesTool.name,
    tool: searchEntitiesTool,
    category: 'world_read',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  }
]

export const getMainAgentToolEntries = (): AgentToolRegistryEntry[] =>
  listEnabledEntries(mainAgentToolRegistry)

export const getMainAgentTools = () => toToolMap(getMainAgentToolEntries())
