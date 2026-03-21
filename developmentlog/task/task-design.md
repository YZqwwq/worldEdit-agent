# 主-子 Agent 任务系统实现记录

## 当前目标

当前任务系统已经从“主 agent 下一轮才消费通知”的被动模式，进入：

`后台任务编排器驱动的主-子 agent 闭环`

目标是让系统具备以下能力：

1. 主 agent 负责用户对话与任务登记
2. 子 agent 负责后台 execution
3. 主 agent 与子 agent 的内部协作不进入用户聊天记录
4. 子 agent 需要补充信息时，由后台编排器判断：
   - 是继续静默回复子 agent
   - 还是向用户发起补参请求
5. 用户补参后，可以不经过普通聊天主图，而是直接续跑当前任务

---

## 当前架构

当前架构已经明确拆成两个通道：

### 1. 用户可见对话通道

只保存：

- 用户消息
- 主 agent 对用户的回复
- 后台编排器生成的“需要补参 / 已完成 / 执行失败”可见提示

这些内容进入：

- `Message`

也就是说：

`用户能看到的内容 = Message 表`

---

### 2. 主-子 agent 内部协作通道

不进入聊天记录，只走任务结构化记录：

- `TaskRecord`
- `TaskExecutionRecord`
- `TaskNotificationRecord`
- `pendingContext`

其中：

- 主 agent 回复子 agent
  不是一条聊天消息，而是：
  `创建下一条 execution`

- 子 agent 回复主 agent
  不是一条聊天消息，而是：
  `写入 notification`

---

## 当前组件分工

### 主 agent

负责：

1. 连续对话
2. 判断是否建立任务
3. 调用 delegate tool
4. 向用户解释任务开始

不负责：

1. 与子 agent 做后台多轮协调
2. 直接等待 execution 完成
3. 把内部协作消息暴露给用户

---

### 子 agent

负责：

1. 接收一次 execution payload
2. 后台运行
3. 产出：
   - `completed`
   - `needs_input`
   - `failed`
4. 通过 `TaskNotificationRecord` 回传

---

### 后台任务编排器

当前已经引入：

- `TaskCoordinatorService`

它的职责是：

1. 消费子 agent 的后台通知
2. 立即生成用户可见消息，避免必须等主 agent 下一轮才知道
3. 在任务处于 `awaiting_user_input` 时优先处理用户补参
4. 将用户补参转成新的 execution，而不是先走普通聊天主图

也就是说：

`主 agent 和子 agent 的完整循环，现在由后台编排器接上`

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

用户提出复杂任务后：

1. 主 agent 创建 `TaskRecord`
2. 主 agent 调用 delegate tool
3. delegate tool 创建 `TaskExecutionRecord(status=queued)`
4. dispatcher 拉起 execution

---

### 2. 子 agent 后台执行

dispatcher 将 execution 推进到：

`queued -> dispatching -> running`

然后由对应 handler 执行。

---

### 3. 子 agent 回传通知

执行完成后：

1. 更新 execution 状态
2. 写入 `TaskNotificationRecord`
3. 任务进入 `pending_main_ack`

---

### 4. 后台编排器接管通知

当前不再只依赖“主 agent 下一轮消费通知”，而是：

1. dispatcher 发布通知后
2. 立即调用 `TaskCoordinatorService`
3. 编排器消费 pending notification
4. 决定是否写一条用户可见 AI 消息

目前第一版已实现：

- `subagent_needs_input -> 立即给用户一条补参消息`
- `subagent_completed -> 立即给用户一条完成确认消息`
- `subagent_failed -> 立即给用户一条失败说明消息`

---

### 5. 用户补参后续跑

当任务状态为 `awaiting_user_input` 时：

1. 用户下一条消息优先进入 `TaskCoordinatorService`
2. 编排器判断是否作为当前任务补参处理
3. 若成立，则：
   - 不进入普通主图
   - 直接创建新的 `TaskExecutionRecord`
   - 合并旧 `pendingContext`
   - 任务回到 `running`
   - dispatcher 立即继续执行

这保证了：

`主 agent 回复子 agent 的内部消息不会出现在用户对话中`

因为这里的“回复”已经变成：

`新 execution payload`

而不是：

`主 agent 发一段用户可见文本`

---

## 后台编排功能任务表

### 已完成

- [x] 建立三层状态机：`TaskRecord / TaskExecutionRecord / TaskNotificationRecord`
- [x] 建立 dispatcher 异步执行框架
- [x] 建立人物编辑委派工具与 execution payload
- [x] 建立 `pendingContext` 持久化
- [x] 引入 `TaskCoordinatorService`
- [x] 打通 `subagent_needs_input -> 立即生成用户可见补参消息`
- [x] 打通 `awaiting_user_input + 用户补参 -> 静默创建下一条 execution`
- [x] 前端聊天页开始轮询历史，能看到后台编排器生成的可见消息

### 下一步待做

- [ ] 让后台编排器支持“静默回复子 agent”分支，而不只是向用户追问
- [ ] 将 notification payload 升级为更结构化的协调协议
  - 例如 `missingFields`
  - 例如 `suggestedUserQuestion`
  - 例如 `canAutoContinue`
- [ ] 为后台编排器增加“取消 / 确认结束 / 失败重试”专门分支
- [ ] 将当前基于规则的补参续跑扩展成更稳健的结构化判断
- [ ] 让后台编排器通过推送事件更新前端，而不是只依赖前端轮询
- [ ] 为更多 executorKind 接入对应 coordinator handler

---

## 当前代码落点

### 任务与编排服务

- `src/main/services/task/taskService.ts`
- `src/main/services/task/taskExecutionService.ts`
- `src/main/services/task/taskNotificationService.ts`
- `src/main/services/task/subAgentDispatcherService.ts`
- `src/main/services/task/taskCoordinatorService.ts`

### 主图与上下文

- `src/main/services/aiservice/agentrsystem/agentReactSystem.ts`
- `src/main/services/aiservice/agentrsystem/node/tasknotificationnode/taskNotificationNode.ts`
- `src/main/services/aiservice/agentrsystem/node/tasklifecyclenode/taskLifecycleNode.ts`
- `src/main/services/aiservice/agentrsystem/node/contextnode/contextnode.ts`

### 人物编辑相关

- `src/main/services/aiservice/ai-utils/tools/task/delegateCharacterEditor.ts`
- `src/main/services/aiservice/ai-utils/tools/character/shared.ts`
- `src/main/services/task/characterEditorExecution.ts`

### 用户可见消息与前端同步

- `src/main/services/aiservice/aiService.ts`
- `src/share/entity/database/Message.ts`
- `src/renderer/src/services/aiClientService.ts`
- `src/renderer/src/views/AIChatView.vue`

---

## 当前结论

当前主-子 agent 系统已经不再只是：

`主 agent 注册任务`
`子 agent 后台执行`
`主 agent 下一轮再知道结果`

而是进入了：

`主 agent 负责用户对话`
`子 agent 负责后台执行`
`后台编排器负责把 notification 转成下一步动作`

这意味着系统已经具备第一版真正可用的后台循环能力：

1. 子 agent 缺参数时，能主动向用户发起补参
2. 用户补参后，能静默续跑 execution
3. 主-子 agent 的内部协调不会污染用户聊天记录

后续扩展时，应继续沿着这条路线推进：

`让编排器具备更强的结构化决策`
`让更多子 agent 接入同一套后台闭环`
