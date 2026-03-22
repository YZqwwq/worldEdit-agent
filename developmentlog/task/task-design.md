# 主-子 Agent 任务系统实现记录

## 当前定位

当前任务系统的真实实现已经收敛为：

`主 agent 负责用户对话`
`子 agent 负责后台 execution`
`MainAgentLoopService 负责后台轮询待主 agent 处理任务`
`TaskCoordinatorService 负责决定静默处理还是向用户发消息`
`TaskTraceRecord 负责记录节点埋点形成的时间线`

这意味着：

1. 主 agent 与子 agent 的内部协作不会直接进入用户聊天记录
2. 主 agent 不需要阻塞等待子 agent 完成
3. 子 agent 的关键行为会以 trace 形式出现在任务组件中

---

## 当前架构

### 1. 用户可见对话通道

用户能看到的内容只进入：

- `Message`

包括：

- 用户消息
- 主 agent 对用户的回复
- 协调器决定向用户发出的补参 / 完成确认 / 失败说明

---

### 2. 主-子 agent 内部协作通道

内部协作只走任务结构化数据：

- `TaskRecord`
- `TaskExecutionRecord`
- `TaskNotificationRecord`
- `pendingContext`

其中：

- 主 agent 回复子 agent
  不是一条聊天消息，而是：
  `创建新的 execution`

- 子 agent 回复主 agent
  不是一条聊天消息，而是：
  `写 notification`

---

### 3. 任务观测时间线

为了让任务组件可以展示主-子 agent 的互动过程，当前已经新增：

- `TaskTraceRecord`
- `taskTraceService`

它是 append-only 的埋点时间线，不参与业务状态机推进。

当前第一版 trace stage 为：

- `subagent_activated`
- `subagent_notify_main`
- `main_received_subagent`
- `main_response_silent`
- `main_response_user`
- `user_replied_to_task`

---

## 当前组件分工

### 主 agent

负责：

1. 与用户连续对话
2. 判断是否建立任务
3. 调用 delegate tool
4. 对用户解释任务开始

不负责：

1. 后台等待 execution 完成
2. 直接消费 notification
3. 将内部协作过程暴露为聊天消息

---

### 子 agent

负责：

1. 接收一次 execution payload
2. 独立后台执行
3. 结束后通过 notification 请求主 agent 响应

---

### MainAgentLoopService

当前已经新增：

- `MainAgentLoopService`

它的职责很单一：

1. 后台轮询当前是否存在 `pending_main_ack` 的 active task
2. 如果存在，则触发主 agent 侧协调处理

所以：

`轮询是主 agent 的后台行为`

---

### TaskCoordinatorService

当前已经新增：

- `TaskCoordinatorService`

它负责：

1. 消费子 agent 的 pending notification
2. 记录“主 agent 已收到子 agent”埋点
3. 判断：
   - 静默续跑
   - 或向用户发消息
4. 在 `awaiting_user_input` 状态下优先处理用户补参
5. 把用户补参转成新的 execution

---

## 当前状态机

### TaskRecord.status

- `active`
- `running`
- `pending_main_ack`
- `awaiting_user_input`
- `awaiting_user_confirmation`
- `done`
- `cancelled`

### TaskExecutionRecord.status

- `queued`
- `dispatching`
- `running`
- `awaiting_input`
- `reported_done`
- `failed`
- `cancelled`

### TaskNotificationRecord

`type`

- `subagent_completed`
- `subagent_failed`
- `subagent_needs_input`

`status`

- `pending`
- `consumed`

---

## 当前完整循环

### 1. 用户发起任务

1. 主 agent 建立 `TaskRecord`
2. 主 agent 调用 delegate tool
3. delegate tool 创建 `TaskExecutionRecord(status=queued)`
4. dispatcher 启动 execution

---

### 2. 子 agent 激活并执行

dispatcher 将 execution 推进到：

`queued -> dispatching -> running`

同时写 trace：

- `subagent_activated`

---

### 3. 子 agent 请求主 agent 响应

子 agent 本轮完成、失败或需要补参时：

1. 更新 execution 状态
2. 插入 `TaskNotificationRecord`
3. 任务进入 `pending_main_ack`
4. 写 trace：
   - `subagent_notify_main`

---

### 4. 主 agent 后台轮询接管

`MainAgentLoopService` 会轮询：

- 当前 active task 是否为 `pending_main_ack`

如果命中：

1. 交给 `TaskCoordinatorService`
2. 协调器消费 notification
3. 写 trace：
   - `main_received_subagent`

---

### 5. 主 agent 决定下一步

如果决定静默继续：

1. 创建新 execution
2. 任务回到 `running`
3. 写 trace：
   - `main_response_silent`

如果决定向用户发消息：

1. 写入 `Message`
2. 任务进入 `awaiting_user_input` 或 `awaiting_user_confirmation`
3. 写 trace：
   - `main_response_user`

---

### 6. 用户补参

当任务处于 `awaiting_user_input` 时：

1. 用户下一条消息优先进入协调器，而不是普通聊天主图
2. 协调器记录 trace：
   - `user_replied_to_task`
3. 将补参合并到 `pendingContext`
4. 创建新的 execution
5. 任务回到 `running`
6. 写 trace：
   - `main_response_silent`

这就保证了：

`主 agent 回复子 agent 的内部消息不会出现在用户聊天记录里`

---

## 当前已完成任务表

- [x] 建立三层状态机：`TaskRecord / TaskExecutionRecord / TaskNotificationRecord`
- [x] 建立 dispatcher 异步执行框架
- [x] 建立人物编辑 delegate 与 execution payload
- [x] 建立 `pendingContext` 持久化
- [x] 引入 `TaskCoordinatorService`
- [x] 引入 `MainAgentLoopService`
- [x] 引入 `TaskTraceRecord` 与 `taskTraceService`
- [x] 在 dispatcher 中埋入子 agent 激活 / 请求主 agent 响应埋点
- [x] 在协调器中埋入主 agent 接收 / 静默处理 / 请求用户埋点
- [x] 在用户补参续跑链路中埋入用户回复埋点
- [x] 任务组件开始展示 trace 时间线

---

## 当前下一步

- [ ] 为更多 executorKind 接入 coordinator handler
- [ ] 让主 agent 在部分场景下能真正自动静默补全参数后继续派发
- [ ] 升级 notification payload，携带更明确的 `missingFields`
- [ ] 为“取消任务 / 确认完成 / 失败重试”补专门的协调分支
- [ ] 视需要再决定是否引入更细的前端实时推送

---

## 当前代码落点

### 任务与轮询

- `src/main/services/task/taskService.ts`
- `src/main/services/task/taskExecutionService.ts`
- `src/main/services/task/taskNotificationService.ts`
- `src/main/services/task/subAgentDispatcherService.ts`
- `src/main/services/task/taskCoordinatorService.ts`
- `src/main/services/task/mainAgentLoopService.ts`
- `src/main/services/task/taskTraceService.ts`

### 实体

- `src/share/entity/database/TaskRecord.ts`
- `src/share/entity/database/TaskExecutionRecord.ts`
- `src/share/entity/database/TaskNotificationRecord.ts`
- `src/share/entity/database/TaskTraceRecord.ts`

### 用户可见消息与前端

- `src/main/services/aiservice/aiService.ts`
- `src/share/entity/database/Message.ts`
- `src/renderer/src/services/aiClientService.ts`
- `src/renderer/src/views/AIChatView.vue`
- `src/renderer/src/components/TaskQueuePanel.vue`

---

## 当前结论

当前主-子 agent 系统已经从“任务状态机”进一步进入：

`主 agent 后台轮询接管`
`协调器决定下一步动作`
`节点埋点形成可观测时间线`

这套结构已经能支持你要的第一版观测：

1. 子 agent 激活
2. 子 agent 请求主 agent 响应
3. 主 agent 收到子 agent
4. 主 agent 选择静默处理或请求用户
5. 用户补参后静默续跑
