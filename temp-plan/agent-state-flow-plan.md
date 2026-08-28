# Agent 状态流与账本收敛计划

更新时间：2026-08-28。

本计划来自对当前代码的静态审计，尚未进行代码修改和运行测试。目标不是重新设计整个 Graph，而是减少重复真源，补齐真实的恢复与提交边界。

## 当前判断

现有主链已经能够完成：

```text
输入 → 瞬时感知 → Context → 多轮思考/工具 → Final Composition
→ Output Guard → Turn 草稿 → 原子提交
```

主要问题是系统中同时存在四类容易被统称为“账本”的结构：

- Turn Version：节点恢复日志。
- Turn Execution Ledger：模型循环与工具执行记录。
- Turn Workspace：跨节点传递、等待提交的状态草稿。
- Trace：开发与 AI 排障所需的观测记录。

它们各自有价值，但当前部分信息重复保存，少数字段没有消费者，还有个别恢复边界存在正确性缺口。

## 收敛原则

- 一个事实只有一个权威拥有者；其他层只能保存引用、摘要或可重新生成的投影。
- Graph State 只保留本轮后续节点仍会消费的信息。
- Turn Workspace 只保留提交所需的 base、draft 和持久化对象引用。
- Turn Version 只服务故障恢复，不承担完整审计历史。
- ToolEffect / ChangeSet 是副作用事实真源；ToolMessage 只是当前模型协议的一部分。
- 调试信息优先进入 Trace，不因便于观察而进入恢复快照。
- 不为架构整齐增加新的统一大账本；先修复实际错误，再做字段收缩。

## P0：先修复正确性边界

### 1. 多工具调用的恢复游标

当前一个模型步骤可以返回多个工具调用。`toolNode` 在每个持久化工具完成后写入 checkpoint，但恢复点直接指向 `toolContextReloadNode`。

如果前一个工具已经完成、后续工具尚未执行时进程退出，恢复可能跳过剩余工具。

推进方向：

- 明确一批工具调用内的执行位置。
- checkpoint 必须能区分“整批完成”和“只完成到第 N 个”。
- 已完成副作用继续由 ToolEffect 幂等记录保护，不能因恢复而重复执行。
- 不增加第二套工具结果账本，优先在现有调用记录上增加最小游标或调整 checkpoint 时机。

用户影响：避免多文档、多对象操作只完成一部分，而 Agent 误以为整批已经结束。

### 2. 明确撤回的真实范围

当前撤回主要恢复 MemoryManager，并撤回消息、Artifact、Self Experience；Persona、Memory Slots、LifeState、Interaction Observation 和工具 ChangeSet 不会一起恢复。

需要先确定产品语义：

- 如果只撤回可见聊天，应改成明确的“撤回消息/回复”，不要暗示完整 Turn 回滚。
- 如果要撤回完整 Turn，则必须定义 Persona、Mood、LifeState、Observation 和可逆工具副作用的恢复规则。
- 不可逆副作用必须明确保留并向用户说明，不能伪装成已完全撤回。

用户影响：避免界面显示已撤回，但 Agent 情绪、人格状态或文档内容仍然受到该轮影响。

## P1：消除重复真源

### 1. 收敛 Turn 生命周期

当前同一生命周期同时存在于 Graph State 和 `TurnWorkspace.draft.lifecycle`，每个节点需要读取任意一份并同步写回。

同时还有另一套 `understanding / acting / answering` 执行阶段。后者被 Output Guard 实际使用，前者主要用于描述过程。

推进方向：

- 运行控制只保留一个权威状态。
- 若 forming/observing/revising 等阶段仅用于展示和诊断，则改由 Trace 记录。
- 清理当前没有实际读写闭环的 `interrupted`、`revisedObservationBatch` 等字段。

维护影响：新增节点或恢复路径时，不再需要同步两套生命周期语言。

### 2. 合并重复模型步数

`llmCalls` 与 `TurnExecutionLedger.modelStep` 当前随每次模型调用同步增长。

推进方向：只保留一个模型步骤计数，并让工具 Context、循环上限和 Trace 统一读取它。

维护影响：避免恢复后两个计数不一致，降低工具结果归属判断难度。

### 3. 收缩内部认知的双份保存

当前内部认知既作为 `AIMessage` 进入 messages，又抽取为 `reasoningSegments`。Final Composition 主要读取后者，但 Turn Version 会同时保存两份。

推进方向：

- `reasoningSegments` 作为内部认知文本的主要投影。
- messages 只保留工具调用协议和下一步模型确实需要的消息。
- 带 tool call 的 AIMessage 不能简单删除；没有工具协议价值的纯认知消息可以在被提取后裁剪。

用户影响：长工具链的恢复快照和 Context 不再因重复思考文本快速膨胀。

### 4. 明确工具结果各层职责

保留以下必要边界：

- ToolMessage：紧邻工具调用的原始模型协议。
- Tool Context：后续推理仍需使用的精简证据。
- Execution Ledger：循环控制、失败重试和未解决动作。
- ToolEffect / ChangeSet：持久化副作用事实。
- Trace：诊断过程。

需要收缩：

- `TurnWorkspace.draft.changeSet` 当前写入后没有正式消费者，应删除或只保存必要引用。
- `activeToolTranscriptIds` 与 pending context 中的 transcript IDs 职责重叠，应确认能否由单一消费状态推导。
- Workspace 中的 durable receipt 只保留提交和 UI 构建必需字段；可从数据库按 Turn 查询的内容不重复保存完整副本。

维护影响：新增图片、地图或其他副作用工具时，不需要同时理解和修改过多结果容器。

### 5. 移出无业务消费者的运行字段

优先确认并清理：

- `runtimeEvent`：当前写入但主要逻辑读取的是 `turnInput`。
- `instantPerception`：当前仅作为观测快照，Trace 已能承担该职责。
- `promptSectionManifest`：如果只用于调试和成本分析，应进入 Trace/Context 审计记录，而不是恢复状态。

## P1：统一 Turn 输入快照

Runtime 已在 Turn 开始时捕获 Persona、Memory Slots、Self Core 和 LifeState，但 Instant Perception 与 ContextNode 仍会分别读取实时 MemoryManager。

推进方向：

- Turn 开始时一次性形成输入快照。
- 快照包含短期对话、Persona、Mood/Slots、LifeState 和必要的主体经历。
- Graph 节点只读取该快照以及本轮 draft，不在节点中重复读取可能变化的全局状态。
- 恢复执行继续使用原 Turn 的输入快照，不重新吸收后续状态。

用户影响：同一轮思考中的情绪判断、历史上下文和最终表达基于一致的起点。

## P1：补齐主体经历闭环

当前 ContextNode 会读取 Self Experience、承诺和未解决关切，但正式运行链中尚未发现 `commitTurnExperience()` 的生产入口。

推进方向：

- 与 `thinking.md` 的 Post-Turn Observer 统一设计，不在主推理过程中直接写正式长期状态。
- Observer 从已完成 Turn、工具证据和 LifeState 候选中提取 Self Experience 候选。
- 通过明确的提交策略写入，并保留 Turn、证据和 revision。
- 在生产入口完成前，不把 Self Experience 描述成已经闭环的能力。

用户影响：Agent 的承诺、关切和重要经历能够真正跨轮延续，而不是只有读取框架没有内容来源。

## P2：降低恢复日志成本

当前每个 Graph 节点执行前都会保存完整状态。随着 messages、reasoning、工具证据和 Workspace 增长，同一 Turn 会产生多份越来越大的 JSON 快照。

在完成 P0 后，根据真实数据推进：

- 统计单 Turn 的 checkpoint 数量、总字节数和写入耗时。
- 优先只保留 Turn 初始、持久副作用完成、Final 候选和 ready-to-commit 等关键恢复边界。
- 对纯计算且可安全重跑的节点，不必保存完整 checkpoint。
- 为已经完成的 Turn Version 设计保留策略；不要无限保存所有中间全量快照。

用户影响：多轮工具任务减少数据库写入等待，长期使用时数据库不会被恢复快照快速撑大。

## P2：名称与职责整理

- `memoryNode` 实际职责是组装本轮对话提交草稿，可在相关改动时更名，避免继续承载长期记忆逻辑。
- `TurnExecutionLedger` 应明确为“模型循环与工具执行账本”，不要称为整个 Turn 的完整账本。
- Event 状态、Turn 状态、Graph 恢复点和内部认知阶段分别属于队列、对话、恢复和推理层，不再互相代替。

## 暂不推进

- 不建立包含所有 Prompt、人格、工具、提交和 Trace 的超级 Turn Ledger。
- 不为了减少字段而合并 Message、Memory、Observation 和 ToolEffect 的不同业务真源。
- 不在缺少体积与延迟数据时直接实现复杂增量快照。
- 不重新拆分整个 Graph；优先通过删除重复字段和修正边界逐步收敛。

## 下一台设备建议执行顺序

1. 为多工具调用补齐可恢复的执行位置，并增加崩溃边界测试。
2. 确认撤回语义并记录实际覆盖范围。
3. 收敛双份 Lifecycle 与重复模型步数。
4. 清理确定无消费者的状态字段。
5. 收缩 reasoning、Tool Context 和 Workspace 的重复副本。
6. 统计 Turn Version 的实际体积与写入耗时，再决定 checkpoint 收缩方式。
7. 与 Post-Turn Observer 一起接通 Self Experience。

