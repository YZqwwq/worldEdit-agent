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
- 列出一个世界观下的文档目录。
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
  "worldId": "world-id"
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

不要把已经废弃的业务归属结构继续暴露给 Agent。例如文档只归属于世界观时，目录入口只接收 `worldId`，具体文档操作只接收 `documentId`；不得再要求 `ownerKind` 或 `entityId`。如果当前页面已经提供可靠 ID，任务入口应优先由上下文绑定，而不是要求模型重复抄写。

### 3.3 使用小而稳定的枚举

枚举项应表达用户可理解的模式，例如 `all`、`relevant`、`summary`。不要直接暴露数据库状态码或节点路由名称。

### 3.4 ID 与名称

- 已有可靠 ID 时使用 ID，避免再次搜索。
- 用户只提供名称时，由对象解析入口完成名称到 ID 的转换。
- 名称存在歧义时返回候选项，不要猜测。
- 普通最终回复不展示内部 ID。



### 3.5 默认值和可选项

默认值必须符合最常见、最低风险行为。可选字段缺失时的语义必须写入 `inputSummary`，不能依赖模型猜测。

## 4. 工具描述对象

每个工具通过 `defineAgentTool` 提供一个可扩展的 `metadata.description` 对象。它是
**给 Agent/模型看的能力说明**，不负责权限判断、执行控制或用户界面文案：

```ts
description: {
  purpose: '读取一个世界文档的正文。',
  whenToUse: ['需要确认文档的权威当前内容时'],
  whenNotToUse: ['只需要目录或标题时不要读取完整正文'],
  inputSummary: '提供稳定的 documentId。',
  outputSummary: '返回当前正文、revision 和最小定位信息。',
  usageContract: ['已有 documentId 时不要重复搜索。'],
  examples: ['{"documentId":"document-id"}']
}
```

字段边界：

- `purpose`：工具能做什么，一句话即可。
- `whenToUse` / `whenNotToUse`：调用条件和明确禁用场景。
- `inputSummary` / `outputSummary`：参数缺省语义和结果承诺。
- `usageContract`：调用顺序、安全边界、完成条件。
- `examples`：一至两个最短合法调用示例，必须是可直接调用的 JSON。
- 后续扩展字段必须有明确消费者；不能为了“以后可能需要”堆入描述对象。

说明用于解释一个良好接口，不能用于补救复杂接口。模型提示只消费本对象中与调用有关的
投影，不应读取 UI 阶段文本或执行器内部字段。

### 4.1 Agent 可见投影

注册器和 `defineAgentTool` 会保留完整元数据，供执行器、UI、Trace、执行账本和测试使用；
模型只需要知道工具能做什么、什么时候使用、需要提供哪些语义化输入，以及哪些工具特有
限制会直接影响调用成功。

工具绑定给模型的描述不得重复输出 schema、结果保留、执行等级、audience、access、
category、Trace 或副作用协议。`outputSummary`、`usageContract` 和 `examples` 可用于
开发文档与注册校验，但不自动进入模型描述；只有会改变调用决策的限制才写入
`description.modelConstraints`。工具描述应尽量控制在 150 字以内。

工具集目录只说明能力和激活方式，不展开工具集内全部个体工具。模型需要专门能力时，先
查询目录，再激活工具集；快捷工具集是目录提示，不等于其中每个工具都已挂载。

## 5. 工具显示对象

每个工具通过 `metadata.display` 声明用户侧投影。它与 Agent 描述、执行事实严格分开：

```ts
display: {
  visibility: 'hidden' | 'visible',
  stage?: {
    label: '读取文档',
    runningLabel: '正在读取文档',
    doneLabel: '文档已读取',
    errorLabel: '读取文档失败'
  }
}
```

规则：

1. `visibility: 'hidden'` 的工具仍正常执行、记录 Trace、进入执行账本和上下文保留链路，
   但不进入用户侧思考/工具进度条。典型例子是表达方案选择、内部路由和状态整理。
2. `visibility: 'visible'` 的工具必须提供自然语言 `stage`，不能把工具名、内部 ID、schema、
   参数或完整异常堆栈直接展示给用户。典型例子是网页搜索、人物查询和世界文档读取。
3. 是否显示不能由 `readOnly`、`access` 或 `contextRetention` 推导。只读的搜索工具可以显示，
   有内部写入的控制工具也可以隐藏。
4. `display` 只影响 UI 投影，不改变模型能否调用工具，也不改变副作用、回退、Trace 或
   receipt 语义。未来可在对象内增加 `mode`、`surfaces` 等字段，但不得把它们混入执行事实。

第一阶段只要求 `visibility`；需要显示阶段时再填写 `stage`。后续若出现“仅显示进度”、
“仅显示结果”等稳定需求，应扩展 `display` 的枚举，而不是恢复按工具名称猜测的过滤逻辑。

## 6. 返回契约

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

允许在同一 Turn 连续调用的写入工具，还应返回下一次调用所需的权威当前状态，例如最新 revision、仍然有效且唯一的定位锚点。不要只返回“成功”，也不要继续暴露写入前的版本。属于同一目标对象的新状态应替代旧状态；完整操作历史继续由执行账本和 receipt 保存。

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

## 7. 错误与重试

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

## 8. 用户可见反馈

每个可见工具在 `metadata.display.stage` 中配置：

- `label`
- `runningLabel`
- `doneLabel`
- `errorLabel`（需要时）

界面显示自然阶段，例如“正在读取人物文档”。不要显示工具名、内部 ID、schema、数据库字段或完整异常堆栈。

Agent 获得详细错误；用户只获得与任务有关的阶段和结果。最终回复不重复播报已经由界面显示的工具进度。

## 9. 执行等级与内部语义

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



## 10. Context 保留

- `evidence`：正文、搜索来源等后续回答必须引用的证据。
- `ephemeral`：激活结果、参数错误和短期控制信息。
- `none`：无需进入下一次模型决策的结果。

不要把大段原始数据和摘要同时保留。需要完整正文时保留正文；普通写入完成后优先保留 receipt，可连续编辑则额外保留最小 continuation 状态。

## 11. 注册与激活

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

## 12. 测试要求

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

## 13. 创建模板

```ts
export const exampleTool = defineAgentTool({
  name: 'read_example',
  description: {
    purpose: 'Read one example by its stable reference.',
    whenToUse: ['需要读取示例内容'],
    whenNotToUse: ['用户只是在讨论假设，不依赖本地数据'],
    inputSummary: '提供 worldId，可选 entityId。',
    outputSummary: '返回是否命中及正文。',
    usageContract: ['参数保持扁平；已有 entityId 时不要重复搜索。'],
    examples: ['{"worldId":"world-id","entityId":"entity-id"}']
  },
  inputSchema: z.object({
    worldId: z.string().trim().min(1),
    entityId: z.string().trim().min(1).optional()
  }),
  outputSchema: z.object({
    found: z.boolean(),
    content: z.string().nullable()
  }),
  metadata: {
    display: {
      visibility: 'visible',
      stage: {
        label: '读取示例',
        runningLabel: '正在读取示例',
        doneLabel: '示例已读取'
      }
    },
    executionLevel: 'safe',
    readOnly: true,
    idempotent: true,
    contextRetention: 'evidence',
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



## 14. 现存工具迁移要求

现存工具必须逐个补齐描述和显示对象，不允许继续依赖工具名、分类名或自然语言文案推断
用户可见性。迁移顺序：

1. 把原 `metadata.whenToUse`、`whenNotToUse`、`inputSummary`、`outputSummary`、
   `usageContract`、`examples` 移入 `metadata.description`。
2. 把原 `metadata.uiStage` 移入 `metadata.display.stage`。
3. 为每个工具显式填写 `metadata.display.visibility`：信息返回或用户可感知外部效果使用
   `visible`；表达策略、内部控制、路由和纯状态整理使用 `hidden`。
4. 删除调用方对 `tool.name`、`capabilityGroup`、`description` 文案的 UI 猜测；UI 只消费
   `agentMetadata.display`。
5. `description` 仍进入模型工具 schema；`display` 不进入模型提示，Trace 可完整记录两者。
6. 新工具若未声明 `description` 或 `display.visibility`，注册校验应失败，而不是静默采用默认值。

本次迁移不改变工具执行结果、上下文保留、Trace、receipt、工具副作用或回退语义，只改变
元数据的职责边界和用户侧投影来源。

## 15. 合并前检查清单

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
