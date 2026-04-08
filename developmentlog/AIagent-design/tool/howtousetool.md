# 工具系统说明

## 文档定位

这份文档只描述当前工具系统的使用方式与开发规范。

它不再解释历史问题，也不复盘旧结构；它只回答：

1. 当前工具系统分成哪些层
2. 新工具应该怎么定义
3. 工具如何进入统一注册器
4. 主 agent 和子 agent 应该如何消费工具

如果要看统一注册器本身的架构，请配合阅读：

- [unified-tool-registry-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/tool/unified-tool-registry-design.md)

## 当前工具系统分层

当前工具系统分成四层：

1. 原子工具定义层
2. 统一注册层
3. agent 视角 facade
4. tool runner

一句话：

`工具本身定义能力`
`注册器定义谁能加载`
`facade 提供 agent 视角入口`
`runner 负责实际执行`

## 1. 原子工具定义层

放在：

- `src/main/services/aiservice/ai-utils/tools/*`

这一层只负责定义单个工具本身。

例如：

- `tools/world/*`
- `tools/task/*`
- `tools/character/*`
- `tools/utility/*`

这里不处理：

- 主 agent 是否可见
- 哪个子 agent 可见
- 当前属于哪个 toolkit

这些都属于注册层职责。

## 2. 统一注册层

当前唯一注册真源是：

- [unifiedToolRegistry.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/ai-utils/toolkits/unifiedToolRegistry.ts)

工具进入系统后，必须在这里声明：

- `category`
- `audience`
- `access`
- `enabled`
- `scopes`

如果一个工具没有进入统一注册器，就不应该被任何 agent 当成正式可用工具。

## 3. agent 视角 facade

当前保留两层 facade：

- [mainAgentToolkit.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/ai-utils/toolkits/mainAgentToolkit.ts)
- [characterEditorToolkit.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/ai-utils/toolkits/characterEditorToolkit.ts)

它们的职责是：

- 提供 agent 视角的命名入口
- 对统一 resolver 做薄封装

它们不应该：

- 再维护一份独立工具列表
- 再声明工具可见性
- 成为第二套注册真源

## 4. tool runner

tool runner 的职责是：

`真正执行模型选中的工具`

当前主 agent 的 runner 是：

- `bindToolsToModel(...)`
- `toolNode`

当前 `character_editor` 的 runner 是：

- 自己的 tool loop

所以当前结构是：

- 注册层统一
- 执行层分开

## 工具定义规范

### 1. 必须使用 `defineAgentTool`

所有正式工具都应基于：

- [agentTool.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/ai-utils/core/agentTool.ts)

不要直接散落定义裸 `tool(async () => ...)` 作为正式能力入口。

### 2. 工具命名规范

建议采用：

- `list_xxx`
- `get_xxx`
- `create_xxx`
- `update_xxx`
- `delete_xxx`
- `delegate_xxx`

要求：

- 动词清晰
- 目标对象明确
- 不使用模糊名称

### 3. 输入必须有明确 schema

即便无参数工具，也应显式使用：

```ts
z.object({})
```

不要允许“随便传什么都行”的工具存在。

### 4. 输出必须有明确 schema

所有工具输出都必须经过输出 schema 校验。

这样做的作用是：

- 避免静默破坏
- 保证模型看到的结果稳定
- 保证后续 receipt / envelope 语义可靠

### 5. metadata 必须完整

每个工具都应明确：

- `whenToUse`
- `whenNotToUse`
- `inputSummary`
- `outputSummary`
- `riskLevel`
- `readOnly`
- `idempotent`

如有必要，再补：

- `usageContract`
- `examples`
- `completionSemantics`

## 工具结果规范

当前工具执行结果统一为 envelope 结构。

成功时至少包含：

- `ok`
- `data`
- `message`
- `nextSuggestions`
- `meta`

失败时至少包含：

- `ok=false`
- `error`
- `message`
- `nextSuggestions`
- `meta`

如果工具属于明确写入类工具，且写入已经真正提交，应提供：

- `receipt`

这样子 agent 才能根据 receipt 判断：

- 本轮写入是否已经 definitively committed

## 工具进入系统的标准路径

新增一个正式工具时，推荐按下面顺序接入：

1. 在 `tools/*` 下定义原子工具
2. 使用 `defineAgentTool(...)` 包装
3. 补齐 metadata、输入输出 schema、必要的 receipt
4. 在 `unifiedToolRegistry.ts` 中声明可见性
5. 根据 scope 由主 agent 或子 agent facade 自动获得该工具
6. 如有必要，更新 prompt / 设计文档

## 主 agent 与子 agent 的使用方式

当前主 agent 应通过：

- `getToolsForMainAgent()`
- `getToolEntriesForMainAgent()`

来获取工具与工具说明。

当前子 agent 应通过：

- `getToolsForExecutor(executorKind)`
- `getToolEntriesForExecutor(executorKind)`

来获取工具与工具说明。

不应该绕开 resolver 直接在业务代码里手写工具列表。

## 对称性约束

当前工具层有一个明确约束：

`主 agent 与子 agent 在 toolkit facade 这一层必须保持对称`

也就是说：

- 主 agent 有 facade，子 agent 也有 facade
- 如果未来决定删除 facade，则主子 agent 一起删
- 不允许一边保留 kit，一边完全直连 resolver

这样做的目的不是增加层次，而是：

- 保持主子 agent 的开发逻辑一致
- 保持文件排布一致
- 降低开发时的切换成本

## toolUsagePrompt 的使用方式

当前：

- [toolUsagePrompt.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/ai-utils/core/toolUsagePrompt.ts)

已经直接消费：

- `UnifiedToolRegistryEntry[]`

因此工具提示生成时，优先传：

- `getToolEntriesForMainAgent()`
- `characterEditorToolRegistry`

而不是临时把工具 map 拼成另一套解释真源。

## 当前维护原则

后续维护工具层时，遵守以下原则：

1. 原子工具只放在 `tools/*`
2. 工具可见性只在 `unifiedToolRegistry.ts` 中声明
3. facade 只能做薄封装
4. 主子 agent facade 层保持对称
5. prompt 优先消费 registry entry
6. runner 可以不同，但工具来源必须统一

## 当前结论

当前工具系统已经是：

- 一套统一定义协议
- 一份统一注册真源
- 两个对称 facade
- 两条独立 runner 链

这就是当前项目的工具系统工作方式。
