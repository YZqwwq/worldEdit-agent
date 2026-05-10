import type { AgentToolRegistryEntry } from './toolRegistryTypes'
import {
  listDiscoverableExtensionEntries,
  listEnabledEntries,
  listVisibleEntries,
  toToolMap,
  type ToolVisibilityState
} from './toolRegistryTypes'
import {
  configureExtensionToolCatalogProvider,
  toExtensionToolCatalogItem
} from './extensionToolCatalog'
import { continueActiveChildAgentTool } from '../tools/task/continueActiveChildAgent'
import { delegateCharacterEditorTool } from '../tools/task/delegateCharacterEditor'
import { getActiveTaskContextTool } from '../tools/task/getActiveTaskContext'
import { getTaskDetailTool } from '../tools/task/getTaskDetail'
import { officialWebSearchTool } from '../tools/network/officialWebSearch'
import { searchRecentChineseConversationTool } from '../tools/conversation/searchRecentChineseConversation'
import { addTool } from '../tools/utility/add'
import { getExtendToolsTool } from '../tools/utility/getExtendTools'
import { getTimeTool } from '../tools/utility/getTime'
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
    capabilityLayer: 'core',
    capabilityGroup: '基础工具',
    capabilitySummary: '执行明确的简单加法计算。',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: getTimeTool.name,
    tool: getTimeTool,
    category: 'utility',
    capabilityLayer: 'core',
    capabilityGroup: '基础工具',
    capabilitySummary: '查看当前本地时间；通常 context 已提供时间，只有需要重新确认当前时刻时使用。',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: getExtendToolsTool.name,
    tool: getExtendToolsTool,
    category: 'tool_discovery',
    capabilityLayer: 'core',
    capabilityGroup: '基础工具',
    capabilitySummary: '查看并激活默认不可见的拓展工具目录。',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: officialWebSearchTool.name,
    tool: officialWebSearchTool,
    category: 'network_read',
    capabilityLayer: 'extension',
    capabilityGroup: '拓展工具',
    capabilitySummary: '联网搜索最新公开信息；默认隐藏，需要先通过 get_extend_tools 激活。',
    audience: 'main_agent',
    access: 'read',
    enabled: true,
    defaultVisible: false,
    discoverable: true
  },
  {
    key: searchRecentChineseConversationTool.name,
    tool: searchRecentChineseConversationTool,
    category: 'conversation_memory',
    capabilityLayer: 'core',
    capabilityGroup: '基础工具',
    capabilitySummary: '在最近对话中做中文 BM25 回忆，用于消解“上次/刚才/那个”等指代。',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: continueActiveChildAgentTool.name,
    tool: continueActiveChildAgentTool,
    category: 'task_protocol',
    capabilityLayer: 'sub_agent',
    capabilityGroup: '子 agent 协作',
    capabilitySummary: '继续当前等待用户补参的子 agent 任务。',
    audience: 'main_agent',
    access: 'control',
    enabled: true
  },
  {
    key: delegateCharacterEditorTool.name,
    tool: delegateCharacterEditorTool,
    category: 'task_protocol',
    capabilityLayer: 'sub_agent',
    capabilityGroup: '子 agent 协作',
    capabilitySummary: '委派复杂人物描述编辑任务给人物编辑子 agent。',
    audience: 'main_agent',
    access: 'delegate',
    enabled: true
  },
  {
    key: getActiveTaskContextTool.name,
    tool: getActiveTaskContextTool,
    category: 'task_protocol',
    capabilityLayer: 'sub_agent',
    capabilityGroup: '子 agent 协作',
    capabilitySummary: '读取当前 active task / 子 agent 协作上下文。',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: getTaskDetailTool.name,
    tool: getTaskDetailTool,
    category: 'task_inspection',
    capabilityLayer: 'domain',
    capabilityGroup: '领域读取',
    capabilitySummary: '读取任务、执行、通知和 trace 详情。',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: getEntityDetailTool.name,
    tool: getEntityDetailTool,
    category: 'world_read',
    capabilityLayer: 'domain',
    capabilityGroup: '领域读取',
    capabilitySummary: '读取指定世界实体详情。',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: getWorldSchemaCatalogTool.name,
    tool: getWorldSchemaCatalogTool,
    category: 'world_read',
    capabilityLayer: 'domain',
    capabilityGroup: '领域读取',
    capabilitySummary: '查看世界观 schema 能力目录。',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: listCharactersTool.name,
    tool: listCharactersTool,
    category: 'world_read',
    capabilityLayer: 'domain',
    capabilityGroup: '领域读取',
    capabilitySummary: '按世界和条件列出人物实体。',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: listEntitiesTool.name,
    tool: listEntitiesTool,
    category: 'world_read',
    capabilityLayer: 'domain',
    capabilityGroup: '领域读取',
    capabilitySummary: '列出世界中的实体。',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: listWorldsTool.name,
    tool: listWorldsTool,
    category: 'world_read',
    capabilityLayer: 'domain',
    capabilityGroup: '领域读取',
    capabilitySummary: '列出当前本地世界观。',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: resolveWorldByNameTool.name,
    tool: resolveWorldByNameTool,
    category: 'world_read',
    capabilityLayer: 'domain',
    capabilityGroup: '领域读取',
    capabilitySummary: '根据世界名解析 worldId。',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  },
  {
    key: searchEntitiesTool.name,
    tool: searchEntitiesTool,
    category: 'world_read',
    capabilityLayer: 'domain',
    capabilityGroup: '领域读取',
    capabilitySummary: '按名称、关键词或类型搜索世界实体候选。',
    audience: 'main_agent',
    access: 'read',
    enabled: true
  }
]

configureExtensionToolCatalogProvider(() =>
  listDiscoverableExtensionEntries(mainAgentToolRegistry).map(toExtensionToolCatalogItem)
)

export const getMainAgentToolEntries = (): AgentToolRegistryEntry[] =>
  listEnabledEntries(mainAgentToolRegistry)

export const getVisibleMainAgentToolEntries = (
  state?: ToolVisibilityState
): AgentToolRegistryEntry[] => listVisibleEntries(mainAgentToolRegistry, state)

export const getVisibleMainAgentToolEntryMap = (
  state?: ToolVisibilityState
): Record<string, AgentToolRegistryEntry> =>
  Object.fromEntries(
    getVisibleMainAgentToolEntries(state).map((entry) => [entry.tool.name, entry])
  ) as Record<string, AgentToolRegistryEntry>

export const getMainAgentTools = (state?: ToolVisibilityState) =>
  toToolMap(getVisibleMainAgentToolEntries(state))
