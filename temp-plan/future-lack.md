# Agent 运行与记忆系统缺陷清单

## 文档用途

本文档记录 2026-08-07 对主 Agent 运行闭环和记忆闭环的审计结果，作为进入下一阶段前的稳定性收口清单。

当前结论：

- 正常成功路径基本可用。
- 短期记忆、待归档缓冲、Stage 和 Recall 的正常路径已连通。
- 异常提交、中断、直接生命周期回复、撤回与后台人格阶段尚未形成完整一致性闭环。
- 在 P0 问题收口前，不建议继续扩展 Context Planner 或长期重要事件系统。

## P0：运行闭环必须修正

### P0-1：最终回复没有唯一权威来源

#### 当前行为

- `mainAgentChatRuntimeService` 累加所有 `on_chat_model_stream` 事件形成 `fullText`。
- 工具循环中可能存在多次主模型调用，中间调用的文本也可能进入 `fullText`。
- `memoryNode` 只保存 LangGraph State 中最后一条 AIMessage。

#### 影响

- 用户看到并被持久化的回复，可能与短期记忆中的 AI 回复不一致。
- 工具调用前的中间文本可能被当作最终回复保存。
- 后续 Context、Recall 和聊天记录可能对同一轮形成不同理解。

#### 修正方向

- 将最终 LangGraph State 中“最后一条不含工具调用的 AIMessage”定义为本轮唯一权威回复。
- 流式事件只负责实时展示，不直接决定最终持久化内容。
- 对中间工具决策文本明确选择隐藏、临时展示或分类展示，不混入最终回复。

#### 验收条件

- 无工具、单工具和多轮工具循环中，UI 最终文本、Message 表、Turn AIMessage 和短期记忆内容完全一致。

### P0-2：Agent 图内副作用与事件提交职责分裂

#### 当前行为

LangGraph 节点在 Event/Turn 提交完成前直接写入：

- MemoryManager。
- Persona State。
- AI Mood / User Mood。
- Scene / WorldFocus Memory Slots。
- Interaction Observations。

事件编排层同时又承担 Message、Turn、Trace 和部分 Memory effect 的提交。

#### 影响

- 图运行成功、但后续 Message 或 Turn 保存失败时，会出现部分 Agent 状态已写入、事件却失败的分叉。
- 启动恢复只处理仍处于 `processing` 的事件；已立即标记为 `failed` 的部分提交不会再被补偿。
- 撤回只恢复 MemoryManager checkpoint，不恢复 Persona、Mood、Scene、WorldFocus 和 Observation。

#### 修正方向

- 确立单一提交所有者：图节点负责计算结果，Turn/Event 提交层负责持久化。
- 若暂时不迁移全部副作用，至少在本轮任何失败路径中立即恢复 Memory checkpoint。
- 明确 Persona/Slots 是否参与轮次撤回；如果参与，将它们纳入同一 checkpoint，如果不参与，需在产品语义中明确。

#### 验收条件

- 模型失败、Memory 保存失败、AI Message 保存失败、Turn 更新失败和进程崩溃后，均不留下无对应已提交 Turn 的记忆状态。

### P0-3：正常、中断和生命周期直接回复的记忆提交不一致

#### 当前行为

- 正常完成由 `memoryNode` 写入记忆。
- 中断路径由 `sync_memory_messages` 补写。
- 生命周期控制直接返回时，不创建 Chat Turn，也不写入短期记忆。
- 失败路径可能已写用户消息、已写整轮，或完全未写。

#### 影响

- 中断恰好发生在 `memoryNode` 完成后时，补写可能再次追加同一轮。
- 目前基于“最后一条角色+内容”的去重无法稳定防止整轮重复。
- 生命周期直接回复不进入下一轮短期 Context；Recall 也可能只找到用户消息，找不到 `lifecycle_control` 的 AI 回复。

#### 修正方向

- 增加一个幂等的“提交对话轮”入口，统一处理 normal、interrupted 和 lifecycle-controlled 路径。
- 去重依据使用 `eventId/turnId/messageId`，不使用消息正文推测是否重复。

#### 验收条件

- 中断发生在模型输出前、输出中、Memory 写入前和 Memory 写入后时，每轮最多只存在一份用户/AI 记忆。
- 任务取消、状态询问、补参提示和任务关闭回复可以被下一轮自然承接。

## P1：记忆与特殊运行路径稳定性

### P1-1：MemoryManager 在事务成功前修改进程内状态

- Stage 归档时先修改 `longTerm`、`archiveBuffer`、`lastStageIndex` 和计数器，后执行数据库事务。
- `addMessage` 也是先修改内存数组，后保存数据库。
- 事务失败后，内存状态与数据库可能分叉。

修正方向：先构造 next state，在事务成功后再替换当前内存状态，或失败时显式恢复事务前快照。

### P1-2：Runtime 硬上限可能生成不闭合的纯 User Stage

- 硬上限触发后会向前寻找 AI 消息作为结尾。
- 如果保护窗口内完全没有 AI 消息，当前算法仍会归档第一条 User 消息。

修正方向：将“无 AI 闭合消息”设为显式 incomplete 异常片段，或保留缓冲并使用独立的异常上限；不应将单条 User 消息标记为正常闭合 Stage。

### P1-3：后台人格阶段会运行普通用户感知链路

- `backgroundPersonaStage` 只在 `memoryNode` 阻止写入对话记忆。
- Scene、UserMood、WorldFocus 和 Persona detector 仍会把后台合成任务文本当作当前用户输入。
- 这可能污染用户情绪、场景和历史世界焦点。

修正方向：为后台人格阶段使用专用路由，至少跳过 Scene、UserMood 和 WorldFocus；人格更新只使用明确的后台阶段产物。

### P1-4：长期记忆尚未形成人格化重要事件闭环

当前已闭环：

```text
短期消息 -> pending archive -> Stage -> Recall
```

当前未闭环：

- Stage 会自动合并到滚动 `memorySummary`，不是由 Agent 依据人格选择的独立重要事件。
- `userProfile` 会生成和持久化，但不进入 Prompt 或 Recall。
- 当前长期结构应被视为“滚动方向摘要”，不是已完成的长期重要事件系统。

本项在 P0 稳定性问题完成后再进入产品语义和存储设计，不在本轮顺手扩展。

## P2：死状态、未使用参数与假抽象

### Memory 系统

- `buildMemoryPromptPlan(memory, ...)` 对 `memory` 参数只执行 `void memory`，应删除该参数。
- `archive_min_interval_ms` 只持久化，不参与归档决策。
- `archive_strategy` 始终为 `stage_based`，没有策略分支。
- `compressed/compressed_at` 被写入即将移出 buffer 的消息副本，没有实际消费者。
- `window_turns` 在短期窗口裁剪前赋值，可能记录为 9，而实际窗口为 8。
- `since_last_archive` 按消息而不是按 turn 计数，且不参与当前归档决策。
- `last_archive_time` 与 `lastArchivedAt` 职责重叠。
- `renderLongTermMemory` 当前无调用方。

### Persona 系统

- `verbosity_index` 仍会被推断、演化和持久化，但在 `maxTokens` 移出人格后已没有实际表达消费者。
- 如果保留，应仅影响表达风格和详略偏好，不能重新影响 `maxTokens`、短期窗口或归档容量。

### Event/Runtime 系统

- `MAIN_AGENT_FLOW_RULES.owner/startWhen/commitWhen/recoveryStrategy` 当前主要是描述数据，没有驱动编排或恢复逻辑。
- Handler 中的 `owner` 字段没有被执行器读取。
- `MainAgentEventConsumptionResult.handled` 没有参与 Event 是否应该 commit 的决策。
- 如果这些字段只是文档，应移入文档；如果是运行规则，应由编排器真正消费。

### 工程检查

- `eslint.config.mjs` 当前配置为 `ignores: ['**/*']`，等价于没有 ESLint 覆盖。
- TypeScript `noUnusedLocals/noUnusedParameters` 可通过，但无法发现“字段被持久化但业务从未读取”的死状态。

## 已知但暂缓的架构债务

### Persona 仍参与工具安全拦截

- `confirmBeforeSensitiveTools` 和 `allowRiskyTools` 仍在 ToolNode 内实际拦截工具。
- 这与“人格只影响是否主动询问及如何谨慎表达，不决定工具能否执行”的目标不一致。
- 在工具内部强制确认协议完成前，暂不整体迁移；但不应继续扩张 Persona Tool Policy。

## 建议收口顺序

1. 统一最终回复来源与对话轮提交入口。
2. 修正失败、中断、生命周期直接回复的 Memory 一致性。
3. 隔离后台人格阶段与普通用户感知链路。
4. 修正 MemoryManager 事务内存一致性和纯 User buffer 边界。
5. 删除死字段、未使用参数和未生效规则。
6. 补齐运行闭环自动化测试后，再推进长期重要事件记忆。

## 必须补充的验收测试

1. 无工具普通对话的 UI/Message/Turn/Memory 一致性。
2. 单工具与多工具循环的最终文本权威性。
3. 中断发生在 Memory 写入前后的幂等性。
4. Message、Turn、Memory 任意一个持久化步骤失败后的恢复。
5. lifecycle-controlled 回复的短期承接和 Recall。
6. 撤回后 Memory、Persona、Mood、Scene 和 WorldFocus 的产品语义。
7. 后台人格阶段不修改用户 Mood、Scene 和 WorldFocus。
8. 连续 User-only 消息不会生成伪闭合 Stage。
9. 语义边界模型失败时，Runtime 硬上限仍能稳定兜底。

## 当前验证基线

- Node/Web TypeScript 类型检查通过。
- TypeScript `noUnusedLocals/noUnusedParameters` 检查通过。
- `test:agent-core` 共 34 项测试通过。
- 现有测试主要覆盖 Recall 语义、工具结果协议、工具执行账本、工具注册/错误和归档策略；尚未覆盖上述端到端提交与恢复路径。
