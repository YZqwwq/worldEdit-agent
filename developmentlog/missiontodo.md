> 状态说明（2026-04-03）
>
> 本文件是项目级任务池，覆盖 AI、记忆、人格、UI、缓存等多类待办。
> 它不是当前实现真相，也不是只面向 AI-agent runtime 的单一任务清单。
>
> 文档类型：
> - `项目级待办`
> - 粗粒度 backlog
> - 可保留阶段性条目，但需要后续逐步整理为更稳定的任务分类

middle:
文件：aiService.ts
任务：完善富文本流式传输方式改为 fullcontent


high：
文件：aiservice/prompt / contextNode / AIagent-design.md
任务：完善主 agent 的人格 prompt 体系
说明：本轮已完成运行时 prompt 正式化。当前运行时 prompt 已迁入 `src/main/services/aiservice/prompt`；`character` 在 Electron 启动时初始化到 `userData/aiservice/prompt/character.md`，`mood / expression` 保持内部静态控制，不向用户开放。

后续任务：
1. 为 character prompt 增加 IPC 读写接口，供后续设置面板直接编辑
2. 将 `expression` 中的高风险规则补成输出后置 validator，而不只依赖 prompt
3. 把工具结果的用户态摘要与内部原始结果进一步分离，减少内部结构泄露
4. 将人物引用承接能力从纯 prompt 提醒升级为运行时实体引用槽
5. 评估是否需要给不同任务场景配置不同的 mood 子模板


hight：
加入短期记忆

加入中长期记忆

hight：
加入人格指标
人格化


midde：
静态文件的加入缓存系统，快速读写


high：
文件：mainAgentDispatchService.ts / mainAgentEntryService.ts / AIagent-design.md
任务：重构主 agent 消息队列消费模型
说明：当前主队列仍是“出队即处理”的内存串行执行器，后续要评估并推进为显式事件状态机模型。

拆分任务：
1. 梳理当前主 agent 队列真实工作流
2. 设计 event 状态流转：`queued -> processing -> handled / failed`
3. 评估是否需要加入 `acknowledged / archived / retryable` 扩展状态
4. 明确“主 agent 取消息”与“消息真正出队”的分离时机
5. 明确用户消息与 task notification 的统一事件状态表达
6. 设计 UI 所需的队列可视状态映射
7. 设计崩溃恢复、重复消费、幂等处理策略
8. 决定是否先做内存状态机，再升级为持久化事件队列

当前判断：
- 现状优点：实现轻、单进程串行简单、适合快速跑通
- 现状缺点：缺少事件级 processing/handled 状态，不利于恢复、重试、审计和精确 UI 展示
- 目标方向：让消息队列只服务主 agent，但每条 event 都有明确生命周期，而不是依赖隐式“取出即消费完成”


high：
文件：taskContinuationService.ts / subAgentExecutionQueueService.ts / subAgentDispatcherService.ts / AIagent-design.md
任务：主子 agent 执行链彻底解耦
说明：当前已经完成“任务登记”和“子 agent execution”拆分，子 agent 改为经独立 execution queue 启动，不再直接挂在主 agent tool 调用链上。

已完成：
1. 新增 `SubAgentExecutionQueueService`
2. `TaskContinuationService` 改为只登记 execution 并 enqueue
3. 启动恢复改为统一走 execution queue
4. 用空 `RunnableConfig` 上下文隔离父级 signal / callbacks 传播
5. 新增 `TaskNotificationDispatchBridge`，切断 task 层对 `MainAgentEntryService` 的直接依赖

后续拆分任务：
1. 为 execution queue 增加显式状态与 trace
2. 审查是否还有其他“主图里直接拉起后台执行”的路径
3. 将 `MainAgentLifecycleControlService` 拆为 decision / action 两层
4. formalize `failed / cancelled / retryable` 的关闭与重试策略
5. continuation handler 注册化
6. 将 bridge 的配置从隐式 service constructor 收敛到显式 bootstrap


high：
文件：mainAgentToolkit / ai-utils/tools / child-agent-system / AIagent-design.md
任务：拆分工具体系，统一主 agent 与子 agent 的基础工具使用方式
说明：所有基础工具应成为通用工具层，主 agent 和子 agent 都可以调用；子 agent 的定位不是“唯一能做某件事”，而是“在某一类任务上更专业的 skill 执行器”。

拆分任务：
1. 将当前混在主子 agent 调用链中的工具按职责拆分为通用基础工具
2. 明确哪些工具允许主 agent 与子 agent 共用
3. 明确哪些能力属于子 agent 的专业 skill，而不是工具专属权限
4. 梳理“主 agent 也能编辑人物描述，但子 agent 更专业、更长、更具文学性”的提示与协议边界
5. 收敛主 agent 调用子 agent 与直接调用工具的判定标准


high：
文件：child-agent-system / taskExecutionService / memory / AIagent-design.md
任务：明确子 agent 的上下文方案与持久化策略
说明：需要统一定义子 agent 运行时上下文、pendingContext、execution 输入输出上下文，以及是否需要独立的持久化记忆。

拆分任务：
1. 盘点当前子 agent 已有上下文字段与真实来源
2. 明确哪些上下文属于单次 execution
3. 明确哪些上下文属于 task 级别续跑状态
4. 讨论子 agent 是否需要独立持久化记忆
5. 如果需要，明确和主 agent memory 的边界与同步策略


middle：
文件：renderer / task monitor UI / chat UI
任务：调整前端 UI，丰富功能
说明：围绕主队列、子 agent execution、notification、inspection 和 trace 的当前架构，继续增强前端可视化与交互体验。

拆分任务：
1. 丰富 task monitor 展示
2. 丰富 execution inspection 展示
3. 优化主聊天区与任务状态联动
4. 增加更多 lifecycle / queue / notification 可视状态
5. 增强调试与观测 UI
