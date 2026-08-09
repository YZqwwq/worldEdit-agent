# Agent 单轮工作区与提交契约

## 定位

本文是修改主 Agent 单轮运行链路前必须阅读的架构契约。

它只说明：

- 一轮运行中各层负责什么。
- 什么属于临时工作态。
- 什么必须原子提交。
- 什么只能在提交后执行。
- 中断、失败和恢复必须满足什么语义。
- 

本文不复制 TypeScript 字段、数据库列和阶段性迁移步骤。

（准确结构以代码类型、Entity 和测试为唯一事实来源。）

## 目标

一次 Agent 对话必须形成唯一、原子、幂等且可恢复的提交闭环，同时允许 Scene、Mood、WorldFocus 和 Persona 在提交前影响本轮主模型判断。

```text
已提交状态
  -> 创建 TurnWorkspace
  -> Graph 在工作区中计算和推理
  -> 形成唯一 GraphTurnResult
  -> Runtime 构造 TurnCommitPlan
  -> TurnCommitter 原子提交
  -> 刷新缓存并发布最终结果
```

## 核心规则

1. **计算与持久化分离。** Graph 节点产生 Draft 或 Patch，不直接更新数据库和全局 Manager。
2. **工作态可以影响本轮。** 后续节点读取 `overlay(committedState, workspaceDraft)` 得到有效状态。
3. **最终回复来源唯一。** 只有 Graph 最终主 Agent 回答可以成为 `finalResponse`。
4. **流式文本不是事实。** chunk 只用于预览，不能直接决定 Message、Memory 或最终 `done`。
5. **提交所有者唯一。** 对话事实和 Agent 内部状态只能由 `TurnCommitter` 正式提交。
6. **事务保持短暂。** 模型、网络、总结和工具调用发生在事务外；事务只做校验与持久化。
7. **失败不产生半轮状态。** 未完成工作区不得污染 Memory、Persona、Mood、Scene 或 WorldFocus。
8. **工具副作用独立负责。** 文档修改、外部 API 和子 Agent 执行使用各自的事务、版本和幂等协议。



## 分层职责


| 层                   | 职责                        | 禁止事项               |
| ------------------- | ------------------------- | ------------------ |
| Event/Queue         | 持久化输入事件、排队、选择下一事件         | 决定最终回复内容           |
| Turn                | 标识一次运行及其状态、提交和撤回边界        | 分散保存领域状态           |
| Graph               | 感知、推理、工具循环、生成 Draft 和最终回答 | 直接持久化 Agent 内部状态   |
| Runtime             | 管理运行、中断和流式预览，校验 Graph 结果  | 用所有流式 chunk 拼出权威回复 |
| Effects             | 描述待提交动作及其阶段和幂等语义          | 在无事务循环中逐项裸写        |
| TurnCommitter       | 校验版本并原子提交对话事实和内部状态        | 执行外部模型或网络请求        |
| After-commit/Outbox | 刷新缓存、通知 UI、调度后续任务         | 改写已经提交的事实          |
| Tool                | 对自己的领域副作用负责               | 假装随对话 Turn 自动回滚    |




## 工作区契约

`TurnWorkspace` 是单轮私有状态，至少按职责保存以下聚合：

- 运行身份、输入快照和基准版本。
- Scene、User Mood、World Focus、Persona 和 AI Mood Draft。
- 对话 Memory Draft，以及必要时预计算的 Stage Draft。
- Interaction Observation Draft。
- 工具执行账本、结果摘要和外部副作用引用。
- 最终回复候选、Graph 退出状态和诊断摘要。

工作区中的派生策略、完整工具 transcript 和调试信息默认不持久化。具体字段必须从对应代码类型读取，不能重新抄写到本文。

## 层间产物



### GraphTurnResult

Graph 向 Runtime 返回一个结构化结果，表达：

- 本轮身份和退出状态。
- 唯一 `finalResponse`，或明确没有最终回复。
- 允许进入提交阶段的领域 Patch。
- Memory、Observation 和任务生命周期意图。
- 工具行动摘要与证据引用。
- 基准版本和必要诊断。

GraphTurnResult 不包含数据库写入结果，也不发送最终 `done`。

### TurnCommitPlan

Runtime 将 GraphTurnResult 转换为唯一提交计划，负责：

- 验证结果属于当前 Event、Turn 和 Run。
- 验证 `finalResponse` 来自主 Agent 最终回答，而不是内部模型或工具循环中间文本。
- 根据结束状态筛选允许提交的 Patch。
- 为提交动作分配幂等键和执行阶段。
- 生成 commit manifest、恢复信息和 after-commit Outbox。

流式预览缓冲不得进入 `TurnCommitPlan.finalResponse`。

## 提交边界



### 原子提交

以下内容属于一次对话的同一数据库提交边界：

- 权威 AI Message 及其与 User Message、Turn、Event 的关联。
- Turn 和 Event 的终态、时间、错误及 commit manifest。
- 本轮接受的 Memory 变化和 Stage 变化。
- 本轮接受的 Persona 与 Memory Slot Patch。
- 本轮 Interaction Observations。
- 与生命周期直接回复不可分割的 Task 状态变化。
- 用于幂等、恢复和撤回的版本及反向信息。

任一 required 写入失败，整个提交回滚。

### 提交后执行

以下动作由 after-commit Outbox 驱动：

- 刷新或失效进程内 Manager 缓存。
- 向 Renderer 发送 canonical `done` 并校正流式预览。
- 发布已提交通知。
- 启动或继续子 Agent。
- 更新非关键 Trace、Tool Usage Stats 和 Quick Access 统计。
- 安排后续 Stage 或后台人格任务。

这些动作必须可重试，并以 commit ID 和动作类型去重。

### 独立领域副作用

文档编辑、文件操作、外部 API、联网搜索和已执行的子 Agent 工作不属于对话事务。Turn 只提交它们的调用 ID、目标、结果、版本或请求引用。撤回对话不能假装撤回这些事实。

## 结束状态语义


| 状态                         | 对话事实                      | Agent 内部 Draft                                     | UI 终态            |
| -------------------------- | ------------------------- | -------------------------------------------------- | ---------------- |
| `completed`                | 提交权威回复和完整 Turn            | 提交允许的 Memory、Persona、Slots、Observation             | canonical `done` |
| `interrupted`              | 可保存用户已看到的部分回复并标记中断        | 默认丢弃人格和感知 Draft，不生成正常闭合 Stage                      | `interrupted`    |
| `failed`                   | 保留原始用户消息和失败记录，不保存 AI 最终回复 | 全部丢弃                                               | `stream_error`   |
| `lifecycle-controlled`     | 同样创建 Turn，提交用户/AI 回复与任务决定 | 只提交该路径明确产生的状态                                      | canonical `done` |
| `background-persona-stage` | 不写普通聊天回复                  | 只提交白名单 Persona/阶段产物，禁止污染用户 Mood、Scene 和 WorldFocus | 后台状态通知           |


如果需要改变某个状态的提交白名单，应先修改本节语义和对应测试，不能在节点内临时决定。

## 幂等、恢复与撤回

- `eventId` 是一轮运行的幂等根，只能产生一个 Turn 和一个成功 commit。
- Message、Memory、Observation、Task Trace 和 Outbox 动作必须有稳定来源关联或幂等键。
- 所有可变聚合在提交时执行 revision 校验。
- Graph 未完成时直接丢弃工作区。
- 数据库事务失败时整体回滚。
- 提交成功但 after-commit 未完成时，从 Outbox 继续执行。
- 进程内缓存状态不确定时，以数据库为准重新加载。
- 恢复审计必须覆盖 `processing` 和可能半提交的 `failed` Event。
- 撤回应依据 commit manifest 或 inverse effects；Memory checkpoint 不能单独代表整轮状态。
- 工具外部副作用通过各自版本历史或撤销协议处理。



## 当前迁移目标

当前实现需要逐步消除以下结构性问题：

1. Runtime 将整个 Graph 的流式事件累加为 `fullText`。
2. 感知、Persona 和 Memory 节点在 Graph 内直接持久化。
3. Effects 按数组逐项执行，没有统一数据库事务。
4. 正常、中断和生命周期回复使用不同提交路径。
5. Event 完成发生在 Turn/Effects 提交边界之外。
6. 现有恢复与撤回主要覆盖 Memory，未覆盖全部 Agent 内部状态。

具体迁移步骤应写入开发计划或代码任务，不继续扩充本文。

## 代码事实来源

工作时应直接读取以下代码，而不是依赖本文中的字段副本：

- Graph State 与工作区：`state/messageState.ts`
- Graph 路由：`agentReactSystem.ts`
- Event、Effect 与任务协议：`@share/cache/AItype/states/taskLifecycleState.ts`
- Turn 状态：`@share/cache/AItype/states/mainAgentTurnState.ts`
- Memory：`manager/memory/MemoryManager.ts` 及 Memory Entity
- Memory Slots：`@share/cache/AItype/states/memorySlots.ts`
- Persona：`@share/cache/AItype/states/personalState.ts` 及 Persona Entity
- Runtime：`runtime/mainAgentChatRuntimeService.ts`
- Orchestration 与 Effects：`runtime/orchestration/`
- Event/Turn 持久化：`runtime/queue/`、`runtime/mainAgentTurnService.ts`

未来建立 `TurnWorkspace`、`GraphTurnResult`、`TurnCommitPlan` 和提交 Effect 类型后，应在此更新路径，不复制其内部字段。

## 修改前检查

新增节点、状态或 Effect 前，只需回答：

1. 它属于输入、工作区 Draft、原子提交、after-commit，还是独立工具副作用？
2. 本轮后续节点是否需要通过 overlay 读取它？
3. 五种结束状态分别如何处理？
4. 它的幂等键和基准版本是什么？
5. 写入失败是否应回滚整轮？
6. 崩溃后如何恢复，撤回时如何处理？
7. 是否可能把内部模型、工具或调试文本误当作最终回复？

无法回答以上问题时，不得在 Graph 节点中直接增加持久化。

## 最小验收不变量

- UI、Message、Turn 和 Memory 使用同一个权威最终回复。
- Mood 和 Persona 能影响本轮，但失败后不会污染已提交状态。
- 任一 required 写入失败都不会留下半提交 Turn。
- 重试不会产生重复 Message、Memory、Observation 或任务动作。
- 生命周期直接回复能被下一轮短期 Context 承接。
- 后台人格阶段不会修改用户感知状态。
- 提交前、事务中和提交后崩溃均有确定恢复路径。
- 工具外部副作用不会被错误声明为已随 Turn 回滚。

