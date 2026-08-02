import type { TaskExecutorKind } from '@share/cache/AItype/states/taskLifecycleState'
import type { ChildAgentToolRegistry, ToolsetRegistryEntry } from './toolRegistryTypes'
import { listEnabledEntries, toToolMap, validateToolRegistry } from './toolRegistryTypes'
import { getCharacterDetailTool } from '../tools/character/getCharacterDetail'
import { upsertCharacterDescriptionTool } from '../tools/character/upsertCharacterDescription'

export const childAgentToolsets: ToolsetRegistryEntry[] = [
  {
    id: 'character_editor',
    title: '人物编辑子 Agent 工具',
    summary: '供人物编辑子 Agent 读取人物并写入人物描述。',
    tags: ['character', 'child-agent', 'editor'],
    activationHints: ['人物编辑子 Agent 启动时直接挂载。'],
    whenToUse: ['执行人物描述编辑任务。'],
    discoverable: false
  }
]

export const childAgentToolRegistry: ChildAgentToolRegistry = {
  general_task_worker: [],
  code_worker: [],
  doc_worker: [],
  character_editor: [
    {
      key: getCharacterDetailTool.name,
      tool: getCharacterDetailTool,
      toolsetId: 'character_editor',
      category: 'character_read',
      capabilityLayer: 'domain',
      capabilityGroup: '领域读取',
      capabilitySummary: '读取人物详情供人物编辑子 agent 使用。',
      audience: 'child_agent',
      access: 'read',
      activationMode: 'always',
      enabled: true
    },
    {
      key: upsertCharacterDescriptionTool.name,
      tool: upsertCharacterDescriptionTool,
      toolsetId: 'character_editor',
      category: 'character_write',
      capabilityLayer: 'domain',
      capabilityGroup: '领域写入',
      capabilitySummary: '写入人物 description 字段供人物编辑子 agent 使用。',
      audience: 'child_agent',
      access: 'write',
      activationMode: 'always',
      enabled: true
    }
  ],
  tool_builder: [],
  architecture_analyst: [],
  general_research: []
}

validateToolRegistry({
  registryName: 'child agent tool registry',
  entries: Object.values(childAgentToolRegistry).flat(),
  toolsets: childAgentToolsets,
  allowedAudiences: ['child_agent', 'shared']
})

export const getChildAgentToolEntries = (executorKind: TaskExecutorKind) =>
  listEnabledEntries(childAgentToolRegistry[executorKind] ?? [])

export const getChildAgentTools = (executorKind: TaskExecutorKind) =>
  toToolMap(getChildAgentToolEntries(executorKind))
