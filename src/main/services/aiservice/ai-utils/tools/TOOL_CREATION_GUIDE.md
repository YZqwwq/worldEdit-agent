# Agent 工具创建与维护规范

本手册约束 `ai-utils/tools` 下供 Agent 使用的工具。目标是把 Agent 当作工具用户，为它提供清晰、低负担、可修正、可追踪的能力入口。

## 1. 核心原则

1. 工具面向用户意图，不面向数据库结构。
2. 高频入口优先使用扁平、语义化参数。
3. 已存在于页面上下文、聚焦插槽或任务上下文的信息，应由运行时提供或允许省略。
4. 一个工具只承诺一个清晰结果；多步骤流程由工具集内部协议编排。
5. 成功、部分成功和失败都必须产生可供下一次模型决策消费的反馈。
6. 相同参数发生确定性失败后，不允许原样重试。
7. 工具结果面向 Agent，界面阶段提示面向用户，两者不得混为一段文本。

## 2. 能力分层

### 2.1 任务入口工具

主 Agent 优先看到的工具。名称和参数应直接对应用户意图，例如：

- `read_entity_documents`
- `compare_world_documents`
- `update_world_document`

任务入口可以在内部完成对象解析、目录读取和正文读取，不应要求主 Agent 手工复现固定流水线。

### 2.2 原子工具

承担单一、确定的基础操作，例如：

- 按 ID 读取一篇文档。
- 列出一个 owner 的文档目录。
- 按 revision 更新正文。

原子工具适合工具集内部编排，或在主 Agent 明确需要精细控制时按需挂载。

### 2.3 工具集

工具集不是工具名称列表，而是能力包。它至少应说明：

- 能解决什么任务。
- 入口工具是什么。
- 内部推荐调用顺序。
- 哪些结果表示任务已经完成。
- 哪些错误允许继续，哪些错误必须停止或修改参数。

不要把同一领域的全部工具永久挂给模型。按页面、焦点和任务激活必要入口。

## 3. 输入设计



### 3.1 使用扁平参数

推荐：

```json
{
  "worldId": "world-id",
  "entityId": "entity-id"
}
```

避免：

```json
{
  "owner": {
    "kind": "entity",
    "worldId": "world-id",
    "entityId": "entity-id"
  }
}
```

嵌套对象只用于确实不可拆分的领域数据，不应用来暴露内部类型判别结构。禁止要求 Agent 把对象再次序列化成 JSON 字符串。

### 3.2 删除可推导参数

如果 `entityId` 存在即可判断目标属于实体，就不要再要求 `ownerKind: "entity"`。如果当前页面已经提供 `worldId`，任务入口应优先由上下文绑定，而不是要求模型重复抄写。

### 3.3 使用小而稳定的枚举

枚举项应表达用户可理解的模式，例如 `all`、`relevant`、`summary`。不要直接暴露数据库状态码或节点路由名称。

### 3.4 ID 与名称

- 已有可靠 ID 时使用 ID，避免再次搜索。
- 用户只提供名称时，由对象解析入口完成名称到 ID 的转换。
- 名称存在歧义时返回候选项，不要猜测。
- 普通最终回复不展示内部 ID。



### 3.5 默认值和可选项

默认值必须符合最常见、最低风险行为。可选字段缺失时的语义必须写入 `inputSummary`，不能依赖模型猜测。

## 4. 工具说明

每个工具通过 `defineAgentTool` 提供以下信息：

- `description`：一句话说明能力。
- `whenToUse`：什么意图下调用。
- `whenNotToUse`：什么情况下不要调用。
- `inputSummary`：字段和缺省语义。
- `outputSummary`：能得到什么，不承诺什么。
- `usageContract`：调用顺序、安全边界和完成条件。
- `examples`：一至两个最短合法调用示例。

说明用于解释一个良好接口，不能用于补救复杂接口。示例必须是合法参数本身，不要只写自然语言流程。

## 5. 返回契约

工具必须返回统一 envelope：

```json
{
  "ok": true,
  "data": {},
  "modelResult": {},
  "error": null,
  "message": "",
  "nextSuggestions": [],
  "receipt": {},
  "meta": {}
}
```



### 5.1 `data`

供运行时、Trace 和后续程序消费的完整结构化数据。

### 5.2 `modelResult`

供主 Agent 当前决策使用的结果。读取工具可以保留必要正文；写入工具应返回简洁结果和 receipt，避免把大对象重复灌入上下文。

### 5.3 `receipt`

描述本轮已经完成的事实，至少包含：

- `kind`
- `operation`
- `subject`
- `completion`
- `summary`
- `retryable`
- 可用时提供 `evidenceRef`

receipt 应回答“做了什么、作用于谁、是否完成”，不能只写“工具成功”。

## 6. 错误与重试

业务失败通过 `AgentToolError` 返回，禁止只抛出无法分类的字符串：

```ts
throw new AgentToolError({
  code: 'NOT_FOUND',
  message: '目标文档不存在。',
  retryable: false,
  details: { documentId },
  nextSuggestions: ['重新查询文档目录。']
})
```

统一错误码包括：`INVALID_TOOL_INPUT`、`INVALID_TOOL_OUTPUT`、`NOT_FOUND`、
`REVISION_CONFLICT`、`PERMISSION_DENIED`、`CONFIRMATION_REQUIRED`、
`CONFIRMATION_EXPIRED`、`RATE_LIMITED`、`TIMEOUT`、
`TEMPORARY_UNAVAILABLE` 和 `INTERNAL_ERROR`。未知异常会被归类为不可自动重试的
`INTERNAL_ERROR`，不能依赖错误文本猜测恢复方式。

错误必须区分以下重试条件：

- `none`：确定性失败，不可重试。
- `change_arguments`：必须修改参数后重试。
- `transient`：网络超时等瞬态故障，可有限重试。
- `external_change`：等待用户确认、revision 更新或外部状态改变后重试。

参数错误反馈至少应包含：

```json
{
  "code": "INVALID_TOOL_INPUT",
  "field": "entityId",
  "message": "字段类型不符合要求",
  "retryCondition": "change_arguments",
  "guidance": "必须修改参数后重试"
}
```

单轮执行账本会记录标准化调用指纹。相同工具和相同参数发生确定性失败后，运行时必须阻止原样重复执行。

不得通过提高 LangGraph recursion limit 掩盖重复调用问题。循环上限只负责异常收尾，不负责业务决策。

## 7. 用户可见反馈

每个工具配置 `uiStage`：

- `label`
- `runningLabel`
- `doneLabel`
- `errorLabel`（需要时）

界面显示自然阶段，例如“正在读取人物文档”。不要显示工具名、内部 ID、schema、数据库字段或完整异常堆栈。

Agent 获得详细错误；用户只获得与任务有关的阶段和结果。最终回复不重复播报已经由界面显示的工具进度。

## 8. 执行等级与内部语义

每个工具必须在设计时只选择一个 `executionLevel`。这是 Agent 能看到的唯一执行判断：

- `safe`：只读、低成本或没有持久影响，可直接执行。
- `notice`：会修改可恢复数据，或可能产生较高费用；不阻塞执行，但必须提供清楚的 `uiStage`。
- `confirmation_required`：会造成不可恢复的数据或外部影响；每一组具体参数都必须先由系统请求确认，并在用户后续明确确认后执行。

等级由工具作者决定，Mood、Persona 和主模型都不能提升、降低或绕过。`confirmation_required`
工具必须设置 `turnCallLimit: 1`，一次确认只允许一次执行。
确认票据只保存在当前应用进程中，并绑定 session、后续用户事件与完全一致的调用参数；应用重启后必须重新请求确认，不恢复旧授权。

`readOnly`、`idempotent`、revision 和 effect recovery 是原子执行层的内部事实，不是第二套风险等级，
也不应作为多维判断表暴露给 Agent。

- 读取工具应声明 `readOnly: true` 和 `idempotent: true`。
- 写入工具应明确 revision、目标对象和完成语义。
- 删除、覆盖和不可逆操作必须使用 `confirmation_required`。
- 非幂等工具不能通过普通自动重试执行第二次。
- 工具内部不得静默猜测歧义目标。

### 8.1 完成语义

- `completionSemantics: definitive` 表示本次成功结果已经最终完成。
- `completionSemantics: eventual` 表示工具只负责受理或推进异步工作。
- eventual 工具应通过 `resolveCompletionState` 返回 `accepted`、`running`、
  `awaiting_input`、`completed` 或 `failed`。
- eventual 工具未声明解析器时默认是 `accepted`，绝不能默认成 `completed`。
- Agent 只有看到 `completion.state=completed` 才能声称最终工作完成。



## 9. Context 保留

- `evidence`：正文、搜索来源等后续回答必须引用的证据。
- `ephemeral`：激活结果、参数错误和短期控制信息。
- `none`：无需进入下一次模型决策的结果。

不要把大段原始数据和摘要同时保留。需要完整正文时保留正文；写入完成后优先保留 receipt。

## 10. 注册与激活

新增工具后必须：

1. 加入明确的工具集。
2. 设置 `capabilityLayer`、`access`、`activationMode`。
3. 判断它应当始终可见、按页面激活，还是通过工具底图按需挂载。
4. 为工具集填写能力摘要、入口和使用边界。
5. 避免多个同义工具同时暴露，防止模型随机选择。
6. 保证 registry `key` 与 `tool.name` 完全一致且全局唯一。
7. `access: read` 必须对应 `readOnly: true`，`access: write` 必须对应
   `readOnly: false`。
8. `toolsetId` 必须引用已声明工具集，`turnCallLimit` 必须是正整数。

主、子 Agent 注册表在模块加载时执行 `validateToolRegistry()`。任何重名、未知工具集、
audience 越界或元数据冲突都会阻止启动；`toToolMap()` 也禁止静默覆盖重名工具。

`activationMode: task_context` 必须声明 `taskContext`：

- `match: active_task`：只有存在符合 executor/status 条件的活跃任务时可见。
- `match: available_capability`：只有任务判断节点提供匹配的 capability 和工具名时可见。
- task-context 工具不能被 `activate_toolset`、activeTools 或 Quick Access 绕过。

`turnCallLimit` 表示一次用户回合内的实际执行次数上限，可以是任意正整数。每次真正进入
工具执行都计数，无论最终业务结果成功还是失败；达到上限后工具从下一次模型决策中移除，
残留调用会收到 `CALL_LIMIT_REACHED`，不会再次执行。

高频入口可以进入常用工具栏；内部原子工具不应仅因为属于同一工具集就全部常驻。

## 11. 测试要求

每个新工具至少覆盖：

1. 最短合法参数。
2. 典型合法参数。
3. 缺失必填字段。
4. 错误字段类型。
5. 业务对象不存在。
6. 成功 receipt。
7. 失败后的重试条件。
8. 同参数确定性失败不会被原样重复执行。

任务入口还应进行一次真实模型调用测试，确认当前主模型可以稳定生成合法参数。仅通过 TypeScript 类型检查不足以证明 Agent 会正确调用。

## 12. 创建模板

```ts
export const exampleTool = defineAgentTool({
  name: 'read_example',
  description: 'Read one example by its stable reference.',
  inputSchema: z.object({
    worldId: z.string().trim().min(1),
    entityId: z.string().trim().min(1).optional()
  }),
  outputSchema: z.object({
    found: z.boolean(),
    content: z.string().nullable()
  }),
  metadata: {
    whenToUse: ['需要读取示例内容'],
    whenNotToUse: ['用户只是在讨论假设，不依赖本地数据'],
    inputSummary: '提供 worldId，可选 entityId。',
    outputSummary: '返回是否命中及正文。',
    usageContract: ['参数保持扁平；已有 entityId 时不要重复搜索。'],
    examples: ['{"worldId":"world-id","entityId":"entity-id"}'],
    executionLevel: 'safe',
    readOnly: true,
    idempotent: true,
    contextRetention: 'evidence',
    uiStage: {
      label: '读取示例',
      runningLabel: '正在读取示例',
      doneLabel: '示例已读取'
    }
  },
  async execute(input) {
    return { found: false, content: null }
  },
  buildReceipt(data, input) {
    return {
      kind: 'example_read',
      operation: '读取示例',
      subject: { type: 'entity', id: input.entityId },
      completion: data.found ? 'complete' : 'partial',
      summary: data.found ? '已取得示例正文。' : '没有找到目标示例。',
      retryable: false
    }
  }
})
```



## 13. 合并前检查清单

- [ ] 工具名称表达动作和对象。
- [ ] 参数保持扁平，没有暴露可推导的内部结构。
- [ ] `inputSummary` 说明缺省语义。
- [ ] 示例是可直接调用的合法 JSON。
- [ ] 成功结果包含明确 receipt。
- [ ] 错误说明字段、原因和重试条件。
- [ ] 业务异常使用 `AgentToolError`，没有依赖错误字符串进行控制流判断。
- [ ] UI 阶段提示不暴露内部实现。
- [ ] 执行等级唯一且正确；内部幂等和 Context 保留设置正确。
- [ ] completionSemantics 与真实完成时机一致；eventual 工具提供阶段状态。
- [ ] 已加入合适工具集，没有无条件扩大常驻工具数量。
- [ ] task_context 工具声明了明确的任务匹配条件，不能被普通激活绕过。
- [ ] turnCallLimit 与单轮实际需要一致，并测试达到任意数值上限后的行为。
- [ ] registry key、tool name、toolset、audience 与 readOnly/access 通过启动校验。
- [ ] 契约测试、生命周期测试和类型检查通过。
