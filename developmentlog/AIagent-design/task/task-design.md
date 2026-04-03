# 子 Agent 执行队列设计

## 文档定位

这份文档只描述当前项目中“子 agent execution queue”这一条链路：

- 子任务如何创建 execution 并进入队列
- execution 如何被 dispatcher 拉起并退出队列
- `needs_input` 时为什么不是“留在队列里等待”
- 与这条链路直接相关的服务、协议和工具

这份文档不覆盖主 agent 的事件队列，也不覆盖整张主图推理链。

## 当前结论

当前系统的子任务队列单位是 `TaskExecutionRecord`，不是 `TaskRecord`。

也就是说：

- task 是“长期任务实体”
- execution 是“任务的一次具体运行”
- 队列里排的是 execution id

因此，“等待用户补参”不是把旧 execution 挂在队列里不动，而是：

1. 当前 execution 正常结束，结果为 `needs_input`
2. task 持久化 `pendingContext`
3. task 状态进入 `awaiting_user_input`
4. 用户回复后，新建下一次 execution
5. 新 execution 再次入队

这就是当前子 agent 队列的核心设计。

## 架构边界

子 agent 执行链当前分为 5 层：

1. 启动/续跑入口
2. execution 持久化
3. 内存队列调度
4. dispatcher 执行
5. notification 回主 agent

对应代码：

- 启动/续跑入口：
  [taskContinuationService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/taskContinuationService.ts)
- runtime spec 注册：
  [subAgentRegistry.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/subAgentRegistry.ts)
- execution 持久化：
  [taskExecutionService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/taskExecutionService.ts)
- 子 agent 队列：
  [subAgentExecutionQueueService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/queue/subAgentExecutionQueueService.ts)
- dispatcher：
  [subAgentDispatcherService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/subAgentDispatcherService.ts)
- notification：
  [taskNotificationService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/taskNotificationService.ts)
- 回主 agent 队列桥：
  [taskNotificationDispatchBridge.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/runtime/queue/taskNotificationDispatchBridge.ts)
- 启动恢复：
  [taskRecoveryService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/taskRecoveryService.ts)

## 队列模型

### 1. 队列是内存队列，数据库是持久化真源

[subAgentExecutionQueueService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/queue/subAgentExecutionQueueService.ts)
里维护的是一个进程内队列：

- `queue: number[]`
- `queuedExecutionIds: Set<number>`
- `scheduled`
- `draining`

其中：

- `queue` 负责 FIFO 排队
- `queuedExecutionIds` 负责去重
- `scheduled` 防止重复调度 drain
- `draining` 保证单消费者串行 dispatch

但真正的持久化状态不在这个内存数组里，而在数据库的 `TaskExecutionRecord.status`。

因此系统的设计是：

- 内存队列负责“当前进程内调度”
- execution status 负责“重启后恢复”

### 2. 队列排的是 execution，不是 task

[taskExecutionService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/taskExecutionService.ts)
里，`queueRun()` 每次都会创建一条新的 run：

- `taskId`
- `runNumber`
- `executorKind`
- `status: 'queued'`
- `inputPayloadJson`

所以一个 task 在生命周期里可以有多次 execution：

- 首次启动是 run #1
- 用户补参后续跑是 run #2
- 再次补参或重试时可以继续产生 run #3、run #4

这也是为什么队列不直接挂 task，而是挂 execution id。

## 如何进入队列

### 1. 首次启动进入队列

以 `character_editor` 为例，入口来自 runtime spec 的 `startHandler`：

- 注册位置：
  [subAgentRegistry.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/subAgentRegistry.ts)
- 具体实现：
  [characterEditorRuntimeSupport.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/child-agent-system/characterEditorRuntimeSupport.ts)

`startCharacterEditorTask()` 会：

1. 解析目标人物/世界信息
2. 创建 `TaskRecord`
3. 创建第一条 `TaskExecutionRecord`
4. 将 execution 置为 `queued`
5. 回填最终 payload
6. 调用 `subAgentExecutionQueueService.enqueueExecution(executionId)`

这一层对应用户侧工具语义就是：

- `delegate_character_editor`

也就是“发起一个新的子任务”，本质上是在创建一条新的 task 和它的首个 execution，并把 execution 放进队列。

### 2. continuation 进入队列

当 task 处于 `awaiting_user_input` 时，用户可以通过 continuation 继续任务：

- 统一入口：
  [taskContinuationService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/taskContinuationService.ts)
- `character_editor` continuation：
  [characterEditorContinuationNode.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/child-agent-system/nodes/characterEditorContinuationNode.ts)

当前 continuation 不是恢复旧 execution，而是：

1. 读取 task 的 `pendingContext`
2. 组装新的 payload
3. `queueRun()` 创建新的 execution
4. 更新新 execution 的 `inputPayloadJson`
5. 将 task 状态切回 `running`
6. 再次调用 `enqueueExecution()`

这对应用户侧工具语义是：

- `continue_active_child_agent`

所以当前 continuation 设计是：

- 不是让旧 execution 从“等待中恢复”
- 而是让 task 基于旧上下文启动“下一次 execution”

### 3. 启动恢复进入队列

如果应用重启，队列本身不会自动保留内存里的 `queue[]`，恢复依赖数据库：

- 队列恢复入口：
  [subAgentExecutionQueueService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/queue/subAgentExecutionQueueService.ts)
  的 `enqueueQueuedExecutions()`
- 恢复服务：
  [taskRecoveryService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/taskRecoveryService.ts)

恢复分两类：

- `status = queued` 的 execution：
  重新扫表并 `enqueueExecution(run.id)`
- `status = dispatching/running` 且没有通知的 execution：
  不自动重放，而是转成失败通知交给主 agent 处理

这说明当前系统对“已开始执行但进程中断”的策略是保守恢复，而不是自动重试。

## 如何在队列中等待

这里要区分两种“等待”。

### 1. 等待被调度

这是队列自己的等待，含义是：

- execution 已经创建
- execution.status = `queued`
- execution id 已进入 `subAgentExecutionQueueService`
- 尚未被 `dispatchExecution()` 拉起

这才叫“在队列中等待”。

### 2. 等待用户补参

这不是队列自己的等待。

当 dispatcher 执行完 handler 后，如果 outcome 是 `needs_input`：

1. dispatcher 持久化 `pendingContext`
2. `taskNotificationService.publishExecutionEvent()` 把 execution 结束为 `awaiting_input`
3. task 进入 `pending_main_ack`
4. 主 agent 消费 notification 后，task 最终进入 `awaiting_user_input`

也就是说：

- execution 已经结束
- 队列已经把它移除了
- 真正“等待”的是 task，不是 queue

当前实现里，`awaiting_user_input` 的续跑凭据是：

- task.status
- task.pendingContextJson

而不是某个仍留在队列里的旧 execution。

## 如何退出队列

[subAgentExecutionQueueService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/queue/subAgentExecutionQueueService.ts)
在 `drain()` 里串行调用：

- `subAgentDispatcherService.dispatchExecution(executionId)`

无论 dispatch 成功还是失败，都会在 `finally` 中：

- `queuedExecutionIds.delete(executionId)`

所以从“队列视角”看，退出条件很简单：

- 只要 dispatcher 对这条 execution 调度完一轮，这个 execution 就离开内存队列

至于业务结果是：

- completed
- needs_input
- failed
- cancelled

这些都不是“继续留在队列里”的理由，它们会通过 notification 和 task status 进入下一阶段。

## Dispatcher 的职责

[subAgentDispatcherService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/subAgentDispatcherService.ts)
是 execution queue 和具体子 agent 之间的执行边界。

它的主流程是：

1. 加载 execution
2. 只接受 `queued` / `dispatching` 状态
3. 加载所属 task
4. 将 execution 置为 `dispatching -> running`
5. 将 task 置为 `running`
6. 写 trace：`subagent_activated`
7. 从 registry 取 runtime spec
8. 解析 `inputPayloadJson`
9. 调用 runtime spec 的 `dispatchHandler`
10. 根据结果写 `pendingContext`
11. 发布 execution notification
12. 写 trace：`subagent_notify_main`
13. 将 notification bridge 回主 agent 队列

如果 handler 不存在，或者执行抛错，也不会卡在队列里，而是：

- 直接构造成失败 notification
- 回主 agent 处理

所以 dispatcher 的职责很明确：

- 不负责长期等待
- 不负责和用户多轮对话
- 只负责把“一条 queued execution”执行成“一条 notification”

## execution 与 task 的状态语义

### execution 状态

[taskExecutionService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/taskExecutionService.ts)
当前可见的核心状态迁移是：

- `queued`
- `dispatching`
- `running`
- `awaiting_input`
- `reported_done`
- `failed`
- `cancelled`

其中：

- `queued` 表示排队中
- `dispatching/running` 表示正在被子 agent 执行
- `awaiting_input/reported_done/failed/cancelled` 都是 execution 已结束

### task 状态

[taskService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/taskService.ts)
和 [taskNotificationService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/taskNotificationService.ts)
共同定义了 task 的长期状态：

- `active`
- `running`
- `pending_main_ack`
- `awaiting_user_input`
- `awaiting_user_confirmation`
- `done`
- `cancelled`

这两个层次要分开理解：

- execution status 描述“一次运行”
- task status 描述“整个任务当前卡在哪”

“等待用户补参”属于 task status，不属于 queue status。

## runtime spec 在队列中的作用

[subAgentRegistry.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/subAgentRegistry.ts)
现在已经是子 agent 队列的统一注册入口。

每个 executor 的 runtime spec 提供：

- `startHandler`
- `dispatchHandler`
- `continuationHandler`
- `timeoutPolicy`
- `retryPolicy`
- `protocol`
- `inspection`

这意味着队列链不直接依赖具体 executor 细节，而是依赖 runtime spec：

- 启动时走 `startHandler`
- 调度时走 `dispatchHandler`
- 续跑时走 `continuationHandler`
- 通知解析/构造走 `protocol`
- inspection 展示走 `inspection`

当前唯一完整接入的是：

- `character_editor`

所以这份文档描述的是“当前子 agent 队列架构”，而不是“未来所有 executor 都已经实现”。

## 与主 agent 的连接方式

子 agent 队列不会直接改写主 agent 响应，而是通过 notification 桥接：

1. dispatcher 发布 `TaskNotificationRecord`
2. `taskNotificationDispatchBridge` 把 notification 封装回主 agent 的事件队列
3. 主 agent 在自己的 runtime queue 中消费 notification
4. task 状态由主 agent consume/commit 后进入下一步

这样做的好处是：

- 子 agent 侧只负责完成 execution
- 主 agent 侧保留最终的用户面响应控制权
- `needs_input`、`failed`、`completed` 都统一通过 notification 回流

## 当前设计原则

### 1. queue 只管 execution，不管整条任务

这是最重要的原则。这样才能让一个 task 在多轮 continuation 中产生多次 execution，而不会把用户交互状态塞进队列内部。

### 2. 等待用户补参属于 task，不属于 queue

如果把“等待用户输入”做成队列内挂起，会让 dispatcher、恢复、状态机都变复杂。当前实现把它拆成：

- execution 结束
- task 持久化 pendingContext
- 用户回复后生成下一条 execution

这是更稳定也更可恢复的设计。

### 3. 队列是短生命周期调度器，数据库才是恢复真源

内存队列只解决当前进程的调度效率；重启恢复依赖 `TaskExecutionRecord.status` 和 notification 状态，而不是依赖内存结构。

### 4. 子 agent 不直接面向用户，统一通过主 agent notification 回流

这样能保持主 agent 对用户对话的控制面完整，也能让失败、补参、完成三类结果走同一种协议。

## 当前直接相关的工具与服务

用户侧工具：

- `delegate_character_editor`
- `continue_active_child_agent`

任务/执行服务：

- [taskService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/taskService.ts)
- [taskExecutionService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/taskExecutionService.ts)
- [taskTraceService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/taskTraceService.ts)

子 agent 执行链：

- [subAgentRegistry.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/subAgentRegistry.ts)
- [subAgentExecutionQueueService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/queue/subAgentExecutionQueueService.ts)
- [subAgentDispatcherService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/subAgentDispatcherService.ts)
- [characterEditorRuntimeSupport.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/child-agent-system/characterEditorRuntimeSupport.ts)
- [characterEditorContinuationNode.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/child-agent-system/nodes/characterEditorContinuationNode.ts)

回主 agent 链：

- [taskNotificationService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/taskNotificationService.ts)
- [taskNotificationDispatchBridge.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/aiservice/runtime/queue/taskNotificationDispatchBridge.ts)
- [taskRecoveryService.ts](/Users/admin/Documents/trae_projects/worldEdit-agent/src/main/services/task/taskRecoveryService.ts)

## 当前仍未覆盖的设计议题

这份文档先只记录当前已实现真相，以下议题仍可后续单独推进：

- `pendingContext` 升级为正式 continuation spec
- 多 executor 接入后的通用 queue/inspection schema
- 自动重试策略是否进入 registry runtime spec
- queue 监控指标是否需要独立暴露
