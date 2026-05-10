# 工具系统使用说明

## 文档定位

这份文档描述当前工具系统的使用方式与开发规范。

它只回答当前实现真相：

1. 工具应该在哪里定义
2. 主 agent 和子 agent 如何加载工具
3. 工具如何对 AI 暴露能力层级
4. 拓展工具如何按需发现与激活
5. 工具结果如何进入 agent 循环上下文

统一注册结构的细节见：

- [unified-tool-registry-design.md](./unified-tool-registry-design.md)

## 当前工具系统分层

当前工具系统分成五层：

1. 原子工具定义层
2. agent 工具注册层
3. 可见性与按需激活层
4. tool runner
5. 工具上下文重装层

一句话：

`tools 定义能力`
`registry 定义能力层级和可见性`
`get_extend_tools 负责发现并激活默认隐藏的拓展工具`
`toolNode 负责真实执行工具`
`toolContextReloadNode 负责压缩工具结果并清理重复上下文`

## 1. 原子工具定义层

原子工具放在：

- `src/main/services/aiservice/ai-utils/tools/*`

这一层只负责定义单个工具本身。

示例目录：

- `tools/utility/*`
- `tools/conversation/*`
- `tools/network/*`
- `tools/world/*`
- `tools/task/*`
- `tools/character/*`

正式工具必须使用：

- `src/main/services/aiservice/ai-utils/core/agentTool.ts`

也就是通过 `defineAgentTool(...)` 定义。

工具定义必须包含：

- `name`
- `description`
- `inputSchema`
- `outputSchema`
- `metadata`
- `execute`

不要把裸 LangChain `tool(...)` 作为正式能力入口散落在业务代码里。

## 2. 工具注册层

当前没有继续使用旧的 `unifiedToolRegistry.ts / scopes / facade` 结构。

当前主 agent 的注册真源是：

- `src/main/services/aiservice/ai-utils/toolkits/mainAgentToolRegistry.ts`

当前子 agent 的注册真源是：

- `src/main/services/aiservice/ai-utils/toolkits/childAgentToolRegistry.ts`

注册项类型在：

- `src/main/services/aiservice/ai-utils/toolkits/toolRegistryTypes.ts`

每个工具注册项需要声明：

- `key`
- `tool`
- `category`
- `capabilityLayer`
- `capabilityGroup`
- `capabilitySummary`
- `audience`
- `access`
- `enabled`
- `defaultVisible`
- `discoverable`

其中 `capabilityLayer` 是 AI 感知工具系统结构的关键字段。

当前能力层级：

- `core`
  基础工具，默认可见，例如当前时间、中文历史消息回忆、拓展工具发现。
- `domain`
  领域工具，访问本地世界观、角色、任务等业务数据。
- `extension`
  拓展工具，默认不可见，需要先通过 `get_extend_tools` 发现并激活。
- `sub_agent`
  子 agent 协作工具，例如委派人物编辑或继续等待补参的子任务。

## 3. 主 agent 工具加载链

主 agent 当前通过 `mainAgentToolRegistry.ts` 暴露这些入口：

- `getMainAgentToolEntries()`
- `getVisibleMainAgentToolEntries(state)`
- `getVisibleMainAgentToolEntryMap(state)`
- `getMainAgentTools(state)`

它们被以下位置消费：

- `modelwithtool.ts`
  根据当前 state 绑定可见工具 schema。
- `contextnode.ts`
  根据当前可见工具生成工具使用 prompt。
- `toolnode.ts`
  根据当前可见工具执行模型发起的 tool call。

重点：

- 模型每轮不是固定看到全部工具。
- 默认隐藏的拓展工具不会直接出现在 bindTools 中。
- 只有 state 的 `enabledExtensionTools` 包含某个拓展工具名时，该工具才会进入下一轮模型可见集合。

## 4. 子 agent 工具加载链

子 agent 当前通过 `childAgentToolRegistry.ts` 暴露：

- `getChildAgentToolEntries(executorKind)`
- `getChildAgentTools(executorKind)`

当前已接入的主要子 agent 是：

- `character_editor`

对应工具包括：

- `get_character_detail`
- `upsert_character_description`

子 agent 工具同样使用 `AgentToolRegistryEntry`，所以 prompt 可以看到统一的：

- `category`
- `capabilityLayer`
- `capabilityGroup`
- `capabilitySummary`
- `audience`
- `access`

## 5. 拓展工具发现与激活

拓展工具默认不直接展示给 AI。

当 AI 需要外部能力、高成本能力或默认不可见能力时，先调用：

- `get_extend_tools`

该工具位于：

- `src/main/services/aiservice/ai-utils/tools/utility/getExtendTools.ts`

它做三件事：

1. 从 `extensionToolCatalog.ts` 获取可发现拓展工具目录
2. 根据 `purpose` 或 `toolNames` 返回匹配工具
3. 返回 `activatedToolNames`

`toolNode` 解析 `get_extend_tools` 的返回后，会把 `activatedToolNames` 写入 state：

- `enabledExtensionTools`

下一轮模型调用时：

- `modelwithtool.ts` 会重新根据 state 绑定工具
- 被激活的拓展工具才会进入真实 tool schema

这使拓展工具具备清晰的两步语义：

1. 发现并激活
2. 下一轮真实调用

## 6. 历史常用拓展工具

为了避免 AI 每次都完整查看拓展工具目录，当前加入了拓展工具使用频次统计。

统计表实体：

- `src/share/entity/database/ToolUsageStatsRecord.ts`

服务：

- `src/main/services/aiservice/ai-utils/toolkits/toolUsageStatsService.ts`

数据库表：

- `tool_usage_stats`

记录字段：

- `toolName`
- `capabilityLayer`
- `usageCount`
- `lastUsedAtIso`

统计规则：

- 只有真实执行 `capabilityLayer === 'extension'` 的工具时才计数。
- 调用 `get_extend_tools` 本身不算拓展工具使用。
- 统计失败不会阻断工具执行。

`get_extend_tools` 输出中包含：

- `frequentTools`

它返回历史调用次数最多的拓展工具前 3 个，并附带：

- 工具名
- 摘要
- 调用次数
- 最后使用时间

## 7. 工具结果 envelope

所有正式工具都应返回统一 envelope。

成功时包含：

- `ok=true`
- `data`
- `message`
- `nextSuggestions`
- `receipt`
- `meta`

失败时包含：

- `ok=false`
- `error`
- `message`
- `nextSuggestions`
- `meta`

`defineAgentTool(...)` 会负责：

- 输入 schema 校验
- 输出 schema 校验
- 成功 envelope 包装
- 失败 envelope 包装
- metadata 归一化

如果工具发生真实写入，且写入已经提交，应提供 `receipt`，方便 agent 判断本轮动作已经完成。

## 8. 工具结果上下文保留

工具 metadata 中的关键字段：

- `contextRetention`

当前取值：

- `evidence`
  工具结果属于信息补充证据，例如中文历史消息回忆、网页搜索。结果会进入证据区，在本次 agent 循环内持续保留。
- `ephemeral`
  工具结果只需要让下一轮模型感知，例如写入、编辑、激活工具目录、错误结果。
- `none`
  工具结果不进入后续模型上下文。

主 agent 的工具结果不会一直原样堆进 LangGraph message 队列。

当前链路是：

1. `toolNode` 执行工具
2. `toolNode` 生成协议所需的紧凑 `ToolMessage`
3. `toolNode` 同时把完整结果摘要写入 `pendingToolContext`
4. `toolContextReloadNode` 汇总 `pendingToolContext`
5. `toolContextReloadNode` 将结果拆入：
   - `toolEvidenceContext`
   - `ephemeralToolContext`
6. `toolContextReloadNode` 用 `RemoveMessage` 立即清理本轮 tool-call/ToolMessage transcript
7. `modelnode.ts` 在下一轮模型调用前把工具上下文作为 system context 注入

这样可以避免工具调用循环中反复重复大段工具返回。

## 9. 工具日志

当前主 agent 工具执行日志在 `toolNode` 中统一记录。

调用前记录：

- 工具名
- toolCallId
- 输入参数

返回后记录：

- 工具名
- toolCallId
- 输入参数
- envelope 状态
- message
- error
- receipt
- nextSuggestions
- meta
- data

因此，只要工具经过主 agent 的 `toolNode` 执行，工具节点 log 就能看到输入和返回。

## 新增工具标准路径

新增一个正式主 agent 工具时：

1. 在 `tools/*` 下定义原子工具
2. 使用 `defineAgentTool(...)` 包装
3. 补齐输入输出 schema
4. 补齐 metadata，尤其是 `contextRetention`
5. 在 `mainAgentToolRegistry.ts` 注册
6. 判断它属于 `core / domain / extension / sub_agent`
7. 如果是拓展工具，设置：
   - `capabilityLayer: 'extension'`
   - `defaultVisible: false`
   - `discoverable: true`
8. 跑 `npm run typecheck:node`
9. 如有行为变化，同步更新本文档

新增子 agent 工具时：

1. 在 `tools/*` 下定义原子工具
2. 使用 `defineAgentTool(...)` 包装
3. 在 `childAgentToolRegistry.ts` 对应 executor 下注册
4. 确认子 agent 执行链会消费该 registry
5. 跑类型检查

## 当前维护原则

后续维护工具层时，遵守以下原则：

1. 原子工具只放在 `tools/*`
2. 主 agent 工具只从 `mainAgentToolRegistry.ts` 获取
3. 子 agent 工具只从 `childAgentToolRegistry.ts` 获取
4. prompt 优先消费 registry entry，而不是裸 tool map
5. 拓展工具默认隐藏，必须通过 `get_extend_tools` 激活
6. 工具返回进入上下文前必须被压缩和分类
7. 大结果不要长期堆在 LangGraph message 队列里
8. 写入类工具需要明确 receipt

## 当前结论

当前工具系统已经形成：

- 一套统一工具定义协议
- 主 agent / 子 agent 分开的注册真源
- 清晰的能力层级
- 默认隐藏的拓展工具发现与激活机制
- 历史常用拓展工具 top3 统计
- 工具结果上下文重装机制

这就是当前项目的工具系统使用方式。
