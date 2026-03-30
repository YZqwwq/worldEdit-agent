# AI Agent 架构说明

> 状态说明（2026-03-30）
>
> 本文件只描述当前项目已经落地并正在运行的 AI 系统架构，不记录未来规划、差距分析或任务列表。

## 系统定位

当前项目是一个：

`单主会话`
`主 agent 控制`
`可委派子 agent`
`支持后台长任务`

的 AI 助手系统。

系统中的控制权只有一个中心：

1. 用户只和主 agent 交互
2. 子 agent 不直接对用户说话
3. 主 agent 是唯一能创建、续跑、关闭子任务生命周期的控制器

---

## 整体主链

当前系统的有效主链如下：

`Renderer(Chat UI)`
`-> Preload / IPC`
`-> AIService`
`-> MainAgentEntryService`
`-> MainAgentDispatchService`
`-> 按 event 类型分流`
`   - user_message -> lifecycle control / chat runtime`
`   - task_notification -> task notification consumer`
`-> MainAgentEffectApplierService`
`-> message / task / trace / memory 持久化`

这条主链代表三件事：

1. 用户消息与子 agent 通知共享同一个主入口
2. 主 agent 一次只消费一条 event
3. 子 agent 回报不是直接聊天消息，而是先回到主 agent 的控制面

---

## 分层

### 1. 前端聊天层

负责：

- 展示用户消息与 AI 回复
- 接收流式输出
- 展示 task monitor / trace / execution inspection
- 展示子 agent 任务状态

### 2. Electron 接入层

负责：

- IPC 边界
- 暴露聊天、任务、memory、worldbuilding 等接口

### 3. 主 agent 入口与分发层

负责：

- 接收 `user_message`
- 接收 `task_notification`
- 统一排队
- 串行消费
- 将 event 分发给后续处理器

关键对象：

- `MainAgentEntryService`
- `MainAgentDispatchService`
- `processMainAgentEvent`

### 4. 生命周期控制层

负责：

- 判断用户消息是不是任务控制语义
- 处理取消任务、确认结束、补参续跑
- 为普通聊天路径准备 `taskLifecycle`

关键对象：

- `MainAgentLifecycleControlService`
- `taskLifecycleIntentResolver`

### 5. 主 agent 推理执行层

负责：

- 驱动主 LangGraph
- 构建上下文
- 调用模型
- 调用基础工具
- 输出流式回复

关键对象：

- `MainAgentChatRuntimeService`
- `agentReactSystem`
- `MainAgentEffectApplierService`

### 6. 任务与后台编排层

负责：

- task 状态管理
- execution 管理
- 子 agent execution 队列
- 子 agent dispatcher
- notification 写入与消费
- trace
- 启动恢复

关键对象：

- `taskService`
- `taskExecutionService`
- `subAgentExecutionQueueService`
- `subAgentDispatcherService`
- `taskNotificationService`
- `taskNotificationDispatchBridge`
- `taskTraceService`
- `taskRecoveryService`

### 7. 子 agent 执行层

负责：

- 执行某一类专业任务
- 调用工具
- 产出结构化结果
- 不直接面向用户

当前真实落地的子 agent：

- `character_editor`

---

## 主 agent 架构

### 主队列

主 agent 使用专属事件队列。

当前只接收两类 event：

- `user_message`
- `task_notification`

特点：

- 队列只服务主 agent
- 主 agent 是唯一消费者
- 队列按优先级和来源串行消费
- `user_message` 和 `task_notification` 使用统一调度入口，但处理路径不同

主队列实现：

- `MainAgentDispatchService`

### 主 agent 内部职责

主 agent 当前内部已经分成四类职责：

1. `事件消费`
   由 `MainAgentEntryService -> MainAgentDispatchService` 完成

2. `生命周期控制`
   由 `MainAgentLifecycleControlService` 完成

3. `推理执行`
   由 `MainAgentChatRuntimeService -> agentReactSystem` 完成

4. `子任务协调`
   由 `taskNotificationConsumerService`、`taskContinuationService`、任务层服务共同完成

### 主图

当前主 agent 的 LangGraph 只保留推理路径：

`personaNode -> contextNode -> llmCall -> toolNode / memoryNode`

也就是说，主图负责的是：

- persona policy
- context 构建
- 模型调用
- 工具调用
- memory 写入

主图不再承担子 agent notification 的处理。

### Prompt 架构

当前主 agent 的 prompt 已拆成三层：

1. `character`
   稳定身份层，定义“主 agent 是谁”，运行时文件位于 `userData/aiservice/prompt/character.md`

2. `mood`
   人格状态层，定义“主 agent 当前以什么行为状态与用户协作”，由内部静态 prompt 加上 `PersonaState / PersonaPolicy` 共同生成

3. `expression`
   输出契约层，定义“最终怎么说、哪些不能说”，属于内部静态 prompt，不对用户开放编辑

当前注入顺序是：

`character -> mood -> task/context/tool rules -> memory/history -> expression`

这意味着：

- 用户可调整的是身份画像，不是系统内部约束
- 情绪调控和输出规范属于主 agent 内部控制面
- 文档型 prompt 与运行时 prompt 已分离，开发说明放在 `developmentlog/prompt/...`，真正运行时 prompt 放在 `src/main/services/aiservice/prompt`

---

## 子 agent 架构

### 子 agent 的角色

子 agent 不是第二个和用户直接对话的 agent，而是：

`由主 agent 委派的专业执行器`

它只处理自己负责的专业任务，并以结构化结果回报主 agent。

### 当前子 agent：character_editor

`character_editor` 用于处理人物描述编辑任务。

它的职责是：

- 根据任务 payload 解析目标 world / character
- 调用人物相关工具
- 更新 `character_profile.description`
- 返回结构化执行结果

当前子图结构：

`loadExecutionInputNode`
`-> resolveWorldNode`
`-> resolveCharacterNode`
`-> applyEditNode`

在 `applyEditNode` 内部，会运行一个 tool/model loop：

`System + Human messages`
`-> boundModel.invoke`
`-> 如有 tool_calls 则执行 tool`
`-> ToolMessage append`
`-> 再次 invoke`
`-> 最终产出 handlerOutput`

---

## 主子 agent 的逻辑架构

当前逻辑架构可以概括为三层：

### 1. 主 agent

负责：

- 理解用户输入
- 决定是否创建子任务
- 决定是否继续已有任务
- 决定是否关闭任务
- 决定如何向用户展示结果

### 2. 子 agent

负责：

- 执行专业任务
- 调用工具
- 返回结构化结果

### 3. 任务协议层

负责：

- 记录 task / execution
- 调度 execution
- 发布 notification
- 将子 agent 结果映射回主 agent 生命周期

一句话：

`主 agent 做控制`
`子 agent 做执行`
`任务层做协议与编排`

---

## 主子 agent 的技术架构

### 1. 创建子任务

当主 agent 决定委派时，不直接“对话式调用子 agent”，而是：

`主图调用委派工具`
`-> TaskContinuationService`
`-> 创建 TaskRecord + TaskExecutionRecord`
`-> enqueue 到 SubAgentExecutionQueueService`

当前主 agent 不会在自己的 tool 调用链里直接执行子 agent。

### 2. 子 agent execution 队列

子 agent 使用独立的 execution 队列。

链路如下：

`task_execution 持久化记录`
`-> SubAgentExecutionQueueService.enqueueExecution(...)`
`-> 独立 drain`
`-> SubAgentDispatcherService.dispatchExecution(...)`
`-> runCharacterEditorExecution(...)`

这意味着：

- 子 agent 执行先进入独立队列
- 再由独立调度层拉起
- 不再挂在主 agent 当前工具调用的运行时上下文里

### 3. 通知回流

子 agent 执行完成后不会直接写聊天消息，而是：

`SubAgentDispatcherService`
`-> TaskNotificationService.publishExecutionEvent(...)`
`-> TaskNotificationRecord(pending)`
`-> TaskNotificationDispatchBridge`
`-> MainAgentEntryService.enqueueTaskNotification(...)`
`-> MainAgentDispatchService`
`-> taskNotificationConsumerService.consume(...)`

然后由主 agent 决定：

- 向用户显示结果
- 请求用户补参
- 请求用户确认结束
- 静默处理

### 4. 为什么现在主子 agent 能独立运行

当前实现里，子 agent 已不再由主 agent 直接 `dispatchExecution()`。

而是：

- 主 agent 只负责登记 execution
- execution 由独立队列在新的异步边界中启动
- notification 再通过桥接层回到主队列

所以现在主 agent 与子 agent 是：

`控制上相连`
`执行上解耦`

---

## 与消息列表的配合方式

当前系统中的“消息列表”对应的是主 agent 的输入列表，而不是主子 agent 共享的自由对话邮箱。

### 1. 用户消息进入消息列表

路径：

`UI -> IPC -> AIService`
`-> MainAgentEntryService.enqueueUserMessage(...)`
`-> MainAgentDispatchService`

这时会形成一条 `user_message` event。

### 2. 主 agent 消费用户消息

主 agent 先做生命周期控制判断：

- 普通聊天
- 创建子任务
- 为当前任务补参
- 确认结束
- 取消任务

如果是普通聊天，就进入主图。

如果是任务控制，就直接走生命周期控制和任务编排路径。

### 3. 子 agent 不直接写消息列表

子 agent 不会直接把一条自然语言消息塞进聊天列表。

它只会：

- 执行
- 发布 notification
- 将 notification 回流到主队列

### 4. notification 回到消息列表

当 `task_notification` 被主 agent 消费后，主 agent 再决定是否生成用户可见消息。

所以用户在聊天窗口里看到的内容，本质上仍然是：

`主 agent 对 notification 做完解释后的结果`

而不是：

`子 agent 直接在聊天框里说话`

---

## 生命周期模型

当前 task 生命周期状态包括：

- `active`
- `running`
- `pending_main_ack`
- `awaiting_user_input`
- `awaiting_user_confirmation`
- `done`
- `cancelled`

当前 execution 生命周期状态包括：

- `queued`
- `dispatching`
- `running`
- `awaiting_input`
- `reported_done`
- `failed`
- `cancelled`

生命周期原则如下：

1. 子 agent 可以报告完成，但不能自行把 task 置为 `done`
2. 子 agent 可以报告 `needs_input`，但不能直接向用户要信息
3. 主 agent 是唯一能把任务关闭为 `done / cancelled` 的控制器
4. 用户输入的“结束吧 / 取消 / 继续修改”必须先经过主 agent 解释

这意味着：

`子 agent 负责执行态`
`主 agent 负责最终生命周期决策`

---

## 主子 agent 的通信协议

子 agent 通过结构化协议回报主 agent。

当前 outcome 语义：

- `completed`
- `needs_input`
- `failed`
- `cancelled`

标准 payload 字段：

- `protocolVersion`
- `outcome`
- `summary`
- `message`
- `pendingContext`
- `errorMessage`
- `details`

其中：

- `summary` 表示本轮结果摘要
- `message` 表示主 agent 可直接使用的用户可见文案候选
- `pendingContext` 用于续跑
- `details` 用于 executor-specific 扩展信息

---

## 工具体系

当前系统里的工具已经开始标准化完成语义。

工具协议支持：

- `completionSemantics`
- `receipt`

当前本地人物写工具已经支持 `definitive + receipt`：

- `upsert_character_description`
- `upsert_character_profile`
- `upsert_character_demographic`

这意味着：

- 工具成功返回时，不再只依赖副作用猜测
- 子 agent 可以根据 receipt 判断“写入已经明确提交”

---

## 当前系统的工作方式总结

如果从一次完整交互来看，当前系统的真实工作方式是：

1. 用户发送消息
2. 主 agent 从主队列取出 `user_message`
3. 主 agent 判断这是普通聊天还是任务控制
4. 如果需要委派，则创建 task/execution
5. execution 进入独立子 agent 队列
6. 子 agent 后台执行
7. 执行结果发布为 `task_notification`
8. notification 回到主队列
9. 主 agent 再消费该 notification
10. 主 agent 决定是否向用户显示结果、追问、确认结束或静默处理

一句话总结：

`用户消息进入主队列`
`主 agent 决定是否创建子任务`
`子任务走独立 execution 队列后台执行`
`执行结果以 notification 回到主队列`
`再由主 agent 转成用户可见消息或下一步动作`
