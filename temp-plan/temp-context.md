# Agent Context Engine：现状问题与待梳理事项

## 文档目的

本文档先记录当前 Context Engine 中已经识别出的具体问题，不预先建设大而完整的 Context Planner，也不提前确定复杂架构。

后续按照以下方式逐项推进：

1. 确认问题是否真实存在以及影响范围。
2. 明确希望得到的行为结果。
3. 比较最小修复方案。
4. 实施并通过实际对话案例验证。
5. 只有现有结构确实无法承载时，才增加新的抽象层。

## 已确认的产品前提

### Agent 定位

- Agent 的核心定位是长期人格伙伴。
- 工作执行能力只是给予 Agent 的“手脚与眼睛”，不是 Agent 的主体。
- Context Engine 首先服务人格连续性、关系连续性和对用户经历的理解，其次才是具体工作任务。

### 长期记忆归属

- 长期记忆属于全局主 Agent。
- 长期记忆不属于子 Agent。
- 子 Agent 可以执行任务并向主 Agent 回报，但不直接拥有或继承主 Agent 的长期人格记忆。

### 长期记忆形成方式

- Agent 应依据自己的行为偏好判断什么值得形成长期记忆。
- 重要候选事件包括但不限于：
  - 用户取得阶段性进展。
  - 用户对生活事件进行倾诉。
  - 用户经历了具有持续影响的变化。
  - 用户与 Agent 的关系或互动方式发生变化。
  - Agent 主观认为未来仍想记得的共同经历。
- 长期记忆不能只由固定轮数、关键词或统一摘要算法决定。

### 上下文丰富度

- 当“少带上下文”和“多带上下文”发生取舍时，倾向多带上下文。
- 不确定的历史上下文不应被直接删除，可以降低确定性并作为背景提供。
- 目标不是尽可能压缩 Prompt，而是在信息充分的前提下避免重复和失控膨胀。

### 人格印象、历史记忆与数据库信息

- 三者没有固定的全局优先级，应根据当前场景决定使用依据。
- 数据库不是持续参与 Agent 意识的核心上下文，只在工作区定位、工具观察或具体任务需要时参与。
- 人格印象与相关的当前理解可以直接参与上下文，并且通常先被 Agent 感知。
- 历史记忆主要在以下情况下被主动调用：
  - 用户质疑 Agent 当前形成的印象或理解。
  - Agent 主动认为当前场景需要回忆过去经历。
  - 当前印象无法解释用户表达或存在明显不确定性。
- 不应简单采用“数据库事实覆盖记忆”或“最新用户表达覆盖历史”的固定规则。

## 当前 Context Engine 的组成

当前系统主要包含以下上下文来源：

- 稳定人格：Character Prompt、Expression Profile。
- 即时感知：scene、user mood、persona、world focus。
- 当前应用环境：workspace、world、entity、document。
- 任务状态：active task、task lifecycle。
- 工具工作记忆：tool evidence、ephemeral tool context、turn progress。
- 短期记忆：最近 4 条 user/AI 消息。
- 阶段记忆：短期窗口溢出后形成的 stage summary。
- 长期记忆：滚动 memory summary、当前 user profile。
- 主动检索：主 Agent 统一通过 recall agent memory 发起回忆；内部再使用中文 BM25 检索 pending、Stage 和较早原始对话。

## 问题总览

### 进行中


| 编号   | 优先级 | 问题                                                                                  | 当前状态       |
| ---- | --- | ----------------------------------------------------------------------------------- | ---------- |
| P0-4 | P0  | 统一 Recall 已落地，但最近轮排除和自然指代兜底尚未通过验收                                                   | 主体完成，待验收修正 |
| P0-5 | P0  | 工具完整结果可能在模型消费前被压缩                                                                   | 已实施，待对话验收  |
| P1-1 | P1  | 感知系统运行诊断进入主模型 Prompt                                                                | 已实施，待对话验收 |
| P1-2 | P1  | Context 在多个节点分散装配，缺少完整最终清单引入轻量 `ContextProvider`，先统一当前由 ContextNode 装配的派生 Context。 | 部分改善       |
| P1-3 | P1  | 没有总量保护、去重和分段大小治理                                                                    | 部分改善       |
| P1-4 | P1  | 长期记忆是滚动摘要，不是独立重要事件                                                                  | 待讨论        |
| P1-5 | P1  | `userProfile` 主要来自临时场景和情绪                                                           | 待讨论        |
| P1-6 | P1  | Scene 低置信度时直接屏蔽历史世界焦点                                                               | 待讨论        |


“部分改善”表示当前改造已经提供了基础观测能力，但问题本身尚未闭环，不应视为完成。

### 已完成


| 编号   | 原问题                                 | 处理结果                                                                      |
| ---- | ----------------------------------- | ------------------------------------------------------------------------- |
| P0-1 | 派生上下文虽然都使用 SystemMessage，但职责和来源没有边界 | 引入 PromptSection，区分 identity、instruction、context、execution，并拆分主要混合 Prompt |
| P0-2 | 瞬时场景、情绪和人格调制只看到当前用户消息               | 统一读取最近两轮对话，供 Scene、UserMood、WorldFocus、PersonaSignal 和 AI Mood 共享         |
| P0-3 | 消息离开短期窗口后，在形成 Stage 前没有读取出口         | 将 archiveBuffer 暴露为待归档记忆层，并由 recall 默认返回原始消息                              |
| P2-1 | Memory anchors 没有管理入口且与长期记忆按需查询方向冲突 | 已从状态、持久化、Context 注入和调试界面中移除                                               |


## 已实施事项与验收状态

### P0-1：区分派生上下文的职责结构

#### 原问题

Persona、Workspace、Scene、World Focus、Memory Slots、工具证据和执行进度等内容都作为 SystemMessage 注入。问题不在于 SystemMessage 本身，而在于不同性质的信息缺少明确边界，部分 Prompt 还同时混合状态、推断和行为规则。

#### 最终决策

不建设 Typed Context Planner，只增加轻量结构：

```ts
type PromptDuty = 'identity' | 'instruction' | 'context' | 'execution'

type PromptSection = {
  id: string
  duty: PromptDuty
  kind: string
  source: string
  content: string
  confidence?: number
  capturedAt?: string
}
```

- `duty` 表示模型应如何使用内容。
- `kind` 是开放字符串，表示内容具体是什么。
- 一个模块可以输出多个 Section，把状态和使用规则分开。
- 短期对话历史继续使用 HumanMessage/AIMessage，不转换为 Section。


| Duty        | 职责                 | 典型内容                                 |
| ----------- | ------------------ | ------------------------------------ |
| identity    | Agent 是谁           | Character Prompt、稳定人格基调              |
| instruction | 应如何理解、表达和行动        | Expression Profile、工具规则、Scene 使用规则   |
| context     | 当前知道、感知、记得或认为发生了什么 | Workspace、Scene 结果、AI Mood、人物印象、工具证据 |
| execution   | 当前运行到哪里            | Active Task、工具进度、失败和临时执行状态           |


#### 已实施

- 新增 PromptSection 定义、统一 Renderer 和 Manifest 信息。
- Persona 拆为 `identity/persona_anchor`、`context/agent_internal_state`、`instruction/expression_style`。
- Scene、Workspace、World Focus 的状态与使用规则分别注入。
- 查询/读取工具结果归为 `context/tool_evidence`。
- 工具进度和临时状态归为 `execution/tool_progress`。
- 每段 SystemMessage 显示 duty、kind、ID、来源及职责说明。
- Trace 记录 Section 的字符数、置信度、采集时间，并按 duty 汇总。

#### 当前边界

本次只解决职责混杂和来源不清：

- 保持 Section 分别渲染为 SystemMessage，不按 duty 合并。
- 不引入 priority、token budget、activation policy、自动相关性评分或冲突解决器。
- 不自动选择、排序、压缩或裁剪上下文。
- 只有后续出现明确问题时，才讨论上述能力。

已确认的语义归类：

- AI Mood 状态属于 context；表达调制属于 instruction。
- 人格印象表示“Agent 如何理解”，属于 context，不属于 identity。
- 查询和读取结果属于 context；创建、修改和委派状态属于 execution。

### P0-2：让瞬时感知与人格调制看到最近对话

原问题不只影响 Scene/UserMood，而是会沿感知链路影响 WorldFocus、用户偏好信号、会话激素、AI Mood、表达方式和行动倾向。

已实施：

- InstantPerception 开始时统一读取一次短期记忆，取最近 4 条已完成消息，并附加当前用户消息。
- Scene、UserMood 和 WorldFocus 共享同一份 `recentDialogue`，不再分别从只有当前消息的 LangGraph State 构造伪“最近对话”。
- PersonaSignal 使用最近对话理解当前消息中的指代、承接和对助手行为的反馈。
- AI Mood 使用最近对话理解本轮互动和情绪变化。
- 最近对话只作为解释背景；PersonaEvolution 仍只消费 observation 游标之后的新事件。
- 只有与当前用户输入对应的最新 observation 能使用这份对话背景，旧 observation 不会被再次提取信号或重复写入 `session_hormones`、`transient_state` 和稳定偏好。

当前边界：

- 这份最近对话只服务瞬时感知，不额外注入主模型 Prompt。
- 本次只覆盖最近两轮连续性；archive buffer 的读取空窗已由 P0-3 通过按需 recall 单独处理。
- 激素状态原有的持久化、衰减和 observation 游标机制保持不变。

### P0-3：让待归档消息可以被主动回忆

原问题由两个不同节奏的机制叠加产生：短期窗口超过 4 条后立即淘汰旧消息，但 Stage 要等 archiveBuffer 达到 6 条并在 AI 消息写入后才形成。期间消息已经持久化，却不在 shortTerm、recentStages 或长期摘要中，recall 只能看到 buffer 数量。

已实施：

- `MemorySnapshot` 新增 `pendingArchive`，按原顺序暴露 archiveBuffer 中尚未形成 Stage 的消息副本。
- 统一 Recall 会自动把 pending 消息作为候选来源，不再要求 Agent 选择工程化 scope。
- 命中的 pending 消息以 `matches.kind=pending` 返回，并保留 role、content、occurredAt 和 sourceRef。
- 空结果、成功提示和 receipt 均以统一 matches 为依据。
- ToolNode 为 recall 增加专用模型可见摘要，避免 pending 内容被通用 700 字符数据预览直接截掉；本轮证据上限为 8000 字符。
- buffer 达到阈值并形成 Stage 后仍按原逻辑清空，后续由 recentStages 提供阶段摘要，不改变归档节奏。

当前边界：

- pending 消息只在 Agent 主动 recall 时读取，不默认注入每轮主模型 Prompt。
- 本次解决的是“不可读取”的时间空窗，不改变 Stage 粒度、归档阈值或长期摘要生成方式。
- pending 的主题筛选和跨来源排序已接入 P0-4 的统一 Recall 主体链路；剩余窗口排除和自然指代问题见 P0-4 的验收结论。

### P0-4：让 query 驱动统一回忆

原有 `recall_agent_memory` 只是固定读取 MemorySnapshot：query 只进入结果描述，Stage 固定取最近几条，pending 整体返回；另一个公开工具 `search_recent_chinese_conversation` 才具备中文 BM25 检索。主 Agent 因而需要在两种“回忆工具”之间理解工程差异。

#### 当前结论

统一 Recall 的主体架构已经落地，但根据 2026-07-28 的代码验收，不能按完整行为标准视为结束。当前应标记为“主体完成，待验收修正”：主 Agent 已只有一个回忆入口，query 也确实参与内容检索；但原始对话窗口排除和自然历史指代兜底仍存在可复现的语义偏差。

#### 已落地

- 新增内部 `AgentRecallService`，`recall_agent_memory` 成为主 Agent 唯一可见的回忆入口。
- 删除旧 scopes、recentStageLimit、longTerm、pendingMessages、recentStages 等分散契约，直接返回统一 `RecallBundle`。
- RecallBundle 由 `orientation`、相关 `matches` 和 `searched` 覆盖统计组成。
- 长期 memorySummary 只作为 orientation，不参与具体经历排名，也不再把 userProfile 当作回忆证据。
- pending 原始消息和最多 500 个 Stage 摘要进入同一 BM25 候选集。
- 原始中文对话搜索保留为 Recall 内部能力，最多读取 50 个候选轮次。
- 删除公开的 `search_recent_chinese_conversation` 工具和注册项，Agent 不再判断应该调用哪一种记忆工具。
- 不同来源分别归一化相关性，再以 92% 相关性和 8% 时间新近度形成可比较分数。
- 相同角色和相同内容的 pending/raw message 会去重；Stage 摘要与原文保持独立来源，允许 Agent 对照判断。
- 无法形成有效检索 token 的 query 会采用近期 pending/Stage 兜底；有有效 token 的明确主题没有命中时返回空 matches，不塞入无关近期记忆。
- ToolNode 按 `context/episodic_recall` 的语义回载 orientation、来源、时间、相关度和正文，单次证据上限为 8000 字符。

#### 尚未闭环的问题

1. 原始对话的最近轮排除存在一轮偏移。
  - Recall 固定向内部原始对话搜索传入 `excludeRecentTurns: 2`。
  - Recall 执行时，当前用户消息已经持久化、当前 Turn 已创建，而且当前用户消息已经绑定当前 `turnId`。
  - 因此数据库最新两个 turn key 实际是“当前未完成 Turn + 上一个已完成 Turn”，不是直接进入短期 Context 的“最近两个已完成 Turn”。
  - 结果是上上个已完成 Turn 仍可能作为 raw_message 被召回，同时又已经作为短期历史进入主模型，造成重复和排序放大。
2. 自然历史指代可能被字符 n-gram 误判为有效主题 query。
  - 单独的“刚才”“之前”“上次”“继续”会被停用词过滤，可以进入近期兜底。
  - “刚才那个”“之前说的”“按之前那个”等更自然的表达会生成“才那”“前说”“之前那”等 n-gram token。
  - 这些 token 会阻止近期兜底，却通常没有稳定主题意义，可能导致空结果或偶然字面误命中。
3. 当前没有统一 Recall 的自动化验收测试。
  - `npm run typecheck:node` 已通过，只能证明类型和编译链路成立。
  - 尚无测试证明三类来源覆盖、窗口排除、跨来源排序、pending/raw 去重、指代兜底、空命中和结果上限在真实数据库状态下符合预期。

#### 修正目标

- 原始对话 Retriever 应按“当前短期 Context 已经覆盖哪些消息或已完成 Turn”精确排除，而不是依赖固定的数据库 turn key 数量。
- 时间/承接指代判定应独立于主题检索 token；组合表达中的停用词 n-gram 不应使 query 被误认为具有有效主题。
- 保持一个主 Agent 可见工具和现有 RecallBundle，不重新暴露多个回忆工具，也不要求 Agent 选择 Retriever。
- 修正只影响候选选择和兜底判定，不改变长期摘要 orientation、只读语义和跨来源结果契约。

#### 验收案例

至少覆盖以下自动化或可重复集成案例：

1. pending、Stage、raw_message 都能通过同一个 `recall_agent_memory` 返回。
2. 当前未完成 Turn 不占用“最近两个已完成历史轮”的排除名额。
3. 已经进入最近 4 条短期 Context 的消息不会再次作为 raw_message 返回。
4. pending 与 raw_message 中相同角色、相同正文只保留一条，Stage 摘要仍可与原文并存。
5. “刚才”“刚才那个”“之前说的”“按之前那个”都能进入合理的近期承接逻辑。
6. 明确主题存在命中时按主题返回；明确主题无命中时返回空 matches，不塞入无关近期记忆。
7. 默认最多 8 条、显式 limit 最多 12 条，结果保留 kind、sourceRef、occurredAt 和 relevance。
8. 主 Agent 工具注册表中不存在第二个公开的中文对话搜索工具。

#### 当前边界

- 默认最多返回 8 条、调用方最多请求 12 条匹配。
- 当前来源只有 pending、stage 和 raw_message；未来重要事件记忆应作为新的内部 Retriever 接入，不再修改主 Agent 工具形态。
- 当前使用本地中文分词与 BM25，不引入 Embedding 或向量数据库。
- Recall 是只读认知动作，不写入记忆、不修改人格印象，也不替 Agent 解决不同记忆之间的冲突。

### P2-1：移除废弃的 Memory anchors

Memory anchors 没有新增、修改或删除入口，也与“长期记忆由 Agent 按需查询”的方向冲突，因此已经从 Memory State、MemorySnapshot、MemoryManager、数据库实体、ContextNode 和记忆调试界面移除。

Persona 的 CharacterAnchor 是稳定人格身份结构，不属于已移除的 Memory anchors。

## P0-5：工具完整结果可能过早压缩

### 当前表现

- 标准 ToolMessage 主要返回执行状态，不包含完整 `envelope.data`。
- Tool transcript 在下一次模型调用前被清理。
- 普通工具结果常被压缩为有限长度的字符串摘要。

### 影响

- 长文档正文可能在主模型真正使用前被截断。
- 人物详情、关系和任务 Trace 可能只剩不完整摘要。
- Agent 可能在证据不足时继续编辑或得出结论。

### 讨论结论

问题根因不是摘要字符上限太小，而是工具结果在主模型第一次消费前就被摘要化并清理。需要把“首次怎样向模型交付结果”和“首次消费后保留多久”拆成两个独立语义。

- 工具应自行定义完整的“模型可消费结果”，不要求把后端原始对象原样注入，也不继续由 ToolNode 为所有工具硬编码摘要。
- 任何工具结果都不能在首次模型消费前静默截断；超出安全交付范围时必须显式分页、分段或提供稳定引用。
- `evidence` 的完整模型结果保留到当前用户回合结束，以支持多工具比较、连续阅读和读取后编辑。
- `ephemeral` 的完整结果保留到紧接着的一次 LLM 调用完成，之后可转为状态摘要或清除。
- `none` 仍需向紧接着的 LLM 返回成功或失败状态，但不进入后续工具 Context。
- 默认不跨用户回合保留完整工具结果；需要再次使用时按 documentId、entityId、taskId、cursor、sourceRef 或 URL 重新读取。
- 当前优先复用已有稳定引用，暂不建设通用 Artifact Store。

### 最小实施边界

1. ToolMessage 首次返回工具定义的完整模型消费版结果，并将 transcript 保留到对应 LLM 完成消费。
2. LLM 消费后再按 `evidence`、`ephemeral`、`none` 迁移或清理工具 Context；完整 transcript 存在时不重复注入同一结果摘要。
3. 优先覆盖文档读取、实体/人物详情、叙事批次、Recall、联网搜索和任务详情等读取工具；写工具通常只需返回 receipt、对象 ID、新 revision 和变更摘要，不必回显整篇正文。
4. 对超过上下文安全范围的结果补充分页、范围读取或明确引用；禁止静默截断后把结果表现为完整内容。

### 保留策略的决策权

工具结果保留多久不应由调用工具的主 AI 单独决定，也不需要为此增加一个分类 AI。采用“工具声明边界、主 AI 表达意图、Runtime 强制执行”的分工：


| 参与方       | 职责                                                              |
| --------- | --------------------------------------------------------------- |
| 工具作者      | 声明默认和最长保留期、模型消费版结果格式、是否可按稳定引用重新读取                               |
| 调用工具的主 AI | 可以在工具允许范围内表达 `release` 或 `retain_for_turn` 意图，不得延长到工具声明的最长保留期之外 |
| Runtime   | 保证首次完整消费，执行保留上限、Context 预算、回合结束清理和异常兜底                          |
| 长期记忆系统    | 独立判断本次经历是否形成长期人格或关系记忆，不直接持久化工具 transcript                       |


概念策略保持轻量：

```ts
type ToolContextPolicy = {
  defaultRetention: 'next_llm' | 'turn'
  maxRetention: 'next_llm' | 'turn'
  modelResultMode: 'full' | 'projected' | 'paged'
  reloadable: boolean
}
```

最终保留期由“工具默认值 + 主 AI 在允许范围内的意图 + Runtime 预算和清理约束”共同得出。P0-5 首版不要求主 AI 动态选择：读取/检索类工具默认保留到 `turn`，激活、状态和轻量动作结果默认保留到 `next_llm`，所有完整结果在当前用户回合结束时清理，不引入额外 AI 判断器。

### 已实施

- Tool envelope 新增独立 `modelResult`；工具可以通过 `buildModelResult` 定义模型消费版结果。
- 未提供专用投影时，只读工具默认完整交付校验后的 `data`，写工具默认只交付 message、receipt 和 nextSuggestions，避免回显整篇修改结果。
- ToolMessage 不再只返回执行状态，也不在下一次 LLM 前被 ReloadNode 清除；非标准工具结果同样完整交付，不再生成 300 字符预览。
- 下一次 LLM 成功完成后才认定首次消费完成，并删除对应 AI tool-call 与 ToolMessage transcript；模型调用失败或中断时不会提前提交清理状态。
- `evidence` 在首次消费后转为本用户回合的工具证据，`ephemeral`、`none` 和失败结果在首次消费后释放。
- 只读工具未显式声明策略时默认 `evidence`，写工具默认 `ephemeral`；工具已有显式声明继续生效。
- 取消证据区最多 6 条的静默淘汰；在 P1-3 建立显式预算、分页和可恢复省略之前，不把被删除的结果表现为本回合完整证据。
- 每次主 Agent 图运行使用新 State，因此本回合 evidence 不跨用户回合保留。

### 后续待确认

- 当前主要模型可用于单次工具结果和整轮工具证据的安全 Context 上限。
- 哪些现有大结果工具需要新增分页或范围读取协议。
- 工具 Context 的消费后清理放在新的后置节点，还是在现有图结构中调整节点职责。

## P1-1：内部运行诊断进入主模型 Prompt

### 当前表现

Instant Perception Prompt 会向主模型描述：

- detector 是否成功。
- detector 执行耗时。
- 输出了哪些 state key。
- world focus 为什么跳过。
- 感知 warning。

### 影响

- 消耗上下文空间。
- 给人格 Agent 暴露不必要的工程实现细节。
- 可能让主模型过度关注内部节点状态，而不是用户表达。

### 最终决策

主 Agent 只接收有效的感知结果，不接收感知系统的运行状态，也不接收失败、跳过或低置信度结果的语义化降级说明。信息缺失时直接不注入对应 Section，主 Agent 依据用户原文和其他有效 Context 判断。

### 已实施

- 删除 `execution/perception_runtime_status`，detector 状态、耗时、输出 state key、World Focus 路由、skip reason 和 warnings 不再进入主模型 Prompt。
- `InstantPerceptionSnapshot` 及 detector 原始错误继续保留在 State 和 Trace，供开发诊断使用。
- Scene 只有 `confidence >= 0.6` 且 `primaryDomain !== 'unknown'` 时才生成场景 Context 和使用规则；失败占位与低置信度判断只用于内部保守路由。
- AI Mood 只有本轮 persona detector 成功产出 Persona Policy 时才注入；缺失或失败时不复用旧 Mood，也不生成 `status: unavailable` Context。
- World Focus 继续只在存在实际 resolved focus 时注入；跳过、无候选和失败不会形成可见 Context。
- 不新增 `perception_availability` 或 `perception_fallback` Section。

### 验收标准

1. 最终 Prompt 和 Manifest 中不存在 `instant-perception-status` 或 `perception_runtime_status`。
2. detector 失败、跳过、耗时、异常和 warning 只可在 Trace 中观察到。
3. Scene 失败、`unknown` 或置信度低于 0.6 时，不注入 `scene-state` 和 `scene-rule`。
4. persona detector 本轮未产出有效 Policy 时，不注入 `agent-mood`，Prompt 中也不出现 `status: unavailable`。
5. 有效的 Scene、AI Mood 和 resolved World Focus 仍按原结构进入 Context。

## P1-2：Context 分散装配，缺少最终清单

### 当前表现

- 初始上下文主要在 ContextNode 装配。
- 工具执行后的进度和证据在 ModelNode 追加。
- ToolContextReloadNode 又负责移除 transcript 和重建摘要。
- 最终消息顺序由 ModelNode 再次调整。
- ContextNode 已通过 PromptSection Manifest 记录首次注入清单。
- 工具循环追加的 Section 尚未汇入同一份最终清单，因此仍无法直接看到每次模型调用的完整输入结构。

### 影响

- 需要跨多个文件才能还原模型最终看到的内容。
- 容易出现重复、遗漏或顺序改变。
- 发生上下文问题时难以快速定位来源。

### 候选最小方向，待讨论

- 不改变现有节点职责，在每次 llmCall 排序完成后输出最终 Context Manifest。
- Manifest 汇总首次 Context、工具循环 Section、历史消息和当前交互，并记录来源、字符数和最终顺序。

### 补充讨论：是否规范 Context Provider 接口

参考 [uu201/character-arc](https://github.com/uu201/character-arc) 的 Runtime v2：每种数据源实现 `ContextProvider`，统一产出带 provider、优先级、标题、正文和 token 估算的 `ContextSlice`；Builder 再按当前 Surface 选择 Provider、隔离单个 Provider 失败、执行预算控制并拼装最终 Prompt。

我们也需要规范不同来源进入 Context Engine 时的交付结构，但只统一 Provider 的调用边界和输出信封，不统一各来源的底层业务数据模型。人物印象、场景感知、工作区、长期记忆和任务状态仍保留各自的数据结构，由各自 Provider 转换为已有的 `PromptSection[]`：

```ts
type ContextProviderRequest = {
  phase: 'initial' | 'tool_loop'
  state: MainAgentState
  budget?: ContextBudget
}

type ContextProviderResult = {
  sections: PromptSection[]
  diagnostics?: ContextProviderDiagnostics
}

type ContextProvider = {
  id: string
  isApplicable?(request: ContextProviderRequest): boolean
  provide(request: ContextProviderRequest): Promise<ContextProviderResult>
}
```

`PromptSection` 已经承担统一输出信封的主体职责，Provider 是来源获取、适用性判断和转换的适配边界，不代表现在要建设完整 Typed Context Planner。后续确有预算治理需求时，可为 Section 增加彼此独立的 `priority`、`estimatedTokens`、`retention`、`reloadRef` 和压缩状态；不能用一个字段同时表达 Prompt 职责、来源激活、保留时长、预算优先级、可信度和可重载性。

以下内容不应为了统一 Provider 而强行转成 Section：

- 最近 HumanMessage/AIMessage 继续作为原生对话历史，由最终装配阶段纳入 Manifest。
- 工具结果首次消费继续使用原生 ToolMessage/transcript，并遵循 P0-5 生命周期；消费后如需保留，才投影为 `context/tool_evidence` 或 `execution/tool_progress`。
- Provider 的 diagnostics 默认进入 Trace，只有确实改变模型可用信息边界时才形成面向模型的降级 Section。

CharacterArc 的优先级、token 预算、失败隔离和可恢复裁剪值得作为 P1-2/P1-3 的参考，但不直接复制其通用 head/tail 压缩。文档、人物详情、Recall 命中和叙事批次的关键内容可能位于中间，应该优先使用显式分页、范围读取或稳定引用；任何压缩或省略都必须对模型可见且可以恢复。稳定人格、当前用户请求、关系上下文和最近对话也不应成为第一批裁剪对象。

### 待确认

- Manifest 只用于 Trace，还是也需要开发者调试界面？
- 工具循环后的 Context 是否应与首次 Context 使用同一渲染入口？
- Provider 首版只统一初始派生 Context，还是同时迁移工具消费后的 Section 生成？
- Provider 输入应直接读取 `MainAgentState`，还是逐步收窄为显式的只读 Source Snapshot？

## P1-3：没有总量保护、去重和分段大小治理

### 当前表现

- PromptSection Manifest 已记录各 Section 的字符数，ContextNode 也记录总体估算字符数。
- 当前没有 token 估算、统一上限、去重或超限处理。
- 单个人物印象可以达到约 8000 字符，多焦点时可能重复注入。
- Tool Usage、Scene、Memory Slot、World Focus 可能描述相同状态。

### 影响

- 新功能会不断增加 Prompt。
- 重复信息可能强化错误判断。
- 不同模型 Context Window 下行为不稳定。

### 候选最小方向，待讨论

- 在现有字符统计上补充 token 估算和重复来源观察。
- 设置防止失控的总量保护线，而不是立即激进压缩。
- 先移除运行诊断和完全重复的信息。
- 人格、当前消息、关系上下文和短期历史不作为优先裁剪对象。

### 待确认

- 当前主要模型的安全 Context 预算是多少？
- 多人物印象是否应完整注入？
- Tool Usage Prompt 是否需要每轮描述全部工具细节？

## P1-4：长期记忆只是滚动摘要

### 当前表现

长期记忆只有 `memorySummary` 和 `userProfile`。每个新 stage 被继续压入一个有长度限制的总体摘要。

### 影响

- 用户的重要生活事件可能逐渐消失。
- 阶段性进展、共同经历和关系变化没有独立身份。
- Agent 无法表达“我记得这件具体的事”。
- 无法单独修改、淡化或遗忘某一条记忆。

### 候选最小方向，待讨论

- 保留现有总体摘要作为概览。
- 另外保存 Agent 主动选择的重要事件。
- 重要事件记录 Agent 为什么想记住它，而不只保存事件文本。

### 待确认

- Agent 应在每轮结束时判断，还是在场景结束时判断记忆价值？
- Agent 可以完全自主写入，还是某些敏感记忆需要限制？
- 长期事件是否会自然淡化、被重新理解或主动遗忘？

## P1-5：当前 userProfile 来自临时状态

### 当前表现

`userProfile` 主要根据以下内容生成：

- 当前 conversation mode。
- 当前 interaction state。
- 近期 user mood。

### 影响

- 当前处于工作场景可能被描述成用户长期偏好工作模式。
- 一次受挫可能变成稳定用户特征。
- “当前状态”和“长期印象”混淆。

### 候选最小方向，待讨论

- 先将现有字段降级为 recent interaction summary。
- 暂停由临时情绪直接覆盖稳定用户印象。
- 稳定印象只由多次观察或 Agent 明确判断形成。

### 待确认

- 是否还需要名为 user profile 的客观画像？
- 或者更符合产品定位的是“Agent 对用户的当前印象”？
- 印象被用户质疑后，应该立刻修改还是先主动回忆？

## P1-6：Scene 低置信度时直接屏蔽历史焦点

### 当前表现

当 Scene 置信度低或判断为 uncertain 时：

- 不运行 WorldFocus。
- 不允许注入历史 WorldFocus。

### 影响

- 上一轮仍相关的人物或世界观可能突然消失。
- 对短句、代词和隐式承接不友好。
- 当前策略偏向“宁可少带”，与产品方向不一致。

### 候选最小方向，待讨论

- 低置信度时不把历史焦点认定为当前主焦点。
- 但保留为低置信背景，让主 Agent 自己结合用户表达判断。

### 待确认

- 历史焦点作为背景时需要保留哪些信息？
- 场景明确切换后是否仍保留轻量线索？
- 多久没有再次相关后，历史焦点才应自然退出？

## 初步推进顺序

此顺序只表示建议的讨论和验证顺序，不代表方案已经确定。

### 第一组：先修复明确的信息缺失

1. 完成 P0-4 的最近轮排除、自然指代兜底和统一 Recall 验收测试。
2. 工具完整结果过早压缩。
3. Scene 低置信度时保留必要的历史焦点背景。

### 第二组：收敛 Context 可观测性和噪声

1. 移除不必要的运行诊断 Prompt。
2. 将首次注入和工具循环汇入最终 Context Manifest。
3. 基于现有分段统计观察重复信息，再决定是否设置保护线。

### 第三组：推进人格化长期记忆

1. 将重要事件与滚动摘要分离，并让 Agent 根据行为偏好选择值得记住的事件。
2. 区分短期状态和 Agent 对用户的长期印象，梳理印象受质疑后的主动回忆与重新判断流程。

## 后续逐项讨论模板

之后讨论每一个问题时，统一回答：

1. 当前代码的真实行为是什么？
2. 这个行为在哪些实际对话中会失败？
3. 目标行为是什么？
4. 最小改动方案是什么？
5. 是否会影响人格自主性或上下文丰富度？
6. 如何用测试对话验证？
7. 失败后是否容易回退？
