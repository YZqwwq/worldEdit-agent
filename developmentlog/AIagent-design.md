# AI Agent 架构说明

> 状态说明（2026-04-01）
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
`-> MainAgentEventLogService（event 持久化）`
`-> MainAgentDispatchService`
`-> MainAgentEventOrchestration`
`   - user_message -> prepare -> consume -> apply -> commit`
`   - task_notification -> consume -> apply -> commit`
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
- 持久化 `MainAgentEventRecord`
- 统一排队
- 串行消费
- 将 event 交给显式 orchestration 表执行

关键对象：

- `MainAgentEntryService`
- `MainAgentEventLogService`
- `MainAgentDispatchService`
- `mainAgentEventOrchestration`

### 4. 生命周期控制层

负责：

- 判断用户消息是不是任务控制语义
- 处理取消任务、确认结束、补参续跑
- 为普通聊天路径准备 `taskLifecycle`
- 用轻量分类模型判断 `none / create_task / continue_task / confirm_close_task`
- 当分类模型不可用时保守回退为 `none`

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
- `MainAgentEventLogService`

### 主 event 日志

当前主 agent 的 queue event 已持久化为 `MainAgentEventRecord`。

它的职责是：

- 作为主队列调度锚点
- 记录 `queued / processing / completed / failed`
- 为启动恢复提供统一入口
- 为 `task_notification` 提供 dedupeKey 去重基础

一句话：

`队列负责串行消费`
`event log 负责可恢复调度`

### 主 agent 内部职责

主 agent 当前内部已经分成五类职责：

1. `事件消费`
   由 `MainAgentEntryService -> MainAgentDispatchService` 完成

2. `事件 orchestration`
   由 `mainAgentEventOrchestration` 完成

3. `生命周期控制`
   由 `MainAgentLifecycleControlService` 完成

4. `推理执行`
   由 `MainAgentChatRuntimeService -> agentReactSystem` 完成

5. `子任务协调`
   由 `taskNotificationConsumerService`、`taskContinuationService`、任务层服务共同完成

### 主 event orchestration

当前主 agent 已不再使用隐式的 `processMainAgentEvent` 过程函数，而是使用显式 orchestration 表。

当前两类 event 的固定执行结构如下：

- `user_message`
  - `prepare`
  - `consume`
  - `apply`
  - `commit`
- `task_notification`
  - `consume`
  - `apply`
  - `commit`

语义如下：

- `prepare`
  - 为执行创建 owner 或准备上下文
  - 例如创建 chat turn
- `consume`
  - 运行真正的业务处理
  - 例如生命周期控制、主图执行、notification 消费
- `apply`
  - 将 effect 落到 message / task / trace / memory
- `commit`
  - 提交 owner 终态
  - 例如完成 task notification consumption

这意味着：

`主 agent 的控制流程已经从“散在 service 调用链里”收敛成了显式执行阶段`

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

### 生命周期分类方式

当前生命周期判断已收敛成：

- 取消任务 / 确认结束 / 等待补参时的直接续跑
  - 由 `MainAgentLifecycleControlService` 直接处理
- 其他是否属于 `create_task / continue_task / confirm_close_task / none`
  - 由 `taskLifecycleIntentResolver` 调用轻量模型分类
- 轻量模型失败时
  - 保守回退为 `none`

这意味着当前系统不再维护一套大规模字符规则来做任务分类。

---

## Turn 语义

当前系统已经正式引入 `turn` 作为普通聊天轮的控制单元。

### 1. turn 是什么

`turn` 表示：

`主 agent 对一条用户输入所形成的一次可追踪、可终止、可回退的普通聊天处理单元`

它不是：

- 主队列 event 本身
- task
- execution
- 单条 message

当前 `turn` 只服务于：

- `user_message -> chat_runtime`

也就是说，只有真正进入主图推理路径的普通聊天，才会创建 turn。

### 2. 哪些路径不创建 turn

以下路径当前不创建可回退 turn：

- `lifecycle_control` 直接处理的控制消息
  - 例如取消任务
  - 确认结束任务
  - 用户补参续跑子 agent
- `task_notification_consumer` 处理后的任务通知消息

这些消息仍然会显示在聊天列表中，但它们属于：

`系统控制消息`

而不是：

`普通聊天 turn`

### 3. turn 的核心组成

一个 turn 至少包含：

- `turnId`
- `eventId`
- `sessionId`
- `consumer=chat_runtime`
- `status`
- `userMessageId`
- `aiMessageId`
- `memoryCheckpointBeforeTurn`
- `startedAt`
- `completedAt / interruptedAt / revertedAt`

其中最关键的约束是：

1. 一个 turn 必须绑定一条 user message
2. 一个 turn 最多绑定一条本轮 AI message
3. turn 开始前必须保存一份 memory checkpoint

### 4. turn 状态

当前 turn 状态固定为：

- `queued`
- `processing`
- `completed`
- `interrupted`
- `failed`
- `reverted`

语义如下：

- `queued`
  - turn 已创建，但主图尚未开始执行
- `processing`
  - 主图正在运行，可能正在流式输出
- `completed`
  - 正常完成，形成最终 AI 回复
- `interrupted`
  - 用户主动中断本轮响应，但本轮已经结束
- `failed`
  - 运行异常结束，且没有形成可提交结果
- `reverted`
  - 该 turn 已被撤回，不再参与默认消息历史与后续上下文

允许的状态迁移为：

- `queued -> processing`
- `processing -> completed`
- `processing -> interrupted`
- `processing -> failed`
- `completed -> reverted`
- `interrupted -> reverted`

### 5. 暂停语义

当前系统中的“暂停”正式定义为：

`中断当前主 agent 响应`

它不是：

- 原地挂起
- 保留运行现场后续跑
- 从上次 token 位置继续生成

因此：

`interrupted 是终态，不是中间态`

### 6. interrupted turn 的处理规则

当普通聊天 turn 被中断时：

1. 本轮 turn 结束为 `interrupted`
2. 如果已经生成了 partial AI 文本：
   - partial 文本视为本轮最终结果
   - 会写入消息历史
   - 会写入 memory
   - 允许回退
3. 如果中断发生在首个 AI token 之前：
   - 不生成 AI message
   - 用户输入仍视为本轮已结束输入
   - 该 interrupted turn 仍允许回退

### 7. 回退语义

当前系统只允许：

`回退最后一个 terminal 且 reversible 的 chat_runtime turn`

也就是：

- 最后一个 `completed` turn
- 或最后一个 `interrupted` turn

当前不允许回退：

- `lifecycle_control` 产生的控制消息
- `task_notification_consumer` 产生的任务通知消息
- 非最后一轮的历史 turn

### 8. 回退动作的真实含义

回退不是简单删除最后一条 AI 消息。

回退必须同时完成两件事：

1. 将该 turn 关联的 user / ai message 标记为 `reverted`
2. 将 memory 恢复到 `memoryCheckpointBeforeTurn`

因此回退的真实语义是：

`撤销整轮普通聊天对系统上下文造成的影响`

### 9. turn 与 message 的关系

当前约定如下：

- `message` 是 UI 展示与历史持久化单元
- `turn` 是普通聊天轮的运行控制与回退单元

因此：

- 一个 turn 必须绑定一条 user message
- 一个 turn 最多绑定一条 AI message
- 一个 message 可以不属于任何 turn
- 被标记为 `reverted` 的 message 不参与默认历史查询

### 10. turn 与 event / task 的关系

当前约定如下：

- `event` 是主队列的调度输入单元
- `turn` 是普通聊天事件在执行层形成的聊天轮单元
- 不是每个 event 都有 turn
- task / execution / notification 不属于 turn 体系

一句话：

`队列负责调度`
`turn 负责普通聊天轮的终态、回退与上下文一致性`

---

## 恢复链简洁模型

当前系统的恢复链不再按“看到什么状态就猜什么”来判断，而是按固定层次判断。

恢复逻辑只分三层：

### 1. 调度信封层

这一层只有一个对象：

- `MainAgentEventRecord`

它的作用是：

- 记录主队列里到底有哪些 event
- 记录 event 当前处于 `queued / processing / completed / failed` 的哪一阶段
- 为启动恢复提供可重放的调度锚点

它不是最终业务真相。

也就是说：

- `event` 用来判断“主 agent 有没有接手、需不需要重放”
- `event` 不直接决定“这条业务是不是已经真正提交完成”

### 2. 业务 owner 层

真正决定“业务是否已经提交完成”的 owner 只有两个：

1. 普通聊天链：`turn`
2. 任务通知链：`notification`

具体约定如下：

- `user_message` 的 owner 是 `turn`
- `task_notification` 的 owner 是 `TaskNotificationRecord`

因此恢复时永远先问：

`这条链对应的 owner 已经提交了吗？`

而不是先去猜：

- message 写没写
- memory 有没有同步
- trace 有没有出现

### 3. 副作用层

以下对象属于副作用层：

- `message`
- `memory`
- `trace`

它们的职责是：

- 展示用户可见结果
- 提供上下文记忆
- 提供调试与审计轨迹

它们很重要，但它们不主导恢复判定。

恢复时的原则是：

- 先依据 owner 判断是否已经提交
- 再决定是否补记、回滚或重放副作用

### 4. user_message 提交链

`user_message` 的恢复 owner 是 `turn`。

开始处理的判定点：

- `MainAgentEventRecord.status: queued -> processing`
- 对应 `turn.status: queued -> processing`

真正提交完成的判定点：

- `turn.status -> completed`
- 或 `turn.status -> interrupted`

一旦 turn 已进入以上终态，就表示这轮普通聊天已经提交完成。

此时即使 event log 还没来得及写 `completed`，启动恢复时也只需要：

- 补记 event 完成

而不应该重放本轮聊天。

如果启动时发现：

- event 仍是 `processing`
- 但 turn 还没有进入 `completed / interrupted / reverted / failed`

则说明该轮普通聊天在提交前中断。

当前恢复策略是：

1. 恢复 `memoryCheckpointBeforeTurn`
2. 回退该 event 关联的 AI message
3. 将 turn 标记为 `failed`
4. 将 event 标记为 `failed`

因此：

`user_message` 当前采用的是“未提交则补偿失败”，而不是自动重放聊天生成

### 5. task_notification 提交链

`task_notification` 的恢复 owner 是 `TaskNotificationRecord`。

开始处理的判定点：

- `TaskNotificationRecord.status: pending -> processing`
- 同时绑定 `mainAgentEventId`

真正提交完成的判定点：

- 主 agent 已完成 decision 与 effect apply
- `TaskNotificationRecord.status: processing -> consumed`

一旦 notification 已进入 `consumed`，就表示这条任务通知已经完成主控提交。

此时即使 event log 还停留在 `processing`，启动恢复时也只需要：

- 补记 event 完成

而不应该再次重放通知消费。

如果启动时发现：

- notification 仍为 `processing`
- 且 `mainAgentEventId` 与 event 一致

则说明这条通知已被主 agent 接手，但尚未提交完成。

当前恢复策略是：

1. 将对应 event 重新置回 `queued`
2. 将同一个 event 重新送回主队列
3. 依赖 message 幂等与 trace 轻量幂等避免重复输出

如果启动时发现：

- notification 为 `processing`
- 但 `mainAgentEventId` 已丢失或与 event 不一致

则说明通知 owner 已失去可靠锚点。

当前恢复策略是：

1. 将 notification 重置为 `pending`
2. 由正常 pending-notification 恢复链重新桥接回主队列

因此：

`task_notification` 当前采用的是“未提交则重放”，而不是直接判失败

### 6. 启动恢复顺序

当前启动恢复按以下固定顺序执行：

1. 恢复被中断的 execution
2. 重新排入 `queued` execution
3. 对 `processing user_message event` 做 owner 判定与补偿
4. 对 `queued / processing / failed task_notification event` 做 owner 判定与重放整理
5. 重新排入 `queued user_message event`
6. 重新桥接所有 `pending notification`

这条顺序的目的只有一个：

`先修 owner 状态，再恢复调度入口`

避免把脏状态直接重新送回主队列。

### 7. 恢复链的统一判断规则

当前系统对恢复链统一采用以下判断：

1. 先看调度信封是否停在 `processing`
2. 再看对应 owner 是否已经提交
3. owner 已提交：
   - 不重放业务
   - 只补记 event 完成
4. owner 未提交：
   - 按该链的补偿规则回滚或重放

一句话总结：

`event 负责调度锚点`
`turn / notification 负责提交真相`
`message / memory / trace 负责副作用`

这就是当前恢复链的简洁模型。

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
- `message` 表示 executor 提供的补充文案，不再作为主控语义判断依据
- `pendingContext` 用于续跑
- `details` 表示唯一正式协议字段，主 agent 通过它理解语义并生成主控通知

### 唯一协议约定

当前主子 agent 已统一到唯一协议：

- 主 agent 只用 `outcome + details` 判断语义
- 子 agent 必须原生产出与 `outcome` 对应的 typed `details`
- dispatcher 不再负责把子 agent 私有字段翻译成主协议
- `message` 与 `errorMessage` 只作为补充文本或兼容兜底，不作为主控语义真源

当前 `details` 的正式语义：

- `completed.details`
  - `changedScopes`
  - `appliedTools`
  - `internalWarning`
  - `suggestedFollowUp`
- `needs_input.details`
  - `phase`
  - `missingFields`
  - `suggestedPrompt`
  - `appliedTools`
- `failed.details`
  - `errorType`
  - `retryable`
  - `internalWarning`
  - `appliedTools`
- `cancelled.details`
  - `reason`

这意味着：

- 主子 agent 之间的语义沟通以 `details.kind` 为中心
- 用户可见文案应由主控层基于 typed details 生成
- `message` 允许存在，但它是“补充文案”，不是“协议字段的替代品”

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
