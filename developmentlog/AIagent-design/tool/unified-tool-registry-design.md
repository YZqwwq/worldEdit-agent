# 统一工具注册器

## 文档定位

这份文档只描述当前已经落地的统一工具注册架构。

它回答四个问题：

1. 当前工具注册真源在哪里
2. 主 agent 和子 agent 如何从同一真源加载不同工具
3. toolkit facade 为什么保留，以及它的约束是什么
4. tool runner 的职责是什么

## 当前架构结论

当前工具层已经收敛为四层：

1. 原子工具定义层
2. 统一工具注册真源
3. agent 视角 facade
4. 各自独立的 tool runner

一句话：

`tools 定义能力`
`unifiedToolRegistry 定义可见性`
`toolkit facade 提供 agent 视角入口`
`runner 负责实际执行`

## 当前目录与职责

### 1. 原子工具定义层

放在：

- `src/main/services/aiservice/ai-utils/tools/*`

这一层只负责定义单个工具，不负责声明哪个 agent 可以使用它。

工具定义统一基于：

- [agentTool.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/ai-utils/core/agentTool.ts)

这里统一了：

- metadata
- 输入/输出 schema
- riskLevel
- readOnly / idempotent / completionSemantics
- 结果 envelope
- receipt

### 2. 统一工具注册真源

当前唯一的注册真源是：

- [unifiedToolRegistry.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/ai-utils/toolkits/unifiedToolRegistry.ts)

它负责声明：

- 这是什么工具
- 工具属于什么 `category`
- 工具面向 `main_agent / child_agent / shared`
- 工具的 `access`
- 是否启用
- 哪些 scope 可以加载它

当前 entry 结构是：

```ts
type UnifiedToolRegistryEntry = {
  key: string
  tool: AgentTool
  category: string
  audience: ToolAudience
  access: ToolAccess
  enabled: boolean
  scopes: ToolScope[]
}
```

其中真正决定“谁能加载它”的字段是：

- `scopes`

## 当前 resolver

统一注册器通过 resolver 向不同 agent 暴露各自工具集：

- `getToolEntriesForMainAgent()`
- `getToolsForMainAgent()`
- `getToolEntriesForExecutor(executorKind)`
- `getToolsForExecutor(executorKind)`

这意味着：

- 主 agent 和子 agent 共用同一份注册真源
- 但通过不同 resolver 得到不同工具集

## 当前 facade

当前保留两层 facade：

- [mainAgentToolkit.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/ai-utils/toolkits/mainAgentToolkit.ts)
- [characterEditorToolkit.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/ai-utils/toolkits/characterEditorToolkit.ts)

它们的职责不是维护第二份注册表，而是：

- 作为 agent 视角的命名入口
- 对统一 resolver 做薄封装
- 保持主 agent 与子 agent 的开发路径一致

也就是说，当前 facade 的性质是：

`命名适配层`

而不是：

`第二套 registry`

## facade 约束

当前工具层有一个明确约束：

`主 agent 与子 agent 在 toolkit facade 这一层必须保持对称`

含义是：

- 如果主 agent 保留 toolkit facade，子 agent 也保留
- 如果未来删除主 agent facade，子 agent facade 也应一起删除
- 不允许一个 agent 直接走 resolver，另一个 agent 还保留独立 kit 层

这样做的原因是：

- 保持主子 agent 的开发逻辑一致
- 保持目录结构一致
- 降低在不同 agent 代码之间切换时的心智成本

## 当前主 agent 工具加载链

主 agent 当前通过统一 resolver 取工具：

- 模型绑定：
  [modelwithtool.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/agentrsystem/modelwithtool/modelwithtool.ts)
- tool prompt：
  [contextnode.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/agentrsystem/node/contextnode/contextnode.ts)
- tool 执行：
  [toolnode.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/agentrsystem/node/toolnode/toolnode.ts)
- capability 判断：
  [subAgentCapabilityService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/subAgentCapabilityService.ts)

这些位置现在都直接依赖：

- `getToolsForMainAgent()`
- `getToolEntriesForMainAgent()`

当前已经不再保留单独的主 agent `tools` 聚合真源。

## 当前子 agent 工具加载链

当前已接入的子 agent 是：

- `character_editor`

它通过：

- [characterEditorToolkit.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/ai-utils/toolkits/characterEditorToolkit.ts)

从统一 resolver 获取：

- `characterEditorTools`
- `characterEditorToolRegistry`

在运行时主要用于：

- tool prompt 生成
- 模型 bind
- tool call 执行

对应执行文件：

- [characterEditorExecution.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/child-agent-system/characterEditorExecution.ts)

## toolUsagePrompt 的当前位置

当前工具提示层也已经和统一注册器对齐：

- [toolUsagePrompt.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/ai-utils/core/toolUsagePrompt.ts)

它现在直接消费：

- `UnifiedToolRegistryEntry[]`

而不是只消费裸 `Record<string, Tool>`。

这样做的结果是：

- 工具提示和工具可见性使用同一份真源
- prompt 可以直接使用 `category / access / audience`
- 模型拿到的工具说明更接近真实装配语义

## tool runner 是什么

当前要区分：

### 1. registry / resolver

回答：

`谁能看到哪些工具`

### 2. tool runner

回答：

`模型选了工具以后，怎么真正执行它`

当前主 agent 的 runner 是：

- `bindToolsToModel(...)`
- `toolNode`

当前 `character_editor` 的 runner 是：

- 自己的 tool loop

因此当前架构是：

- 注册层统一
- 执行层分开

这符合当前项目的职责边界，因为主 agent 和子 agent 的执行语义还不相同。

## 当前维护原则

后续维护这一层时，遵守以下原则：

1. 新工具先进入 `tools/*`
2. 工具可见性只在 `unifiedToolRegistry.ts` 声明
3. facade 只能做薄封装，不能重新维护独立工具列表
4. 主子 agent 的 facade 层保持对称
5. prompt 层优先消费 registry entry，而不是绕开 resolver
6. runner 可以分开，但工具来源必须统一

## 当前结论

当前工具层已经形成稳定结构：

- 一份统一注册真源
- 两个对称的 agent facade
- 一套统一 prompt 解释入口
- 两条独立的 runner 链

这就是当前的统一工具注册架构。
