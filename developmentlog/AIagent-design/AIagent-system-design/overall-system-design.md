# 整体设计思想

## 文档定位

这份文档只回答一个问题：

`为什么当前系统采用“主 agent 控制 + 消息队列调度 + 可委派子 agent”的结构`

它描述的是总原则，不展开主 agent 内部实现细节，也不替代队列设计文档。

## 系统定位

当前项目是一个：

- 单主会话
- 主 agent 控制
- 可委派子 agent
- 支持后台长任务

的 AI 助手系统。

这里最重要的约束只有一条：

`控制权只有一个中心：主 agent`

因此当前系统明确采用：

1. 用户只和主 agent 交互
2. 子 agent 不直接对用户说话
3. 主 agent 是唯一能创建、续跑、关闭任务生命周期的控制器

## 为什么是“主 agent + 消息队列”

当前项目不把一次用户输入简单理解成“立刻调用一次模型”，而是理解成：

`先进入控制面，再决定是否进入推理、是否进入任务链、是否需要等待后台结果`

所以系统需要一个独立于 LangGraph 主图的控制面。

这个控制面要解决的不是模型推理，而是：

- 串行消费输入
- 恢复中断事件
- 区分普通聊天和任务控制
- 让子 agent 结果安全回流
- 管理副作用提交

因此，当前主链不是“大一统主图”，而是：

`主 agent 推理图`
`+ 主消息队列`
`+ event orchestration`
`+ 子 agent execution queue`

## 整体主链

当前系统的有效主链如下：

`Renderer(Chat UI)`
`-> Preload / IPC`
`-> AIService`
`-> MainAgentEntryService`
`-> mainAgentEventLogQueueService`
`-> mainAgentDispatchQueueService`
`-> MainAgentEventOrchestration`
`-> MainAgentEffectApplierService`
`-> message / task / trace / memory 持久化`

如果进入子任务，则会继续形成另一条后台链：

`delegate tool`
`-> Task / Execution 持久化`
`-> subAgentExecutionQueueService`
`-> subAgentDispatcherService`
`-> child-agent runtime`
`-> TaskNotificationRecord`
`-> taskNotificationDispatchBridge`
`-> mainAgentDispatchQueueService`

这两条链通过 notification 汇合，而不是通过“子 agent 直接回聊天框”汇合。

## 为什么不做成一张大图

当前系统明确不把消息队列、生命周期控制、notification 消费并进 `agentReactSystem`。

原因是它们解决的是不同问题：

- 主图负责推理
- runtime 控制面负责调度

主图擅长：

- persona
- context
- LLM
- tool
- memory

控制面擅长：

- event 排队
- 生命周期判断
- notification 消费
- effect apply / commit
- 恢复与补偿

如果把两者强行做成一张大图，会出现两个问题：

1. 主图开始承担不属于推理层的调度职责
2. 启动恢复、幂等、owner commit 会变得难以解释

所以当前设计选择是：

`主图保持窄而清晰`
`控制面显式分层`

## 系统分层

当前系统可以概括为 7 层：

1. 前端聊天层
2. Electron 接入层
3. 主 agent 入口与分发层
4. 生命周期控制层
5. 主 agent 推理执行层
6. 任务与后台编排层
7. 子 agent 执行层

这 7 层里，真正的架构骨架是 4 个核心角色：

- 主 agent
- 主消息队列
- 任务协议层
- 子 agent

## 四个核心角色

### 1. 主 agent

负责：

- 理解用户输入
- 决定是否进入普通聊天
- 决定是否创建任务
- 决定是否续跑或关闭任务
- 决定子 agent 结果如何转成用户可见响应

### 2. 主消息队列

负责：

- 接收 `user_message`
- 接收 `task_notification`
- 串行消费 event
- 持久化 event 状态
- 为恢复链提供调度锚点

### 3. 任务协议层

负责：

- 记录 `task / execution / notification`
- 调度 execution
- 把子 agent 结果映射回主控语义
- 维持主 agent 与子 agent 之间的结构化协议

### 4. 子 agent

负责：

- 执行专业任务
- 调用工具
- 生成结构化结果
- 不直接和用户对话

一句话：

`主 agent 做控制`
`消息队列做调度`
`任务层做协议`
`子 agent 做执行`

## 当前已经稳定下来的边界

当前系统已经比较明确地稳定在下面这些边界上：

- 用户输入先进入主队列，再决定是否进主图
- 子 agent 不直接写聊天消息，只发布 notification
- 主 agent 是唯一最终生命周期控制器
- 主图只做推理，不负责队列与恢复
- execution 是子 agent 队列的运行单位，task 是长期任务实体

## 当前文档配套关系

如果你要继续往下读：

- 主 agent 本身怎么设计：
  [main-agent-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-system-design/main-agent-design.md)
- 消息队列与恢复链怎么设计：
  [message-queue-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-system-design/message-queue-design.md)
- 子 agent execution queue 的细节：
  [task-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/task/task-design.md)
