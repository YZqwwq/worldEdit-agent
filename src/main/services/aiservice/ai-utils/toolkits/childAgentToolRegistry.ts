import type { TaskExecutorKind } from '@share/cache/AItype/states/taskLifecycleState'
import type { ChildAgentToolRegistry } from './toolRegistryTypes'
import { listEnabledEntries, toToolMap } from './toolRegistryTypes'
import { getCharacterDetailTool } from '../tools/character/getCharacterDetail'
import { upsertCharacterDescriptionTool } from '../tools/character/upsertCharacterDescription'

export const childAgentToolRegistry: ChildAgentToolRegistry = {
  general_task_worker: [],
  code_worker: [],
  doc_worker: [],
  character_editor: [
    {
      key: getCharacterDetailTool.name,
      tool: getCharacterDetailTool,
      category: 'character_read',
      audience: 'child_agent',
      access: 'read',
      enabled: true
    },
    {
      key: upsertCharacterDescriptionTool.name,
      tool: upsertCharacterDescriptionTool,
      category: 'character_write',
      audience: 'child_agent',
      access: 'write',
      enabled: true
    }
  ],
  tool_builder: [],
  architecture_analyst: [],
  general_research: []
}

export const getChildAgentToolEntries = (
  executorKind: TaskExecutorKind
) => listEnabledEntries(childAgentToolRegistry[executorKind] ?? [])

export const getChildAgentTools = (executorKind: TaskExecutorKind) =>
  toToolMap(getChildAgentToolEntries(executorKind))
