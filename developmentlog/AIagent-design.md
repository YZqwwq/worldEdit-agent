# AI Agent 架构说明

> 状态说明（2026-03-24）
>
> 本文件只描述当前项目的有效架构定义，以及仍需继续完成的任务列表。
> 不再保留旧版评审过程、阶段性收口记录或迭代叙事。

## 目标

当前项目的目标是构建一个：

`单主会话`
`主 agent 控制`
`可委派子 agent`
`后台执行长任务`

的 AI 助手系统。

核心原则只有三条：

1. 用户只和主 agent 通信
2. 子 agent 只和主 agent 通信，不直接面向用户
3. 主 agent 是唯一能创建、续跑、关闭子 agent 生命周期的控制器

---

## 主链

当前有效主链如下：

`renderer(Chat UI)`
`-> preload / IPC`
`-> AIService`
`-> MainAgentEntryService`
`-> MainAgentDispatchService`
`-> 按事件类型分流`
`   - user_message -> user input router / chat runtime`
`   - task_notification -> task notification consumer`
`-> effect applier`
`-> message / task / trace / memory 等持久化`

这条主链代表以下事实：

1. 用户消息和子 agent 通知共享同一个 dispatch 入口
2. 主 agent 一次只处理一条输入
3. task notification 不再走普通聊天主图主路径

---

## 分层

### 1. 前端聊天层

负责：

- 展示消息
- 接收流式输出
- 展示 graphlog
- 展示 task trace / dispatch 状态
- 展示子 agent execution 的输入 / 输出 inspection

### 2. Electron 接入层

负责：

- IPC 边界
- 暴露聊天、任务、memory、worldbuilding 接口

### 3. 主 agent 入口与分发层

负责：

- 接收 `user_message`
- 接收 `task_notification`
- 统一排队
- 串行消费
- 按来源分流到对应处理器

当前关键对象：

- `MainAgentEntryService`
- `MainAgentDispatchService`
- `processMainAgentEvent`

### 4. 主 agent 聊天运行层

负责：

- 驱动 LangGraph 主图
- 输出流式回复
- 将运行结果转成 effect

当前关键对象：

- `MainAgentChatRuntimeService`
- `agentReactSystem`
- `MainAgentEffectApplierService`

### 5. 任务与后台编排层

负责：

- task 状态管理
- execution 管理
- 子 agent 执行调度
- notification 写入与消费
- trace
- execution inspection snapshot 归一化
- 启动恢复

当前关键对象：

- `taskService`
- `taskExecutionService`
- `taskNotificationService`
- `subAgentDispatcherService`
- `taskTraceService`
- `taskRecoveryService`

### 6. agent graph 层

负责：

- persona policy
- task lifecycle 判断
- task queue 决策
- context 构建
- 模型调用
- 工具调用
- memory 写入

当前主图节点：

- `personaNode`
- `taskLifecycleNode`
- `taskCoordinationNode`
- `contextNode`
- `llmCall`
- `toolNode`
- `memoryNode`

### 7. 记忆与人格层

当前仍与主 agent 绑定。

后续子 agent 可以拥有自己的记忆模块，但当前阶段不将记忆层作为主优先级重构对象。

---

## 通信边界

## 1. 用户 -> 主 agent

用户只发送自然语言。

用户输入在系统内部只应被主 agent 解释为以下几类语义：

- 普通聊天
- 创建子任务
- 为当前任务补充参数
- 确认关闭任务
- 取消任务

用户不应直接感知以下内部对象：

- execution
- notification
- pendingContext
- dispatcher
- 子 agent payload schema

## 2. 主 agent -> 子 agent

主 agent 不应以自由对话方式驱动子 agent，而应通过结构化任务动作驱动：

- `create_child_task`
- `start_execution`
- `continue_execution`
- `cancel_execution`

## 3. 子 agent -> 主 agent

子 agent 通过结构化协议回报，而不是直接产出用户消息。

当前协议语义：

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

- `summary / message` 是通用字段
- `pendingContext` 用于补参续跑
- `details` 用于 executor-specific 扩展信息

---

## 生命周期模型

当前推荐的任务生命周期状态：

- `active`
- `running`
- `pending_main_ack`
- `awaiting_user_input`
- `awaiting_user_confirmation`
- `done`
- `cancelled`

当前推荐的生命周期原则：

1. 子 agent 可以报告完成，但不能自行把任务置为 `done`
2. 子 agent 可以报告需要补参，但不能直接向用户要信息
3. 主 agent 可以创建 execution，也可以决定是否续跑 execution
4. 主 agent 是唯一能把任务关闭为 `done / cancelled` 的控制器
5. 用户的“结束吧 / 不用了 / 取消”一类输入，必须先被主 agent 解释，再转成生命周期动作

当前已落地的基础约束：

- task status 允许迁移关系已经接入代码约束
- `pending_main_ack -> awaiting_user_input / awaiting_user_confirmation` 已通过 notification consume 固化
- 子 agent 的 `cancelled` 回报不再直接把 task 关闭为最终 `cancelled`
- 最终 `done / cancelled` 仍由主 agent 显式动作落地

这意味着：

`子 agent 负责执行`
`主 agent 负责生命周期控制`

---

## 当前架构判断

当前架构已经明确了下面几件事：

1. 主链入口已经统一
2. 主子 agent 通信已经开始协议化
3. 生命周期控制权属于主 agent
4. 启动恢复已接入主链启动流程
5. character_editor 的任务创建与续跑已进入 application service

当前已经落地的关键收口：

- `MainAgentEntryService -> MainAgentDispatchService -> processMainAgentEvent -> effect applier` 已形成控制面主链
- user message 与 task notification 共享同一队列，task notification 不再伪装成普通聊天输入
- 生命周期迁移表已经开始变成代码规则，而不只是文档约定
- 子 agent 的取消不会再直接越权关闭任务，主 agent 保留最终关闭权
- 子 agent 跟踪展示已收敛为 execution 级 inspection，前端查看的是每次 execution 的输入 / 输出，而不是图内每个节点

当前真正还没彻底完成的，不再是“统一入口”，而是：

- 用户输入路由收敛
- 生命周期动作矩阵收敛
- continuation 扩展点正式化
- 取消 / 重试语义补齐
- prompt 构建层继续拆分
- 观测边界继续清理

---

## 仍需完成的任务列表

下面只保留当前仍需继续完成的任务。

## 当前任务优先级

1. 用户输入路由收敛
2. continuation registry
3. 取消 / 重试语义
4. prompt 构建层拆分
5. 观测体系分层

## P0

### 1. 完善用户输入路由层

目标：

让用户输入在进入普通聊天主图前，被稳定分流为：

- 普通聊天
- 创建子任务
- 补参续跑
- 确认关闭
- 取消任务

当前还需要补：

- 创建子任务与普通聊天边界继续精炼
- `awaiting_user_confirmation` / `awaiting_user_input` 下的控制语义继续稳定
- 把“关闭确认”和“取消任务”从普通聊天回答里进一步剥离成显式控制动作

### 2. 把生命周期迁移表升级为正式动作矩阵

目标：

把 task status 的允许迁移关系从“静态表”继续推进到“带动作语义的正式规则”。

当前已完成：

- 允许迁移关系已接入代码校验
- notification consume 已通过状态规则驱动 `pending_main_ack -> awaiting_*`

至少明确：

- `active -> running`
- `running -> pending_main_ack`
- `pending_main_ack -> awaiting_user_input`
- `pending_main_ack -> awaiting_user_confirmation`
- `awaiting_user_input -> running`
- `awaiting_user_confirmation -> done`
- `* -> cancelled`

当前还需要补：

- 每条迁移对应的触发动作、控制者和副作用
- `confirm_close`、`cancel_task`、`retry_execution` 的正式动作语义
- 非法迁移的统一错误呈现与 trace

### 3. 固化“只有主 agent 能关闭任务”的实现约束

目标：

把这条规则从“当前行为”提升为“明确约束”：

- 子 agent 不能提交 `done`
- 子 agent 不能提交最终 `cancelled`
- 主 agent 才能提交任务最终关闭

当前已完成：

- 子 agent 的 `cancelled` 已调整为“请求主 agent 确认关闭”，而不是直接终结 task
- `confirm_close_task` 已收紧为仅在 `awaiting_user_confirmation` 阶段可关闭

当前还需要补：

- 所有关闭路径统一经过同一套 close / cancel policy
- 失败后是否进入 retry、ask_user 还是 close，需要主 agent 明确决策

## P1

### 4. 正式化 continuation registry

目标：

把当前 continuation 扩展点整理为正式注册表，而不是继续把 executor-specific 逻辑集中在单一 service 中。

需要完成：

- `ContinuationHandler` 接口
- `ContinuationRegistry`
- executor-specific handler 分离

### 5. 继续标准化主子 agent 协议的扩展字段

目标：

在保留当前统一 payload 的前提下，继续约束 `details` 字段中哪些内容是标准扩展、哪些内容是 executor 私有扩展。

### 6. 补齐取消与重试语义

目标：

把下面几类动作都落成正式生命周期行为：

- 用户取消任务
- 用户要求重试
- 子 agent 报告失败后重启 execution

## P2

### 7. 重构 prompt 构建层

目标：

继续拆分 `contextNode`，把 context 构建收敛成明确的 builder / assembler。

### 8. 分层观测体系

目标：

继续明确：

- `graphlog` 用于图调试
- `taskTrace` 用于任务时间线
- `execution inspection` 用于查看子 agent 的单次输入 / 输出
- 其他 inspection 数据不混入这三者职责

### 9. 为通信协议与生命周期补测试矩阵

至少覆盖：

- 创建任务
- 补参续跑
- 子 agent 完成
- 用户确认关闭
- 用户取消任务
- 子 agent 失败后的重试

---

## 当前推荐结论

当前阶段最值得优先继续做的是：

1. 用户输入路由收敛
2. continuation registry
3. 取消 / 重试语义
4. prompt 构建层拆分

一句话总结：

`当前已经不是入口问题`
`而是要把主子 agent 通信、生命周期动作和控制权边界彻底做成稳定架构`
