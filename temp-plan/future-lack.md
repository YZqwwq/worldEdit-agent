# Agent 运行与记忆系统缺陷清单

## 文档用途

本文档记录 2026-08-07 对主 Agent 运行闭环和记忆闭环的审计结果，作为进入下一阶段前的稳定性收口清单。

当前结论：

- 正常成功路径基本可用。
- 短期记忆、待归档缓冲、Stage 和 Recall 的正常路径已连通。
- 单轮缓存与统一提交入口已经建立；主 Agent 用户消息、任务通知和后台人格阶段进入同一串行入口。产品已放弃暂停/继续，当前最高优先级是把用户中断改造成完整的 interrupted Turn 提交；崩溃恢复继续由 Turn Version 单独负责。
- 在 P0 问题收口前，不建议继续扩展 Context Planner 或长期重要事件系统。

## 单轮提交缺陷的外部表现

本节不描述内部字段和实现细节，只记录这些缺陷最终会如何影响用户，以及开发者在检修时会遇到什么。

### 用户可能遇到的问题

1. **最新状态偶尔被旧状态覆盖。** 用户快速连续操作、同时编辑文档或连续发送消息后，Agent 的人物焦点、情绪、场景或记忆可能突然退回到较早状态。
2. **聊天回复与实际任务状态矛盾。** Agent 可能已经回复“任务已取消、继续或完成”，但任务仍在运行；也可能任务已经变化，回复却没有成功保存。
3. **后台任务干扰正常对话。** 后台人格任务可能被误认为用户当前正在讨论的内容，使下一轮语气、人物焦点或当前场景无故变化。
4. **异常或重试后出现重复内容。** 断网、模型错误、应用关闭或数据库写入失败后重试，可能重复保存同一回复、记忆或事件，使 Agent 反复提到相同信息。
5. **撤回后 Agent 仍保留影响。** 聊天文字虽然已经撤回，但该轮形成的人格变化、情绪、世界焦点或任务状态仍可能继续影响后续回答。
6. **重启后出现“已经完成但没有反馈”。** 数据可能已经保存，但完成通知、记忆归档或后续任务调度没有执行，用户只能在刷新或重新进入页面后看到部分结果。
7. **不同界面显示的结果不一致。** 聊天记录、任务面板、记忆面板和 Agent 实际行为可能分别呈现不同的完成状态。

### 开发与检修可能遇到的问题

1. **无法快速还原一轮对话改了什么。** 排查时需要分别检查消息、Turn、Event、Memory、Persona、Slot 和 Task，缺少一份能够说明本轮实际生效内容的提交记录。
2. **日志成功不代表整轮成功。** Graph、工具、消息和任务可能分别报告成功，但其中某个状态实际没有保存，容易得到错误结论。
3. **问题难以稳定复现。** 多数异常只在中断、重启、并发编辑或写入失败的瞬间发生，普通成功路径测试无法覆盖。
4. **无法安全判断应该重试什么。** 系统难以区分“完全未提交”“只提交了一部分”和“已经提交但缺少通知”，自动恢复可能重复执行已经完成的动作。
5. **新增节点容易重新引入部分提交。** 开发者若不能明确一项变化属于临时状态、原子提交还是提交后动作，就可能让新功能绕过统一提交边界。
6. **修复一条路径可能破坏另一条路径。** 正常回复、中断、生命周期控制和后台任务的处理差异，会使局部修复演变成重复保存、漏写或状态冲突。

### 面向用户的收口标准

系统必须能够稳定回答三个问题：

1. 这轮对话是否已经完整生效。
2. 这轮对话具体改变了哪些用户可感知状态。
3. 失败或重启后，只需要继续哪一部分，而不会重复已经完成的工作。

## P0：运行闭环必须修正

### P0-0：用户中断完整提交

状态：已于 2026-08-13 接通。`interruptCurrentRun()` 通过 AbortController 停止模型流，Runtime 读取最近稳定 HEAD，`commitInterruptedTurn` 原子提交部分回复、稳定 Workspace、Observation 和 Final interruption receipt；随后消息队列完成原 Event 并释放。

暂停、继续、暂停回退和队列 `pausedEvent` 已移出产品主链。旧 paused 状态只保留启动迁移和历史审计；`ready_to_commit`、Final Version 和不可变快照继续用于崩溃恢复。

后续顺序：补模型流和工具边界的真实中断测试 -> 验证下一轮承接中断事实 -> 工具 planned action -> 普通 checkpoint 崩溃恢复。

中断验收位置统一为：模型流中、工具调用前、工具执行中、工具返回后、Memory/Persona Draft 形成后、正式 Final 提交前。每个位置都要验证现场封存和稳定影响发布边界。

工具状态按三类处理：只读结果保存在未提交 Turn 中并可随取消丢弃；Persona/Memory 等继续使用现有 Draft；副作用工具统一接入 `ChangeSet + EffectReceipt`。应用内修改尽可能让业务事实与 Receipt 同事务，外部不可延迟操作使用 planned/receipt/unknown，不能假装可回滚。

已完成的中间收口：有副作用工具成功返回后立即写入 `durableToolReceipts` 并形成稳定 checkpoint；中断会等待在途写工具完成这一边界。它解决正常用户中断时“数据库已修改、Workspace 无感知”的问题。用户侧避免 Agent 重复写入或否认已完成修改；维护侧保证 interrupted Final 能引用真实工具回执。进程强杀的提交微窗口仍归 A5 处理。

### 2026-08-12：统一系统审计问题

本节只记录尚未收口的问题。TurnWorkspace、Event/Turn、Version/HEAD、`ready_to_commit` 和统一 Committer 均有明确职责，不作为待删除的冗余架构。

#### A1：用户中断没有完整终结当前 Turn（P0）

**状态：中断主链已于 2026-08-13 接通。消息队列只调度未处理和正在处理的消息；Turn 中断提交后，原 Queue Event 作为已消费消息进入 `completed`，不存在暂停和重新入队。**

- 未处理：消息尚未被 Agent Runtime 领取。
- 正在处理：消息已经绑定当前 Turn，直到完成、中断、失败或取消。
- 中断：Turn 的正式终态和审计结果；Queue Event 只记录该输入是否已经消费完毕。

已完成：

- 删除 `pausedEvent`、暂停/继续/回退 IPC 与 UI，停止按钮直接请求 Abort。
- Abort 后读取最近稳定 HEAD，提交其中的 Workspace，并让 Final interruption receipt 引用源 Version 与中断位置。
- 普通对话和后台人格阶段均进入 Turn Version 上下文；后台阶段中断也提交最近稳定 Workspace 与 interruption receipt。
- 部分回复保存为 interrupted Message；稳定 Workspace 按正常发布策略提交。
- Interrupted Final 成功后才由队列完成原 Event；崩溃发生在两者之间时，启动恢复只补齐 Event 完成状态。
- 删除无实际控制作用的 `eventCommitted` 字段；Event 完成权唯一归队列所有。
- 真实 SQLite 和独立进程强杀测试已覆盖中断提交前后的队列回执窗口。

目标模型：

```text
消息队列
  未处理 -> 正在处理 -> 离开调度集合
                         completed / failed / cancelled

Agent Runtime
  running -> interrupt_requested -> interrupted
```

- AbortSignal 停止当前模型流或可取消工具，不再调度新动作。
- `commitInterruptedTurn` 发布最近稳定 HEAD 中已经形成的全部 Workspace 缓存。
- 已展示回复保存为 `interrupted`，不能表现为完整结论。
- 已完成工具结果保留；执行中工具进入 `aborted` 或 `unknown`。
- 中断事务提交后才释放执行槽，随后队列领取下一条未处理消息。

验收标准：

1. 队列实现中不存在 `pausedEvent`、恢复 paused Event 或原 Event 重新入队路径。
2. 中断后 Turn 只进入一次 `interrupted`，Event 只进入一次 `completed`。
3. UI 部分回复、数据库消息和 Workspace 中的流式文本一致。
4. 已完成工具结果不丢失，未完成工具不被误报成功。
5. 中断提交失败时不释放执行槽；成功后执行槽只释放一次。
6. 待完成：下一轮 Context 明确承接中断事实和稳定证据；未来的高优先级 follow-up Event 暂不实现。

#### A2：统一撤回系统不是完整、原子的正式撤回（P0）

- Final 后撤回当前只恢复 Memory checkpoint、隐藏消息并修改 Turn。
- Persona、Memory Slots、Observation、任务状态和工具副作用没有同步补偿。
- 多个步骤不在同一事务中，失败时可能留下部分撤回状态。
- 目标：完整补偿机制完成前，将能力降级为“隐藏最后一轮并重新编辑”或暂时禁用；正式撤回以后由 Commit Manifest/Inverse Effects 驱动。

#### A3：中断请求缺少精确目标校验（P1）

- 当前入口主要读取“活动运行”，多窗口、重复点击或延迟 IPC 可能命中新启动的 Turn。
- 目标：中断请求携带预期 `eventId + turnId`；Runtime 使用 compare-and-set 语义，只能中断请求发出时的那次运行。
- 重复中断返回当前终态，不重复提交、不重复释放执行槽。

#### A4：统一提交系统缺少提交后动作恢复（P1）

- Final 主事务已经统一，但工具使用统计和 Memory Stage 归档仍在事务外尽力执行。
- 失败后没有持久化收据，应用重启也不会补做。
- 目标：增加最小 Post-Commit Outbox，记录待执行、完成、失败和重试状态；派生动作必须幂等。

#### A5：统一恢复系统尚未闭合工具执行窗口（P1）

- `ready_to_commit` 可以安全恢复，普通 checkpoint 仍只能失败关闭。
- 外部或不可延迟副作用缺少 `planned/receipt/unknown`，无法判断是否应重放。
- 目标：先接入工具动作收据，再开放普通 checkpoint 自动恢复。

#### A6：统一版本系统存在快照重复膨胀风险（P2）

- 当前稳定节点保存完整 Graph State，大型 ToolMessage 和工具结果可能在多个 Version 中重复出现。
- 目标：先观测版本数量、快照大小和重复字节；超过保护线后将大型结果改为引用，不提前建设通用对象存储。

#### A7：统一 Effect 系统存在遗留分支（P2）

- `update_chat_turn`、`sync_memory_messages`、`record_interaction_observation` 当前没有实际生产者。
- 这些分支会弱化 `commit_turn` 是正式提交唯一入口的约束。
- 目标：确认无调用后删除死 Effect；保留任务通知仍使用的 `save_message`、`emit_trace` 和纯展示流事件。

#### A8：统一恢复测试没有进入默认完整验收（P1）

- `test:turn-recovery-process` 尚未加入 `test:agent-core`。
- Node 20 环境必须使用 ABI 匹配的 `better-sqlite3`，关键 SQLite 用例不能静默 skip 后仍视为完整通过。
- 目标：建立明确的恢复测试入口或纳入核心套件，并在 Electron 启动编排中完成真实恢复验收。

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

状态：已于 2026-08-09 增加归档事务失败的进程内快照回滚；提交 Turn 的内存替换原本已在数据库事务成功后执行。

- Stage 归档时先修改 `longTerm`、`archiveBuffer`、`lastStageIndex` 和计数器，后执行数据库事务。
- `addMessage` 也是先修改内存数组，后保存数据库。
- 事务失败后，内存状态与数据库可能分叉。

修正方向：先构造 next state，在事务成功后再替换当前内存状态，或失败时显式恢复事务前快照。

### P1-2：Runtime 硬上限可能生成不闭合的纯 User Stage

状态：已于 2026-08-09 修复，并补充纯 User 缓冲与延迟 AI 闭合测试。

- 硬上限触发后会向前寻找 AI 消息作为结尾。
- 如果保护窗口内完全没有 AI 消息，当前算法仍会归档第一条 User 消息。

修正方向：将“无 AI 闭合消息”设为显式 incomplete 异常片段，或保留缓冲并使用独立的异常上限；不应将单条 User 消息标记为正常闭合 Stage。

### P1-3：后台人格阶段会运行普通用户感知链路

状态：已于 2026-08-09 修复。后台阶段跳过交互式感知，提交策略同时禁止其发布 Memory Slots，并已补充回归测试。

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

- `verbosity_index`、`formality_score` 会被推断、演化、持久化和瞬时调制，但没有完整进入最终 Expression 编译。
- 用户影响：长期形成的“更简洁”或“更正式”偏好可能没有稳定体现，瞬时 Mood 对回复长短的影响反而更强。
- 维护影响：字段看似已经闭环，实际只有存储与计算，没有最终消费者，后续调参难以判断是否有效。
- 修正边界：两者只影响表达风格、详略与正式度，不能重新影响 `maxTokens`、短期窗口或归档容量。
- `signalRules`、`moodRules`、`currentFocusLimit`、`recentReferenceLimit`、`preferencePromotionThreshold` 和 `PersonaPolicy.signals` 尚未发现有效运行消费者。
- 用户影响：配置修改不会产生预期行为变化。
- 维护影响：形成“可配置但不生效”的假接口，增加错误排查范围。

### Event/Runtime 系统

- `MAIN_AGENT_FLOW_RULES.owner/startWhen/commitWhen/recoveryStrategy` 当前主要是描述数据，没有驱动编排或恢复逻辑。
- Handler 中的 `owner` 字段没有被执行器读取。
- `MainAgentEventConsumptionResult.handled` 没有参与 Event 是否应该 commit 的决策。
- 如果这些字段只是文档，应移入文档；如果是运行规则，应由编排器真正消费。

### 工程检查

- `eslint.config.mjs` 当前配置为 `ignores: ['**/*']`，等价于没有 ESLint 覆盖。
- TypeScript `noUnusedLocals/noUnusedParameters` 可通过，但无法发现“字段被持久化但业务从未读取”的死状态。

## 人格、瞬时情绪与表达链路缺陷

### P0：Persona 仍参与工具安全拦截

- `confirmBeforeSensitiveTools` 和 `allowRiskyTools` 仍在 ToolNode 内实际拦截工具；中性人格的默认 caution 已可能越过确认阈值。
- 用户影响：即使真实操作对象没有额外风险，Agent 也可能因当轮情绪或人格偏保守而要求确认、拒绝工具或停止推进。
- 维护影响：工具权限同时受元数据、人格数值和 ToolNode 阈值控制，风险规则无法在具体工具内形成单一权威来源。
- 修正方向：解除 Persona Tool Policy 的硬拦截。人格仍可影响是否主动询问、如何表达谨慎；强制确认以后由具体工具根据真实对象和风险决定。

### P1：Mood 对 Action 存在重复放大

- Mood 先被映射为人格参数偏移，Action 编译又同时读取已经调制的 `effectiveMetrics`、原始情绪向量和表达调制派生值。
- 用户影响：一次紧张或受挫可能同时提高谨慎、证据需求、澄清需求和写入保守度，使 Agent 频繁追问或过早放弃工具路径。
- 维护影响：单个权重调整会沿多条路径叠加，很难预测最终行为，也难以通过测试定位偏差来源。
- 修正方向：为 Mood 到 Action 选择一条主要投射路径；其他派生值仅在确有独立语义时参与。

### P1：文本编辑场景重复表达同一行动偏好

- 文本编辑场景同时通过 `metricDelta`、`actionBias` 和 `actionDirections` 表达读取、核对、保守修改与结果验证。
- 用户影响：进入文档页面本身就可能让 Agent 过度保守，即使用户只是讨论内容；场景还会间接提高现有工具拦截概率。
- 维护影响：新增场景时容易复制三套近义规则，场景数量增加后难以控制偏置强度。
- 修正方向：保留认知姿态和一套行动偏置，删除同义的重复数值或 Prompt 通道。

### P1：Expression Profile 越权承担认知与行动职责

- 当前 Expression 包含“思考更深入”“正向时更乐观看可能性”“负向时更关注代价”“尽量不提出意见”以及按技术、时事、哲学改变分析方向等规则。
- 用户影响：同一事实问题可能因表达模板或 Mood 不同而改变判断重点和行动意愿，而不只是改变说法。
- 维护影响：Character、Cognitive、Action 和 Expression 的规则彼此重叠，修改语气模板可能意外改变能力表现。
- 修正方向：Expression 只保留语气、节奏、详略、正式度、关系距离和措辞；认知姿态与行动偏好分别回到对应层。

### P2：Mood 推断输入包含重复和越界信息

- Mood 同时接收最近对话、其派生的用户情绪摘要、场景调制后人格、完整场景行动指令，以及上一 Mood 的向量、标签、强度和叙事。
- 用户影响：用户情绪或场景倾向可能被重复强调，导致 AI Mood 波动大于真实对话信号。
- 维护影响：模型输出偏差无法判断来自原文、派生摘要还是场景规则，Prompt 也随场景扩张持续膨胀。
- 修正方向：只保留必要事实与核心状态，删除行动指令和可由向量重新派生的标签、强度。

## 建议收口顺序

1. 已完成：统一最终回复来源与对话轮提交入口。
2. 已完成：统一正常、失败、中断和生命周期回复的提交入口。
3. 已完成：隔离后台人格阶段与普通用户感知链路。
4. 已完成：修正归档事务失败回滚和纯 User buffer 边界。
5. 方向已调整：所有主 Agent 工作共用一个 Agent Runtime 执行槽；消息队列只保存未处理消息和当前已领取消息，不保存暂停状态。
6. 已完成：AbortController 中断入口、唯一 `commitInterruptedTurn`、部分回复、稳定 Workspace 与 Final interruption receipt 提交。
7. 已完成：移除暂停、继续、暂停回退、队列 `pausedEvent` 与 paused `resumeFromHead` 产品路径；既有 Version/HEAD 保留给崩溃恢复。
8. 已完成：`ready_to_commit`/Final Version，以及 ready 候选崩溃后只重试提交的恢复路径。
9. 已完成：中断提交成功后队列完成并释放原 Event；桌面和紧凑聊天只保留一个中断入口。
10. 后续独立工作：崩溃恢复以 Turn/HEAD 重建新的运行；Event 只提供原始输入和审计关联，不再用 paused 状态决定队列所有权。
11. 已完成：独立子进程 `SIGKILL` 已覆盖 checkpoint、ready、Interrupted Final 提交前后 Queue Event 回执状态。
12. 下一步：覆盖模型流、工具前后、Draft 形成后和 Final 前的真实中断测试，并验证下一轮 Context 承接。
13. 补完整 Electron 启动编排验收并接入工具 planned action，再开放普通 checkpoint 的崩溃恢复。
14. 以世界文档验证最小 `ChangeSet + EffectReceipt`；普通写入不强制暂存，不先建立覆盖所有工具和文件的统一虚拟层。
15. 补齐提交清单与提交后动作恢复。
16. 删除死字段、未使用参数和未生效规则后，再推进长期重要事件记忆。

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

## 场景测试基线

### 场景 A：在基础设定文档中讨论另一实体的文档

用户位于世界观基础设定文档，提出“查看某个人物的描述是否与当前基础设定一致”。

当前自动化基线已覆盖：

1. 消息创建时的世界观、当前文档和 revision 快照原样进入运行时。
2. 文档页面自动激活 `world_document_editor` 能力包。
3. 测试执行完成目录读取和正文读取后，工具完成记录进入同一 Turn Workspace。
4. Graph 最终回复是唯一权威文本，不使用流式中间文本提交。
5. 正常完成只发布一个 `commit_turn`，随后向 UI 发布内容一致的完成信号。
6. 提交草稿中的用户消息、AI 回复和工具完成记录属于同一轮。

当前基线刻意使用可控执行替身，不依赖真实模型与数据库。它验证系统编排契约，不验证模型每次都能正确选择人物和工具。

下一批场景测试：

1. 工具返回“实体或文档不存在”时，Agent 能获得结构化反馈并停止盲目重试。
2. 用户在工具执行期间发送新消息时，当前轮闭合后再处理新消息，且页面快照不串轮。
3. 文档读取完成后发生中断时，不重复提交工具结果、回复或记忆。
4. 数据库提交失败并重启后，系统能识别未发布轮次并安全恢复。

## 当前验证基线

- Node/Web TypeScript 类型检查通过。
- TypeScript `noUnusedLocals/noUnusedParameters` 检查通过。
- `test:agent-core` 共 42 项测试通过，其中包含 2 项场景 A 基线断言。
- Node/Web 类型检查与 Electron 生产构建通过。
- 现有测试主要覆盖 Recall 语义、工具结果协议、工具执行账本、工具注册/错误和归档策略；尚未覆盖上述端到端提交与恢复路径。
