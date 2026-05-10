# 工具注册与可见性设计

## 文档定位

这份文档描述当前已经落地的工具注册、可见性、工具发现和工具上下文设计。

注意：

当前实现已经不是旧版的 `unifiedToolRegistry.ts + scopes + toolkit facade` 方案。

当前实现采用：

- 主 agent 注册器
- 子 agent 注册器
- 统一注册项类型
- 按 state 控制工具可见性
- 拓展工具目录发现
- 工具结果上下文重装

## 当前架构结论

当前工具注册架构可以理解为：

`AgentTool 定义工具协议`
`AgentToolRegistryEntry 定义工具能力画像`
`mainAgentToolRegistry 定义主 agent 工具真源`
`childAgentToolRegistry 定义子 agent 工具真源`
`ToolVisibilityState 决定本轮模型能看到哪些工具`

注册层不直接执行工具。

执行工具的是：

- 主 agent 的 `toolNode`
- 子 agent 自己的 tool loop

## 核心文件

工具协议：

- `src/main/services/aiservice/ai-utils/core/agentTool.ts`

注册项类型与可见性函数：

- `src/main/services/aiservice/ai-utils/toolkits/toolRegistryTypes.ts`

主 agent 注册真源：

- `src/main/services/aiservice/ai-utils/toolkits/mainAgentToolRegistry.ts`

子 agent 注册真源：

- `src/main/services/aiservice/ai-utils/toolkits/childAgentToolRegistry.ts`

拓展工具目录：

- `src/main/services/aiservice/ai-utils/toolkits/extensionToolCatalog.ts`

拓展工具使用统计：

- `src/main/services/aiservice/ai-utils/toolkits/toolUsageStatsService.ts`

主 agent 工具执行：

- `src/main/services/aiservice/agentrsystem/node/toolnode/toolnode.ts`

工具上下文重装：

- `src/main/services/aiservice/agentrsystem/node/toolcontextreloadnode/toolContextReloadNode.ts`

工具 prompt：

- `src/main/services/aiservice/ai-utils/core/toolUsagePrompt.ts`

## 注册项结构

当前工具注册项类型是：

```ts
type AgentToolRegistryEntry = {
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
```

关键字段含义：

- `key`
  注册层稳定标识，通常与 `tool.name` 一致。
- `tool`
  `defineAgentTool(...)` 生成的正式工具对象。
- `category`
  工具技术分类，例如 `utility / network_read / world_read`。
- `capabilityLayer`
  AI 感知的能力层级。
- `capabilityGroup`
  prompt 中展示的能力分组名。
- `capabilitySummary`
  面向 AI 的能力摘要。
- `audience`
  工具面向主 agent、子 agent 或共享场景。
- `access`
  工具访问性质，例如 `read / write / delegate / control`。
- `enabled`
  是否启用。
- `defaultVisible`
  是否默认进入模型可见工具集。
- `discoverable`
  是否能通过 `get_extend_tools` 被发现。

## 能力层级

当前能力层级定义为：

```ts
type ToolCapabilityLayer =
  | 'core'
  | 'domain'
  | 'extension'
  | 'sub_agent'
```

### core

基础工具，默认可见。

典型工具：

- `get_time`
- `get_extend_tools`
- `search_recent_chinese_conversation`

用途：

- 获取当前时间
- 回忆近期中文对话
- 发现并激活拓展工具

### domain

领域工具，默认可见。

典型能力：

- 读取世界观
- 读取实体
- 读取任务
- 子 agent 内部读写人物字段

用途：

- 确认本地系统真实状态
- 避免模型凭空猜测数据库内容

### extension

拓展工具，默认不可见。

典型工具：

- `official_web_search`

用途：

- 联网搜索
- 未来插件
- 高成本能力
- 需要额外激活的能力

约束：

- 不能默认直接暴露给模型
- 需要 `get_extend_tools` 先发现并激活
- 下一轮模型调用才会看到真实 schema

### sub_agent

子 agent 协作工具。

典型工具：

- `delegate_character_editor`
- `continue_active_child_agent`
- `get_active_task_context`

用途：

- 创建后台子任务
- 继续等待补参的子任务
- 读取当前子任务状态

## 主 agent 可见性机制

主 agent 可见性由以下函数控制：

- `getVisibleMainAgentToolEntries(state)`
- `getMainAgentTools(state)`

底层逻辑在：

- `isToolVisible(entry, state)`
- `listVisibleEntries(entries, state)`

规则：

1. `enabled=false` 的工具不可见。
2. `defaultVisible !== false` 的工具默认可见。
3. `defaultVisible === false` 且 `capabilityLayer !== 'extension'` 的工具不可见。
4. `extension` 工具只有在 `state.enabledExtensionTools` 包含它时才可见。

这意味着工具可见性是每轮模型调用动态计算的。

## 拓展工具发现机制

`extensionToolCatalog.ts` 提供拓展工具目录桥接。

`mainAgentToolRegistry.ts` 会配置目录 provider：

```ts
configureExtensionToolCatalogProvider(() =>
  listDiscoverableExtensionEntries(mainAgentToolRegistry).map(toExtensionToolCatalogItem)
)
```

只有满足以下条件的工具会进入拓展目录：

- `enabled=true`
- `capabilityLayer === 'extension'`
- `discoverable !== false`

AI 默认只能看到 `get_extend_tools`，看不到真实拓展工具 schema。

当 AI 调用 `get_extend_tools`：

1. 工具返回匹配的拓展工具目录
2. 工具返回 `activatedToolNames`
3. `toolNode` 将这些名称写入 `enabledExtensionTools`
4. 下一轮 `getMainAgentTools(state)` 会把这些工具加入可见集合

这避免了把所有拓展工具长期塞进 prompt。

## 历史常用拓展工具机制

为了减少重复查看拓展工具目录，系统记录拓展工具使用频次。

实体：

```ts
@Entity('tool_usage_stats')
class ToolUsageStatsRecord {
  toolName: string
  capabilityLayer: string
  usageCount: number
  lastUsedAtIso: string
}
```

统计服务：

- `toolUsageStatsService.recordToolUse(...)`
- `toolUsageStatsService.listTopExtensionTools(3)`

计数入口：

- `toolNode`

计数条件：

- 工具真实执行
- 工具注册项存在
- `toolEntry.capabilityLayer === 'extension'`

`get_extend_tools` 输出：

- `frequentTools`

其中包含历史调用次数最多的拓展工具前 3 个。

这样 AI 在发现工具时可以优先看到常用拓展能力，不必每次从完整目录重新判断。

## toolUsagePrompt

工具 prompt 生成入口：

- `buildToolUsageSystemPrompt(toolRegistryEntries)`

它消费的是：

- `AgentToolRegistryEntry[]`

不是裸 tool map。

prompt 会根据 `capabilityLayer / capabilityGroup` 分组展示工具，并给 AI 明确说明：

- 哪些是基础工具
- 哪些是领域工具
- 哪些是拓展工具
- 哪些是子 agent 协作工具

重要规则：

- 拓展工具默认不可见。
- 需要外部或高成本能力时先调用 `get_extend_tools`。
- 没有合适工具时再说明能力边界。

## tool runner 边界

注册器只回答：

`谁能看到哪些工具`

runner 回答：

`模型选择工具后如何执行`

主 agent runner：

- `modelwithtool.ts`
  绑定当前可见工具。
- `toolNode.ts`
  执行 tool call。
- `toolContextReloadNode.ts`
  压缩工具结果并立即清理工具 transcript。

子 agent runner：

- 子 agent 自己的执行 loop。

当前仍然允许主 agent 和子 agent 有不同 runner，因为它们的执行语义不同。

## 工具结果上下文设计

旧方式的问题是：

- 每轮工具调用都会向 LangGraph message 队列追加 tool message
- 大工具结果会在后续循环中反复出现
- 搜索类工具尤其容易造成重复上下文膨胀

当前做法：

1. `toolNode` 仍然生成协议所需的紧凑 `ToolMessage`
2. `toolNode` 同时生成 `pendingToolContext`
3. `toolContextReloadNode` 根据 `contextRetention` 分流结果
4. 本轮 tool-call/ToolMessage transcript 被 `RemoveMessage` 立即清理
5. `modelnode.ts` 将整理后的工具上下文作为 system context 注入下一轮

上下文区域：

- `toolEvidenceContext`
  用于搜索、历史回忆等证据型信息。
- `ephemeralToolContext`
  用于写入、编辑、工具激活、错误等短暂信息。
- `pendingToolContext`
  用于 `toolNode -> toolContextReloadNode` 的中转。

保留策略：

- `evidence`
  进入证据区，保留最近若干条。
- `ephemeral`
  只让下一轮感知。
- `none`
  不进入后续模型上下文。

## 当前主 agent 循环中的工具链

当前主 agent 工具相关循环可以概括为：

1. `contextNode`
   注入人格、时间、工具说明。
2. `modelNode`
   绑定当前可见工具并调用模型。
3. `shouldContinue`
   判断是否存在 tool call。
4. `toolNode`
   执行工具、记录 log、生成紧凑 tool message、生成 pending tool context。
5. `toolContextReloadNode`
   整理工具上下文、清理本轮工具 transcript。
6. 回到 `modelNode`
   用整理后的工具上下文继续推理。

重点：

- 用户原文和人格上下文暂时仍可留在消息/上下文中。
- 工具返回不再无限追加到 message 队列。
- 搜索类结果进入证据区。
- 写入/编辑/激活类结果进入临时区。

## 当前维护原则

后续维护工具注册层时，遵守以下原则：

1. 不恢复旧的 `unifiedToolRegistry.ts / scopes / facade` 作为真源。
2. 主 agent 工具从 `mainAgentToolRegistry.ts` 维护。
3. 子 agent 工具从 `childAgentToolRegistry.ts` 维护。
4. 新工具必须补齐 `capabilityLayer / capabilityGroup / capabilitySummary`。
5. prompt 必须消费 registry entry，而不是裸 tool map。
6. 拓展工具默认隐藏，并通过 `get_extend_tools` 激活。
7. 拓展工具真实执行才计入常用统计。
8. 工具结果必须按 `contextRetention` 进入工具上下文重装链路。

## 当前结论

当前工具注册与可见性架构已经落地为：

- 主 agent / 子 agent 分开的注册真源
- 统一的注册项类型
- 面向 AI 的能力层级感知
- 动态工具可见性
- 拓展工具目录发现与激活
- 历史常用拓展工具 top3
- 工具结果上下文重装

这就是当前工具系统的真实架构。
