# 主 Agent 设计

## 文档定位

这份文档只描述主 agent 本身如何工作。

重点包括：

- 主 agent 内部职责
- 主图与 runtime 控制面的边界
- lifecycle / turn / prompt / notification 的角色

不展开子 agent execution queue 的底层细节。

## 主 agent 的定位

主 agent 是当前系统唯一的用户交互中心，也是唯一的生命周期控制中心。

它负责：

- 接收用户输入
- 判断是普通聊天还是任务控制
- 驱动主图推理
- 决定是否创建和续跑子任务
- 决定任务结果如何展示给用户

因此主 agent 不是“又一个 LLM 包装层”，而是：

`当前系统的控制面核心`

## 主 agent 的职责拆分

当前主 agent 内部已经拆成五类职责：

1. 事件消费
2. 事件 orchestration
3. 生命周期控制
4. 推理执行
5. 子任务协调

对应服务大致如下：

- 事件消费：
  `MainAgentEntryService -> mainAgentDispatchQueueService`
- orchestration：
  `mainAgentEventOrchestration`
- 生命周期控制：
  `mainAgentLifecycleControlService`
- 推理执行：
  `MainAgentChatRuntimeService -> agentReactSystem`
- 子任务协调：
  `taskNotificationConsumerService`、`taskContinuationService` 与任务服务

## 主图与控制面的边界

当前主 agent 的 LangGraph 只保留推理路径：

`personaNode -> contextNode -> llmCall -> toolNode / memoryNode`

这意味着主图只负责：

- persona policy
- context 构建
- 模型调用
- 工具调用
- memory 写入

而以下能力不属于主图：

- 生命周期控制
- event 调度
- task notification 消费
- effect apply / commit
- 启动恢复

这条边界很关键：

`主图负责推理`
`runtime 负责控制`

## runtime 文件排布

当前 `src/main/services/aiservice/runtime` 已按控制面职责拆成四块：

- `runtime/queue`
- `runtime/orchestration`
- `runtime/lifecycle`
- `runtime/notification`

含义如下：

- `runtime/queue`
  主消息队列、event log、恢复、notification 入队桥
- `runtime/orchestration`
  `prepare / consume / apply / commit` 编排与 apply 执行器
- `runtime/lifecycle`
  用户消息进入主图前的生命周期判断与 awaiting-input 续跑闸门
- `runtime/notification`
  子 agent notification 的消费、决策与 effect 生成

这说明当前项目把主 agent 拆成：

- 推理图
- 控制面

而不是把一切都放进 `agentReactSystem`。

## 生命周期控制

当前生命周期判断已经收敛成两部分：

### 1. 直接控制路径

由 `mainAgentLifecycleControlService` 直接处理：

- 取消任务
- 确认结束
- `awaiting_user_input` 下的续跑/澄清/问状态

### 2. 轻量分类路径

由 `taskLifecycleIntentNode` 用轻量模型判断：

- `create_task`
- `continue_task`
- `confirm_close_task`
- `none`

模型失败时保守回退为 `none`。

这意味着当前主 agent 不再依赖一大套硬编码词表去决定整条生命周期路由。

## Turn 语义

当前系统已经正式引入 `turn`，它只服务普通聊天链。

turn 表示：

`主 agent 对一条用户输入形成的一次可追踪、可终止、可回退的聊天处理单元`

它不是：

- event
- task
- execution
- 单条 message

当前只有真正进入主图推理的普通聊天才会创建 turn。

以下路径不会创建 turn：

- lifecycle_control 直接处理的控制消息
- task_notification_consumer 处理后的任务通知消息

## Turn 的作用

turn 解决的是普通聊天链的三个问题：

1. 终态管理
2. 中断语义
3. 回退语义

当前固定状态为：

- `queued`
- `processing`
- `completed`
- `interrupted`
- `failed`
- `reverted`

其中最重要的原则是：

`interrupted 是终态，不是中间态`

也就是说，当前“暂停”语义实际表示：

`中断当前主 agent 响应`

而不是将生成现场原地挂起后继续。

## Prompt 架构

当前主 agent prompt 已拆成三层：

1. `character`
2. `mood`
3. `expression`

当前注入顺序是：

`character -> mood -> task/context/tool rules -> memory/history -> expression`

这意味着：

- 稳定身份层和输出契约层被明确分离
- 用户可调的是身份画像，不是系统内部控制约束
- 行为状态与表达边界属于主 agent 的内部控制面

## 主 agent 与任务系统的关系

主 agent 不直接在自己的工具调用链里同步执行子 agent。

当它决定委派时，实际发生的是：

1. 主图调用 delegate tool
2. 创建 task / execution
3. execution 进入独立子 agent 队列
4. 子 agent 完成后发布 notification
5. 主 agent 再消费 notification
6. 主 agent 决定是否向用户展示结果或继续追问

所以主 agent 与子 agent 的关系是：

`控制上相连`
`执行上解耦`

## 主 agent 与消息列表

当前消息列表对应的是主 agent 的输入输出视图，不是主子 agent 共享的自由邮箱。

因此：

- 用户消息先进入主队列
- 子 agent 不直接写聊天列表
- notification 回主队列后，仍由主 agent 决定是否生成用户可见消息

用户在聊天窗口里看到的内容，本质上仍然是：

`主 agent 对系统状态和子 agent 结果做解释后的输出`

## 主 agent 设计的当前结论

当前主 agent 已经稳定成下面这套模型：

- 主图只保留推理能力
- runtime 控制面承担 event、lifecycle、notification 与 effect apply
- turn 只服务普通聊天
- task / execution / notification 不并入 turn 体系
- 子 agent 结果必须先回到主 agent 控制面，再决定如何对用户呈现

如果继续看主队列、恢复链和 notification 桥接，进入：

[message-queue-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-system-design/message-queue-design.md)
