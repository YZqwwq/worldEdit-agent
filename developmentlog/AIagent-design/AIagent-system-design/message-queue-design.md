# 消息队列设计

## 文档定位

这份文档描述当前系统的消息队列与调度设计。

重点包括：

- 主 agent event queue
- event log 与 owner commit
- notification 回流
- 子 agent execution queue 与主队列的衔接
- 启动恢复

## 两条队列，不是一条

当前系统实际有两条不同职责的队列：

1. 主 agent event queue
2. 子 agent execution queue

它们不是一条总队列，也不应该混成一个状态机。

### 主 agent event queue

处理：

- `user_message`
- `task_notification`

它服务的是主 agent 控制面。

### 子 agent execution queue

处理：

- `TaskExecutionRecord`

它服务的是子 agent 后台执行。

两者通过 `TaskNotificationRecord` 和 `taskNotificationDispatchBridge` 连接。

## 主 agent event queue

主 event queue 的主链如下：

`MainAgentEntryService`
`-> mainAgentEventLogQueueService`
`-> mainAgentDispatchQueueService`
`-> MainAgentEventOrchestration`

这里的核心思想是：

- event 先持久化，再调度
- 调度和提交分离
- 不同 event 类型共享统一入口，但走不同 orchestration 阶段

## 主 event log 的角色

当前主队列的调度锚点是 `MainAgentEventRecord`。

它负责记录：

- event 类型
- event payload
- `queued / processing / completed / failed`
- `task_notification` 的去重锚点

它的职责不是业务真相，而是：

`调度信封`

因此恢复时不能只看 event log，还必须看真正的 owner 是否已经提交。

## orchestration 阶段

当前主队列已经从隐式过程函数收敛成显式阶段：

- `prepare`
- `consume`
- `apply`
- `commit`

当前两类 event 的结构是：

- `user_message`
  - `prepare -> consume -> apply -> commit`
- `task_notification`
  - `consume -> apply -> commit`

含义如下：

- `prepare`
  为执行建立 owner 或上下文
- `consume`
  运行真正业务逻辑
- `apply`
  落地 message / task / trace / memory 等副作用
- `commit`
  提交 owner 终态

这套阶段化设计的意义是：

- 把控制流显式化
- 让恢复链有稳定判定点
- 让 apply 与 commit 解耦

## owner 与副作用分层

恢复链当前采用三层判断：

### 1. 调度信封层

- `MainAgentEventRecord`

### 2. 业务 owner 层

- `turn`
- `TaskNotificationRecord`

### 3. 副作用层

- `message`
- `memory`
- `trace`

当前固定原则是：

1. 先看 event 是否停在 `processing`
2. 再看对应 owner 是否已提交
3. owner 已提交：
   不重放业务，只补记 event 完成
4. owner 未提交：
   按该链的补偿策略失败或重放

一句话：

`event 负责调度锚点`
`owner 负责提交真相`
`副作用不主导恢复判定`

## user_message 链

`user_message` 的 owner 是 `turn`。

它的提交流程是：

- event `queued -> processing`
- turn `queued -> processing`
- turn `completed / interrupted`
- event `completed`

当前恢复原则是：

- turn 已提交：
  只补记 event 完成
- turn 未提交：
  恢复 memory checkpoint、回退相关 message、把 turn/event 标记为失败

所以 `user_message` 当前不是“自动重放聊天”，而是“未提交则补偿失败”。

## task_notification 链

`task_notification` 的 owner 是 `TaskNotificationRecord`。

它的提交流程是：

- notification `pending -> processing`
- 绑定 `mainAgentEventId`
- 主 agent 完成 decision 与 effect apply
- notification `processing -> consumed`
- event `completed`

当前恢复原则是：

- notification 已 `consumed`：
  只补记 event 完成
- notification 仍 `processing` 且绑定一致：
  重新排队重放
- notification 锚点丢失：
  重置回 `pending`，再走正常桥接链

所以 `task_notification` 当前采用的是：

`未提交则重放`

而不是直接判失败。

## 子 agent execution queue

子 agent 使用独立 execution queue，而不是复用主 event queue。

其链路如下：

`task / execution 持久化`
`-> subAgentExecutionQueueService.enqueueExecution(...)`
`-> subAgentDispatcherService.dispatchExecution(...)`
`-> child-agent runtime`
`-> TaskNotificationRecord`

它的调度单位是 `execution`，不是 `task`。

这意味着：

- task 是长期任务
- execution 是一次具体运行
- continuation 不是恢复旧 execution
- continuation 是创建新 execution 再次入队

关于这条队列的更细节设计，见：

[task-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/task/task-design.md)

## notification 为什么要桥接回主队列

子 agent 执行完成后不会直接写用户消息，而是：

1. 发布 `TaskNotificationRecord`
2. 通过 `taskNotificationDispatchBridge` 进入主 event queue
3. 由主 agent 消费 notification
4. 再决定是否生成用户可见消息

这样做的目的有三个：

1. 子 agent 不直接掌握用户面输出控制权
2. 主 agent 保持统一生命周期解释权
3. `completed / needs_input / failed / cancelled` 都能走统一主控入口

## 启动恢复顺序

当前启动恢复按固定顺序执行：

1. 恢复被中断的 execution
2. 重新排入 `queued` execution
3. 整理 `processing user_message event`
4. 整理 `queued / processing / failed task_notification event`
5. 重新排入 `queued user_message event`
6. 重新桥接 `pending notification`

这个顺序的目的只有一个：

`先修 owner 状态，再恢复调度入口`

避免把不干净的状态直接重新送回队列。

## 队列设计的当前结论

当前消息队列设计已经稳定在下面这些原则上：

- 主队列与 execution 队列分离
- event log 是调度锚点，不是业务真相
- owner commit 才决定是否真正提交完成
- notification 是主子 agent 之间的正式回流桥
- 子 agent 不直接写聊天消息
- 恢复链先看 owner，再决定补偿还是重放
