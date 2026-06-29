import type { AgentToolRegistryEntry, ToolActivationState, ToolsetRegistryEntry } from './toolRegistryTypes'
import {
  listDiscoverableToolsets,
  listEnabledEntries,
  listVisibleEntries,
  toToolMap
} from './toolRegistryTypes'
import {
  configureToolsetCatalogProvider,
  toToolsetCatalogItem
} from './toolsetCatalog'
import { toolUsageStatsService } from './toolUsageStatsService'
import { continueActiveChildAgentTool } from '../tools/task/continueActiveChildAgent'
import { delegateCharacterEditorTool } from '../tools/task/delegateCharacterEditor'
import { getActiveTaskContextTool } from '../tools/task/getActiveTaskContext'
import { getTaskDetailTool } from '../tools/task/getTaskDetail'
import { recallAgentMemoryTool } from '../tools/memory/recallAgentMemory'
import { officialWebSearchTool } from '../tools/network/officialWebSearch'
import { searchRecentChineseConversationTool } from '../tools/conversation/searchRecentChineseConversation'
import { createCharacterNarrativeReadingTaskTool } from '../tools/character/createCharacterNarrativeReadingTask'
import { getCharacterImpressionTool } from '../tools/character/getCharacterImpression'
import { inspectCharacterNarrativeCatalogTool } from '../tools/character/inspectCharacterNarrativeCatalog'
import { readCharacterNarrativeTaskBatchTool } from '../tools/character/readCharacterNarrativeTaskBatch'
import { upsertCharacterImpressionTool } from '../tools/character/upsertCharacterImpression'
import { activateToolsetTool } from '../tools/utility/activateToolset'
import { addTool } from '../tools/utility/add'
import { getTimeTool } from '../tools/utility/getTime'
import { queryToolCatalogTool } from '../tools/utility/queryToolCatalog'
import { getEntityDetailTool } from '../tools/world/getEntityDetail'
import { getWorldSchemaCatalogTool } from '../tools/world/getWorldSchemaCatalog'
import { listCharactersTool } from '../tools/world/listCharacters'
import { listEntitiesTool } from '../tools/world/listEntities'
import { listWorldsTool } from '../tools/world/listWorlds'
import { resolveWorldByNameTool } from '../tools/world/resolveWorldByName'
import { searchEntitiesTool } from '../tools/world/searchEntities'

export const mainAgentToolsets: ToolsetRegistryEntry[] = [
  {
    id: 'core_runtime',
    title: '核心运行工具',
    summary: '主 agent 每轮都可使用的低成本工具：查询工具底图、激活工具集、确认时间、主动回忆长期/阶段记忆和回溯短期中文对话。',
    tags: ['core', 'runtime', 'tool-discovery', 'memory', 'time'],
    activationHints: ['默认已挂载，无需激活。'],
    whenToUse: ['处理普通对话、确认当前时间、按需回忆历史、回溯最近上下文、发现并激活专门工具集。'],
    whenNotToUse: ['需要具体领域数据、联网搜索或写入能力时，应先查询并激活对应工具集。'],
    discoverable: false
  },
  {
    id: 'task_runtime',
    title: '任务运行工具',
    summary: '主 agent 与任务系统、子 agent 协作所需的基础控制工具。',
    tags: ['task', 'sub-agent', 'control'],
    activationHints: ['默认已挂载，用于任务注册、继续子 agent、读取 active task。'],
    whenToUse: ['用户请求复杂编辑任务、需要继续等待补参的子 agent、需要读取当前任务上下文。'],
    whenNotToUse: ['普通闲聊、无需任务系统介入的直接回答。'],
    discoverable: false
  },
  {
    id: 'utility_math',
    title: '简单计算工具集',
    summary: '执行明确、低风险的简单数学计算。',
    tags: ['utility', 'math', 'calculation'],
    activationHints: ['当用户要求精确计算且默认推理不适合心算时激活。'],
    whenToUse: ['需要执行简单加法或未来扩展的确定性计算。'],
    whenNotToUse: ['不涉及计算，或问题可以直接回答。'],
    quickAccessEligible: true,
    quickAccessScope: 'tool'
  },
  {
    id: 'world_read',
    title: '世界观读取工具集',
    summary: '读取本地世界观、人物与实体数据库，帮助主 agent 基于真实项目状态回答。',
    tags: ['world', 'character', 'entity', 'database', 'read'],
    activationHints: ['涉及世界观、人物、实体、worldId、schema 或本地项目状态时激活。'],
    whenToUse: [
      '用户询问当前有哪些世界观、人物或实体',
      '需要根据名字解析 worldId 或 entityId',
      '回答依赖本地数据库中的真实世界观内容'
    ],
    whenNotToUse: ['问题不涉及本地世界观数据库，或用户已经提供了完整内容。'],
    quickAccessEligible: true,
    quickAccessScope: 'tool'
  },
  {
    id: 'task_inspection',
    title: '任务检查工具集',
    summary: '读取任务、执行、通知和 trace 详情，用于排查任务运行状态。',
    tags: ['task', 'trace', 'inspection', 'debug'],
    activationHints: ['用户询问任务状态、任务详情或队列执行问题时激活。'],
    whenToUse: ['需要读取具体 taskId 的生命周期、执行记录、通知或 trace。'],
    whenNotToUse: ['只是要创建或继续任务，不需要检查历史详情。'],
    quickAccessEligible: true,
    quickAccessScope: 'tool'
  },
  {
    id: 'network_web_search',
    title: '联网搜索工具集',
    summary: '使用官方联网搜索读取最新公开信息。',
    tags: ['network', 'web', 'search', 'latest', 'public-info', '联网', '网络', '搜索', '外部', '网页', '实时', '最新', '公开信息'],
    activationHints: ['用户明确要求联网、网络搜索、外部搜索、网页搜索、最新信息，或答案依赖实时公开资料时激活。'],
    whenToUse: [
      '新闻、天气、价格、近期发布、网页资料等时效性问题',
      '需要最新公开来源支撑回答',
      '需要搜索外部网络信息、查询公开网页资料或验证近期传闻'
    ],
    whenNotToUse: ['本地数据库问题、稳定常识、闲聊、创作共想或用户已提供足够资料。'],
    quickAccessEligible: true,
    quickAccessScope: 'toolset'
  },
  {
    id: 'character_narrative_reader',
    title: '人物文本阅读工具集',
    summary: '查看人物树状文本目录，创建带目的的阅读任务，并按任务顺序分批读取正文。',
    tags: ['character', 'narrative', 'reading', 'catalog', 'reader', '人物', '文本阅读', '叙事文本', '目录', '阅读任务'],
    activationHints: ['用户要求阅读某个人物的文本、按文件/文件树选择性阅读、全量阅读人物文本、基于文本分析人物时激活。'],
    whenToUse: [
      '需要查看人物文本目录并决定读哪些文件',
      '需要全量阅读或选择性阅读人物树状文本',
      '需要按阅读目的顺序分批读取人物正文'
    ],
    whenNotToUse: [
      '只需要读取人物基础资料、人口学字段或世界实体详情',
      '用户只是要求保存已经形成的人物印象，而不需要再读取文本',
      '目标不是本地 character entity'
    ],
    quickAccessEligible: true,
    quickAccessScope: 'toolset'
  },
  {
    id: 'character_impression',
    title: '人物印象工具集',
    summary: '读取或保存主 agent 对人物形成的结构化印象。',
    tags: ['character', 'impression', 'persona', 'profile', '人物', '人物印象', '人物画像'],
    activationHints: ['用户要求查看、建立或保存主 agent 对人物的主观看法/人物画像时激活。'],
    whenToUse: [
      '需要读取已保存的人物印象',
      '已经读完必要人物文本，需要保存新的结构化人物印象',
      '需要更新主 agent 对某个人物的主观看法'
    ],
    whenNotToUse: [
      '还没有读取必要文本，应该先激活人物文本阅读工具集',
      '只需要读取人物基础资料、人口学字段或世界实体详情',
      '目标不是本地 character entity'
    ],
    quickAccessEligible: true,
    quickAccessScope: 'toolset'
  }
]

export const mainAgentToolRegistry: AgentToolRegistryEntry[] = [
  {
    key: queryToolCatalogTool.name,
    tool: queryToolCatalogTool,
    toolsetId: 'core_runtime',
    category: 'tool_discovery',
    capabilityLayer: 'core',
    capabilityGroup: '核心运行',
    capabilitySummary: '查询轻量工具底图，按需发现可激活工具集。',
    audience: 'main_agent',
    access: 'read',
    activationMode: 'always',
    enabled: true
  },
  {
    key: activateToolsetTool.name,
    tool: activateToolsetTool,
    toolsetId: 'core_runtime',
    category: 'tool_activation',
    capabilityLayer: 'core',
    capabilityGroup: '核心运行',
    capabilitySummary: '激活一个或多个工具集，使具体工具在下一轮模型调用中可见。',
    audience: 'main_agent',
    access: 'control',
    activationMode: 'always',
    enabled: true
  },
  {
    key: getTimeTool.name,
    tool: getTimeTool,
    toolsetId: 'core_runtime',
    category: 'utility',
    capabilityLayer: 'core',
    capabilityGroup: '核心运行',
    capabilitySummary: '查看当前本地时间；通常 context 已提供时间，只有需要重新确认当前时刻时使用。',
    audience: 'main_agent',
    access: 'read',
    activationMode: 'always',
    enabled: true
  },
  {
    key: recallAgentMemoryTool.name,
    tool: recallAgentMemoryTool,
    toolsetId: 'core_runtime',
    category: 'agent_memory',
    capabilityLayer: 'core',
    capabilityGroup: '核心运行',
    capabilitySummary: '按需回忆静默长期记忆和最近阶段归档；长期记忆默认不直接注入上下文，需要时主动调用。',
    audience: 'main_agent',
    access: 'read',
    activationMode: 'always',
    enabled: true,
    turnCallLimit: 1
  },
  {
    key: searchRecentChineseConversationTool.name,
    tool: searchRecentChineseConversationTool,
    toolsetId: 'core_runtime',
    category: 'conversation_memory',
    capabilityLayer: 'core',
    capabilityGroup: '核心运行',
    capabilitySummary: '在最近对话中做中文 BM25 回忆，用于消解“上次/刚才/那个”等指代。',
    audience: 'main_agent',
    access: 'read',
    activationMode: 'always',
    enabled: true
  },
  {
    key: continueActiveChildAgentTool.name,
    tool: continueActiveChildAgentTool,
    toolsetId: 'task_runtime',
    category: 'task_protocol',
    capabilityLayer: 'sub_agent',
    capabilityGroup: '任务运行',
    capabilitySummary: '继续当前等待用户补参的子 agent 任务。',
    audience: 'main_agent',
    access: 'control',
    activationMode: 'always',
    enabled: true
  },
  {
    key: delegateCharacterEditorTool.name,
    tool: delegateCharacterEditorTool,
    toolsetId: 'task_runtime',
    category: 'task_protocol',
    capabilityLayer: 'sub_agent',
    capabilityGroup: '任务运行',
    capabilitySummary: '委派复杂人物描述编辑任务给人物编辑子 agent。',
    audience: 'main_agent',
    access: 'delegate',
    activationMode: 'always',
    enabled: true
  },
  {
    key: getActiveTaskContextTool.name,
    tool: getActiveTaskContextTool,
    toolsetId: 'task_runtime',
    category: 'task_protocol',
    capabilityLayer: 'sub_agent',
    capabilityGroup: '任务运行',
    capabilitySummary: '读取当前 active task / 子 agent 协作上下文。',
    audience: 'main_agent',
    access: 'read',
    activationMode: 'always',
    enabled: true
  },
  {
    key: addTool.name,
    tool: addTool,
    toolsetId: 'utility_math',
    category: 'utility',
    capabilityLayer: 'core',
    capabilityGroup: '简单计算',
    capabilitySummary: '执行明确的简单加法计算。',
    audience: 'main_agent',
    access: 'read',
    activationMode: 'manual',
    enabled: true,
    quickAccessEligible: true
  },
  {
    key: getTaskDetailTool.name,
    tool: getTaskDetailTool,
    toolsetId: 'task_inspection',
    category: 'task_inspection',
    capabilityLayer: 'domain',
    capabilityGroup: '任务检查',
    capabilitySummary: '读取任务、执行、通知和 trace 详情。',
    audience: 'main_agent',
    access: 'read',
    activationMode: 'manual',
    enabled: true,
    quickAccessEligible: true
  },
  {
    key: getEntityDetailTool.name,
    tool: getEntityDetailTool,
    toolsetId: 'world_read',
    category: 'world_read',
    capabilityLayer: 'domain',
    capabilityGroup: '世界观读取',
    capabilitySummary: '读取指定世界实体详情。',
    audience: 'main_agent',
    access: 'read',
    activationMode: 'manual',
    enabled: true,
    quickAccessEligible: true
  },
  {
    key: getWorldSchemaCatalogTool.name,
    tool: getWorldSchemaCatalogTool,
    toolsetId: 'world_read',
    category: 'world_read',
    capabilityLayer: 'domain',
    capabilityGroup: '世界观读取',
    capabilitySummary: '查看世界观 schema 能力目录。',
    audience: 'main_agent',
    access: 'read',
    activationMode: 'manual',
    enabled: true,
    quickAccessEligible: true
  },
  {
    key: listCharactersTool.name,
    tool: listCharactersTool,
    toolsetId: 'world_read',
    category: 'world_read',
    capabilityLayer: 'domain',
    capabilityGroup: '世界观读取',
    capabilitySummary: '按世界和条件列出人物实体。',
    audience: 'main_agent',
    access: 'read',
    activationMode: 'manual',
    enabled: true,
    quickAccessEligible: true
  },
  {
    key: listEntitiesTool.name,
    tool: listEntitiesTool,
    toolsetId: 'world_read',
    category: 'world_read',
    capabilityLayer: 'domain',
    capabilityGroup: '世界观读取',
    capabilitySummary: '列出世界中的实体。',
    audience: 'main_agent',
    access: 'read',
    activationMode: 'manual',
    enabled: true,
    quickAccessEligible: true
  },
  {
    key: listWorldsTool.name,
    tool: listWorldsTool,
    toolsetId: 'world_read',
    category: 'world_read',
    capabilityLayer: 'domain',
    capabilityGroup: '世界观读取',
    capabilitySummary: '列出当前本地世界观。',
    audience: 'main_agent',
    access: 'read',
    activationMode: 'manual',
    enabled: true,
    quickAccessEligible: true
  },
  {
    key: resolveWorldByNameTool.name,
    tool: resolveWorldByNameTool,
    toolsetId: 'world_read',
    category: 'world_read',
    capabilityLayer: 'domain',
    capabilityGroup: '世界观读取',
    capabilitySummary: '根据世界名解析 worldId。',
    audience: 'main_agent',
    access: 'read',
    activationMode: 'manual',
    enabled: true,
    quickAccessEligible: true
  },
  {
    key: searchEntitiesTool.name,
    tool: searchEntitiesTool,
    toolsetId: 'world_read',
    category: 'world_read',
    capabilityLayer: 'domain',
    capabilityGroup: '世界观读取',
    capabilitySummary: '按名称、关键词或类型搜索世界实体候选。',
    audience: 'main_agent',
    access: 'read',
    activationMode: 'manual',
    enabled: true,
    quickAccessEligible: true
  },
  {
    key: officialWebSearchTool.name,
    tool: officialWebSearchTool,
    toolsetId: 'network_web_search',
    category: 'network_read',
    capabilityLayer: 'network',
    capabilityGroup: '联网搜索',
    capabilitySummary: '联网搜索最新公开信息；默认不挂载，需要先激活 network_web_search 工具集。',
    audience: 'main_agent',
    access: 'read',
    activationMode: 'manual',
    enabled: true,
    quickAccessEligible: true,
    quickAccessScope: 'toolset',
    turnCallLimit: 1
  },
  {
    key: inspectCharacterNarrativeCatalogTool.name,
    tool: inspectCharacterNarrativeCatalogTool,
    toolsetId: 'character_narrative_reader',
    category: 'character_narrative_reader',
    capabilityLayer: 'background_toolset',
    capabilityGroup: '人物文本阅读',
    capabilitySummary: '查看人物树状文本目录和可选择的 document/document_tree/full 阅读范围。',
    audience: 'main_agent',
    access: 'read',
    activationMode: 'manual',
    enabled: true,
    quickAccessEligible: true
  },
  {
    key: createCharacterNarrativeReadingTaskTool.name,
    tool: createCharacterNarrativeReadingTaskTool,
    toolsetId: 'character_narrative_reader',
    category: 'character_narrative_reader',
    capabilityLayer: 'background_toolset',
    capabilityGroup: '人物文本阅读',
    capabilitySummary: '把全量/选择性阅读意图编译成带 mission 和 unit 顺序的阅读任务。',
    audience: 'main_agent',
    access: 'read',
    activationMode: 'manual',
    enabled: true,
    quickAccessEligible: true
  },
  {
    key: readCharacterNarrativeTaskBatchTool.name,
    tool: readCharacterNarrativeTaskBatchTool,
    toolsetId: 'character_narrative_reader',
    category: 'character_narrative_reader',
    capabilityLayer: 'background_toolset',
    capabilityGroup: '人物文本阅读',
    capabilitySummary: '按 reading task 的 cursor 和 unit mission 顺序分批读取人物正文。',
    audience: 'main_agent',
    access: 'read',
    activationMode: 'manual',
    enabled: true,
    quickAccessEligible: true
  },
  {
    key: getCharacterImpressionTool.name,
    tool: getCharacterImpressionTool,
    toolsetId: 'character_impression',
    category: 'character_impression',
    capabilityLayer: 'background_toolset',
    capabilityGroup: '人物印象',
    capabilitySummary: '读取已保存的主 agent 人物印象。',
    audience: 'main_agent',
    access: 'read',
    activationMode: 'manual',
    enabled: true,
    quickAccessEligible: true
  },
  {
    key: upsertCharacterImpressionTool.name,
    tool: upsertCharacterImpressionTool,
    toolsetId: 'character_impression',
    category: 'character_impression',
    capabilityLayer: 'background_toolset',
    capabilityGroup: '人物印象',
    capabilitySummary: '写入或替换人物关联的结构化主 agent 印象。',
    audience: 'main_agent',
    access: 'write',
    activationMode: 'manual',
    enabled: true,
    quickAccessEligible: true
  }
]

const entriesByToolset = (toolsetId: string): AgentToolRegistryEntry[] =>
  mainAgentToolRegistry.filter((entry) => entry.enabled && entry.toolsetId === toolsetId)

configureToolsetCatalogProvider(() =>
  listDiscoverableToolsets(mainAgentToolsets).map((toolset) =>
    toToolsetCatalogItem(toolset, entriesByToolset(toolset.id))
  )
)

export const getMainAgentToolEntries = (): AgentToolRegistryEntry[] =>
  listEnabledEntries(mainAgentToolRegistry)

export const hasMainAgentTool = (toolName: string): boolean =>
  getMainAgentToolEntries().some(
    (entry) => entry.key === toolName || entry.tool.name === toolName
  )

export const getVisibleMainAgentToolEntries = (
  state?: ToolActivationState
): AgentToolRegistryEntry[] => listVisibleEntries(mainAgentToolRegistry, state)

export const getVisibleMainAgentToolEntryMap = (
  state?: ToolActivationState
): Record<string, AgentToolRegistryEntry> =>
  Object.fromEntries(
    getVisibleMainAgentToolEntries(state).map((entry) => [entry.tool.name, entry])
  ) as Record<string, AgentToolRegistryEntry>

export const getMainAgentTools = (state?: ToolActivationState) =>
  toToolMap(getVisibleMainAgentToolEntries(state))

const normalize = (value: string): string => value.trim().toLowerCase()

const toolsetById = new Map(mainAgentToolsets.map((toolset) => [normalize(toolset.id), toolset]))

const entryByToolName = new Map(
  mainAgentToolRegistry.map((entry) => [normalize(entry.tool.name), entry])
)

const uniquePush = (items: string[], value: string): void => {
  const normalized = normalize(value)
  if (!normalized) return
  if (items.some((item) => normalize(item) === normalized)) return
  items.push(value)
}

export const resolveQuickAccessState = async (
  limit = 3
): Promise<Pick<ToolActivationState, 'quickToolsets' | 'quickTools'>> => {
  const stats = await toolUsageStatsService.listTopActivatedTools(limit * 4)
  const quickToolsets: string[] = []
  const quickTools: string[] = []
  let slotCount = 0

  for (const item of stats) {
    if (slotCount >= limit) break

    const entry = entryByToolName.get(normalize(item.toolName))
    if (!entry || !entry.enabled || entry.activationMode === 'always') continue
    if (entry.quickAccessEligible === false) continue

    const toolset = toolsetById.get(normalize(entry.toolsetId))
    if (toolset?.quickAccessEligible === false) continue

    const scope = entry.quickAccessScope ?? toolset?.quickAccessScope ?? 'tool'
    if (scope === 'toolset') {
      if (quickToolsets.some((toolsetId) => normalize(toolsetId) === normalize(entry.toolsetId))) {
        continue
      }
      uniquePush(quickToolsets, entry.toolsetId)
    } else {
      if (quickTools.some((toolName) => normalize(toolName) === normalize(entry.tool.name))) {
        continue
      }
      uniquePush(quickTools, entry.tool.name)
    }
    slotCount += 1
  }

  return {
    quickToolsets,
    quickTools
  }
}

export const resolveMainAgentToolActivationState = async (
  state?: ToolActivationState
): Promise<ToolActivationState> => {
  const quick = await resolveQuickAccessState(3)
  return {
    ...state,
    quickToolsets: quick.quickToolsets,
    quickTools: quick.quickTools
  }
}
