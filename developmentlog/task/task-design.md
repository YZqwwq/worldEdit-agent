# 任务系统设计记录

## 当前定位

当前任务系统的核心目标已经明确为：

`主 agent 维持连续对话与任务生命周期`
`子 agent 在后台异步执行具体任务`
`子 agent 完成后通过通知队列回传`
`主 agent 在自己的轮次中消费通知并继续与用户交互`

这套系统不是传统“按会话隔离”的聊天系统，而是：

1. 主 agent 保持统一人格与连续对话
2. 复杂任务以结构化任务对象进入后台执行链
3. 主 agent 不阻塞等待子 agent 完成
4. 子 agent 完成、失败、需要补充信息时都通过通知回传

---

## 当前已实现功能

截至当前，主-子 agent 任务系统已经具备以下能力：

### 1. 主 agent 侧任务生命周期判断已接入主图

当前主图顺序为：

`personaNode -> taskNotificationNode -> taskLifecycleNode -> contextNode -> llmCall -> ...`

含义：

1. `taskNotificationNode` 先消费后台未读通知
2. `taskLifecycleNode` 再判断当前是否创建任务、继续任务或结束任务
3. `contextNode` 将任务状态、通知提示、经验召回等注入主 agent 上下文

---

### 2. 单 active task 模式已落地

当前系统仍坚持：

`同一时刻只允许一个 active task`

活跃任务状态包括：

- `active`
- `running`
- `pending_main_ack`
- `awaiting_user_input`
- `awaiting_user_confirmation`

因此：

1. 主 agent 不会同时并发多个主任务
2. 子 agent 的异步执行与通知回传都围绕当前唯一活跃任务展开

---

### 3. 三层状态机已建立

当前不再尝试用一个状态字段同时表达所有含义，而是拆成三层：

#### TaskRecord.status

表示主任务生命周期：

- `active`
- `running`
- `pending_main_ack`
- `awaiting_user_input`
- `awaiting_user_confirmation`
- `done`
- `cancelled`

#### TaskExecutionRecord.status

表示一次子 agent 执行回合的状态：

- `queued`
- `dispatching`
- `running`
- `awaiting_input`
- `reported_done`
- `failed`
- `cancelled`

#### TaskNotificationRecord

表示子 agent 发给主 agent 的异步事件：

`type`

- `subagent_completed`
- `subagent_failed`
- `subagent_needs_input`

`status`

- `pending`
- `consumed`

---

### 4. 通知队列已经落库

当前已经新增：

- `TaskNotificationRecord`
- `taskNotificationService`

这意味着系统现在能够：

1. 在子 agent 完成后写入待消费通知
2. 将“子 agent 已完成”与“主任务真正结束”分离
3. 由主 agent 在自己的下一轮中消费通知，而不是被强制打断

---

### 5. dispatcher 骨架已经接入

当前已经新增：

- `SubAgentDispatcherService`

它负责：

1. 从 `TaskExecutionRecord(status=queued)` 取出待执行 run
2. 将执行状态推进到 `dispatching / running`
3. 调用对应执行器 handler
4. 将执行结果写回通知队列

当前这一层已经形成稳定的异步执行框架。

---

### 6. 人物编辑委派工具已进入真实异步链路

当前 `delegate_character_editor` 不再只停留在“协议占位”。

它现在会：

1. 校验目标实体确实存在且类型为 `character`
2. 复用当前 active task，或在无 active task 时创建新任务
3. 创建一条 `TaskExecutionRecord`
4. 将完整载荷写入 execution
5. 异步调用 dispatcher 启动后台执行

这意味着主 agent 到子 agent 的异步委派链已经真正接通。

---

## 当前任务状态机

### 主任务状态流转

当前主任务的推荐流转已经变为：

`active -> running -> pending_main_ack -> awaiting_user_confirmation -> done`

以及：

`running -> pending_main_ack -> awaiting_user_input -> running`

以及：

`active / running / awaiting_user_input / awaiting_user_confirmation -> cancelled`

---

### 各状态含义

#### active

任务已被主 agent 注册，但尚未进入后台执行，或刚准备进入委派。

#### running

至少存在一个后台执行回合正在运行或已被接管。

#### pending_main_ack

子 agent 已经产生了事件，但主 agent 还没有消费这条通知。

这个状态现在是通用中间态，不只用于“完成”，也可用于：

1. 子 agent 完成
2. 子 agent 失败
3. 子 agent 需要更多用户输入

#### awaiting_user_input

主 agent 已经消费了后台通知，并确认当前任务需要用户补充信息后才能继续。

#### awaiting_user_confirmation

主 agent 已经消费了“后台执行完成”通知，此时等待用户确认任务是否真正结束。

#### done

用户确认任务已经完成。

#### cancelled

用户明确取消任务，或决定不再继续当前任务。

---

## 当前执行状态机

一次 `TaskExecutionRecord` 表示一次子 agent 后台执行回合。

推荐流转为：

`queued -> dispatching -> running -> reported_done`

或：

`queued -> dispatching -> running -> awaiting_input`

或：

`queued -> dispatching -> running -> failed`

或：

`queued / running -> cancelled`

---

## 当前通知队列模型

### 为什么需要通知表

如果只依赖 `TaskRecord.status`，主 agent 与子 agent 会耦合过紧，难以表达：

1. 后台事件已发生，但主 agent 尚未处理
2. 后台完成不等于任务真正结束
3. 未来同一任务可能会有多次异步回传

因此当前已经确定：

`子 agent 回报 = 写 TaskNotificationRecord`

而不是：

`子 agent 直接改成任务完成`

---

### 当前通知消费原则

当前原则为：

`子 agent 完成 != 立即打断主 agent`

而是：

`子 agent 写 pending 通知 -> 主 agent 下一轮先消费通知 -> 再继续对用户说话`

这也是为什么主图里增加了：

- `taskNotificationNode`

它的职责就是：

1. 查找当前 active task 的最早一条未消费通知
2. 将其标记为 `consumed`
3. 根据通知类型把任务推进到：
   - `awaiting_user_confirmation`
   - 或 `awaiting_user_input`
4. 给主 agent 注入本轮提示 notice

---

## 当前主-子 agent 工作流

### 1. 创建任务

用户提出明确复杂任务后：

1. `taskLifecycleNode` 判断形成任务
2. 检查是否存在对应的委派工具能力
3. 若能力存在，则创建 `TaskRecord(status=active)`

---

### 2. 主 agent 调用委派工具

主 agent 使用对应的 delegate tool。

例如人物编辑场景中：

- `delegate_character_editor`

该工具会：

1. 复用当前 active task
2. 创建 `TaskExecutionRecord(status=queued)`
3. 立即异步交给 `SubAgentDispatcherService`
4. 向主 agent 返回“任务已进入后台执行”

---

### 3. dispatcher 启动后台执行

dispatcher 将执行状态推进到：

- `dispatching`
- `running`

并调用对应执行器。

---

### 4. 子 agent 回传异步事件

当子 agent：

1. 完成
2. 失败
3. 需要更多信息

都会调用通知服务，执行以下动作：

1. 更新 `TaskExecutionRecord`
2. 更新 `TaskRecord.status = pending_main_ack`
3. 插入一条 `TaskNotificationRecord(status=pending)`

---

### 5. 主 agent 消费通知

在下一轮主 agent 运行开始时：

1. `taskNotificationNode` 消费未读通知
2. 如果是完成通知：
   - 任务进入 `awaiting_user_confirmation`
3. 如果是失败或需要补充输入：
   - 任务进入 `awaiting_user_input`

---

### 6. 用户决定下一步

如果用户确认任务完成：

- `TaskRecord.status = done`

如果用户补充新要求继续做：

1. 主 agent 继续沿用当前任务
2. 创建新的 `TaskExecutionRecord`
3. 任务回到 `running`

如果用户取消：

- `TaskRecord.status = cancelled`

---

## 当前职责边界

### 主 agent 负责

1. 连续对话
2. 判断是否形成任务
3. 创建任务
4. 调用委派工具
5. 同步任务开始
6. 消费后台通知
7. 向用户请求补充信息或确认结束
8. 最终关闭任务

### 主 agent 不负责

1. 自己执行复杂任务
2. 阻塞等待后台子 agent
3. 自己做失败重试闭环
4. 把“后台完成”直接当成“任务完成”

### 子 agent 负责

1. 接收一次 execution payload
2. 在后台独立执行
3. 产出完成/失败/补充信息请求
4. 通过通知队列回传主 agent

---

## 当前代码落点

### 共享状态与数据库实体

- `src/share/cache/AItype/states/taskLifecycleState.ts`
- `src/share/entity/database/TaskRecord.ts`
- `src/share/entity/database/TaskExecutionRecord.ts`
- `src/share/entity/database/TaskNotificationRecord.ts`
- `src/share/entity/database/ExperienceRecord.ts`

### 任务服务

- `src/main/services/task/taskService.ts`
- `src/main/services/task/taskExecutionService.ts`
- `src/main/services/task/taskNotificationService.ts`
- `src/main/services/task/subAgentDispatcherService.ts`
- `src/main/services/task/subAgentCapabilityService.ts`

### 主图节点

- `src/main/services/aiservice/agentrsystem/agentReactSystem.ts`
- `src/main/services/aiservice/agentrsystem/node/tasknotificationnode/taskNotificationNode.ts`
- `src/main/services/aiservice/agentrsystem/node/tasklifecyclenode/taskLifecycleNode.ts`
- `src/main/services/aiservice/agentrsystem/node/contextnode/contextnode.ts`

### 当前委派入口

- `src/main/services/aiservice/ai-utils/tools/task/delegateCharacterEditor.ts`

---

## 当前已知边界

虽然异步任务链路已经接通，但当前仍有明确边界：

### 1. 只有人物编辑委派入口已接入

当前已接入异步链路的委派入口是：

- `delegate_character_editor`

其他执行器类型仍只有能力映射，还没有对应的实际 delegate tool 和 handler。

### 2. 人物编辑子 agent 的真实写入能力尚未完成

当前人物编辑 dispatcher handler 已经接进异步框架，但它仍然只具备：

- 读取人物 detail
- 接收任务载荷
- 回传“当前缺少写入工具，无法继续执行”

因此当前可以验证：

1. 异步委派
2. execution 状态轮转
3. 通知写入与消费
4. 主 agent 收到后台结果后的状态切换

但还不能真正完成人物 profile / demographic / relation 的自动写入。

### 3. 当前通知消费仍是“主 agent 下一轮消费”

当前已经实现的是：

`子 agent 写通知 -> 主 agent 下一轮先消费`

还没有实现：

`后台完成后主动向 UI 推送一条系统消息`

这意味着当前“异步完成告知”仍然以主 agent 下一轮运行时处理为主，而不是独立系统推送。

---

## 当前结论

当前主-子 agent 任务系统已经从“任务骨架”进入“可运行的异步状态机框架”阶段。

已经确认并落地的架构边界是：

1. 主 agent 负责任务生命周期与用户交互
2. 子 agent 负责后台执行
3. 主 agent 不阻塞等待子 agent
4. 子 agent 完成后写通知，不直接打断主 agent
5. `TaskRecord / TaskExecutionRecord / TaskNotificationRecord` 三层状态机共同组成当前任务系统

后续继续扩展时，应优先沿着这条路线推进：

`增加更多 delegate tool`
`增加更多 executor handler`
`补齐真实写入型子 agent 工具`
`最后再考虑主动系统推送与经验沉淀自动化`
