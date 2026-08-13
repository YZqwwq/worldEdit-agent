# AI Service Agent Tool 系统改进计划

## 现状概览

当前 Tool 系统已经具备以下基础能力：

- 使用 `defineAgentTool` 统一声明输入、输出、风险、幂等性、上下文保留策略和 UI 状态。
- 通过 `always`、`quick_access`、`activated` 实现工具渐进披露。
- 主 Agent 与子 Agent 使用不同注册表，具备基本的最小权限隔离。
- 写操作部分使用 `expectedRevision` 防止覆盖并发修改。
- 工具结果使用 `evidence`、`ephemeral`、`none` 三种上下文保留策略。
- 已接入工具调用统计、Trace、UI stage 和标准结果 Envelope。

主要改进方向集中在执行安全、工具结果传递、注册表一致性和声明语义落地。

## 产品前提：安全边界不主导 Agent 人格与行动倾向

本项目的首要目标是构建具有稳定人格、自主判断和连续行动能力的 Agent。安全系统不应通过全局谨慎度、统一前置拦截或大量安全 Prompt，持续改变 Agent 的思考方式和行为风格。

采用以下边界：

- Agent 可以依据自身人格、情绪、上下文和任务目标，自主决定是否调用工具。
- 人格系统可以影响 Agent 是否主动查证、如何解释风险、是否倾向询问，但不直接承担安全授权职责。
- Tool Registry 和 ToolNode 负责能力发现、调用编排和结果传递，不应根据人格数值统一拦截危险工具。
- 真正危险且不可逆的动作，由对应工具在内部完成确认和最终执行判断。
- 工具拒绝执行不终止 Agent Graph；工具应把结构化拒绝结果和后续提示返回给 AI，让 AI 继续思考、解释、调整方案或请求其他输入。
- 安全机制应尽可能局部、明确、可恢复，只约束具体危险动作，不扩大成对 Agent 整体行为的调制。

## P0：人格系统与安全授权解耦

### 当前问题

- 高风险工具当前由 `personaPolicy.tool` 决定是否确认或放行，安全授权与人格风险偏好耦合。
- 谨慎人格会频繁拦截写入工具，直接改变 Agent 的行动风格；冒险人格则可能绕过确认。
- 当前确认发生在通用 `toolNode`，它不了解具体工具的业务目标、实际影响范围和最合适的确认文案。
- persona detector 失败时可能没有 `toolPolicy`，现有通用检查还存在不一致行为。
- 工具拒绝后缺少面向 AI 的标准恢复协议。

### 改进方案

以下内容描述目标架构。由于工具内部确认属于后置场景，当前阶段不能单独移除现有拦截；迁移必须在内部确认协议就绪后一次完成。

- 从 `personaPolicy` 中移除 `confirmBeforeSensitiveTools` 和 `allowRiskyTools` 这类安全授权开关。
- 移除 `toolNode` 基于人格指标的通用确认和拒绝逻辑；ToolNode 只负责调用工具和传递工具结果。
- 保留 `riskLevel`、`readOnly`、`idempotent` 等 metadata，用于 UI 展示、审计、Trace 和工具内部策略，不把它们转化成全局人格约束。
- 由真正涉及危险动作的工具自行实现确认协议，使工具能够根据业务语义展示准确的目标、影响和后果。
- 工具内部确认应发生在副作用之前；未确认或被拒绝时，业务 Service 不得执行实际写入。
- Agent 仍可自由发起危险工具调用，确认机制只决定这一次具体副作用能否落地。
- 人格可以影响确认后的表达方式，但不能伪造用户确认，也不能绕过工具内部确认。

### 危险工具内部确认协议（后置事项，当前阶段暂不实现）

该场景暂时只记录设计方向，不纳入当前阶段开发范围。后续实现时建议采用可暂停、可恢复的工具协议：

1. Agent 正常调用危险工具。
2. 工具识别到需要确认，返回 `confirmation_required`，同时携带确认请求 ID、目标摘要、影响范围和风险说明；此时不执行副作用。
3. UI 向用户展示确认信息，用户可以批准或拒绝。
4. 用户拒绝时，可以选择补充拒绝理由。
5. 拒绝结果返回工具运行时，工具生成结构化拒绝结果以及可信的 `promptForAgent`。
6. Agent Graph 不因拒绝而结束，AI 接收结果后继续运行，可以解释拒绝、调整方案、请求补充信息或选择其他工具。

建议的拒绝结果结构：

```ts
type ToolConfirmationRejectedResult = {
  status: 'rejected'
  code: 'USER_REJECTED'
  confirmationRequestId: string
  message: string
  refusalReason?: string
  promptForAgent: string
  retryable: boolean
}
```

其中：

- `promptForAgent` 由系统根据拒绝状态生成，用于告诉 AI 本次动作没有执行以及允许的下一步。
- `refusalReason` 是用户补充的数据，应作为引用内容传给 AI，不得直接拼接成高优先级系统指令。
- 拒绝是一次正常、可恢复的工具结果，不应被视为 Graph 异常。
- 如果后续再次发起同类操作，应创建新的确认请求，不能复用已经拒绝的确认状态。
- 最终确认数据可以绑定工具名、关键参数、目标 ID、revision 和有效期，但具体票据实现留到该场景正式开发时确定。

### 验收标准

- Agent 的人格、情绪和自主性不会被通用安全策略重写。
- `toolNode` 不再依据 persona 数值决定危险工具是否执行。
- 危险工具确认机制完成后，未确认或被拒绝的动作不会触达有副作用的业务 Service。
- 用户拒绝后，AI 能拿到拒绝状态和可选拒绝理由，并继续完成当前 Graph 运行。
- persona detector 是否成功，不影响工具内部确认协议的一致性。

## P1：避免工具完整结果在同轮推理前丢失

### 当前问题

- 标准 ToolMessage 只包含执行状态，不包含完整 `envelope.data`。
- `toolContextReloadNode` 在下一次模型调用前移除原始 tool-call transcript。
- 普通结果只保留有限长度的字符串摘要。
- 长文档、人物详情、实体关系和任务 Trace 可能在模型真正消费前已被截断。

### 改进方案

- 将工具结果拆分为三种表示：
  - `modelPayload`：供紧接着的一次模型推理使用的完整或结构化结果。
  - `retainedSummary`：后续循环使用的压缩摘要。
  - `artifactRef`：大结果的持久化引用，可按需分页或重新读取。
- 原始 ToolMessage 至少保留到下一次 LLM 调用完成，之后再进行 transcript 清理。
- 不再由 `toolNode` 根据工具名硬编码摘要逻辑；允许每个工具声明 `buildModelPayload` 和 `buildRetainedSummary`。
- 对长内容工具使用分页、游标或片段读取，避免直接把超大结果塞入上下文。
- 写工具需要的关键字段不得被摘要截断，例如：
  - `documentId`
  - `revision`
  - `entityId`
  - 完整待编辑正文或可读取正文的 artifact 引用
- 为模型上下文设置按 token 预算计算的压缩策略，而不是仅按字符数截断。

### 验收标准

- `read_world_document` 返回长正文后，下一次模型调用能够访问完整正文或可靠 artifact。
- 模型不会在只看到 700 字符摘要的情况下执行完整文档覆盖。
- transcript 清理后，后续循环仍保留足够的证据摘要和来源引用。

### 2026-08-01 实施状态

- 核心结果协议已经落地：只读工具默认把完整校验结果放入 `modelResult`，写工具默认只交付状态与 receipt。
- Tool transcript 会保留到紧接着的模型调用成功完成，再迁移为本轮 evidence 或释放。
- 新增 `npm run test:tool-result`，已验证长正文不被静默截断，以及写工具不会回显整篇写入正文。
- 最终 Context Manifest 已能在 Trace 中标识活跃 Tool transcript，便于继续做真实模型对话验收。

## P1：优化 Quick Access，而不是将其作为安全边界

### 当前问题

- 快捷槽基于全局累计调用次数，没有时间衰减。
- 统计没有按用户、workspace 或场景隔离。
- 失败调用也可能影响排名。
- toolset 级快捷槽可能因为一个高频工具而暴露大量无关 Schema，增加上下文成本和误调用概率。

### 改进方案

- Quick Access 只负责工具发现效率和上下文成本，不承担危险动作的最终安全控制。
- 优先采用 tool 级快捷槽，避免因为一个高频工具暴露整个 toolset。
- 是否进入快捷槽主要依据近期相关性、调用成功率、workspace 和任务场景，而不是用风险等级压制 Agent 的能力选择。
- 危险工具即使对模型可见，最终副作用仍由工具内部确认协议控制。
- 统计只记录成功调用，并增加近期窗口或时间衰减。
- 根据需要按 workspace、用户或项目维度隔离统计。
- 对快捷槽决策增加 Trace，记录入选原因、分数和被过滤原因。

### 验收标准

- 长期未使用的工具会退出快捷槽。
- 失败调用不会提高工具排名。
- toolset 中无关工具不会因为单一工具高频使用而整体进入上下文。
- Quick Access 的变化不会绕过或替代危险工具内部确认。

## P2：增加注册表启动校验

### 当前问题

- `AgentToolRegistryEntry.access` 与 `agentMetadata.readOnly` 是重复信息，可能出现不一致。
- `key`、工具名、toolset 和 audience 缺少集中一致性校验。
- `toToolMap` 遇到重名时会静默覆盖。
- 不存在的 toolset 或空 toolset 可能直到运行时才暴露问题。

### 改进方案

- 应用启动时执行 `validateToolRegistry()`，发现错误直接阻止启动或在开发环境抛错。
- 至少校验：
  - `key` 和 `tool.name` 全局唯一。
  - 每个 `toolsetId` 都存在。
  - `access=read` 必须对应 `readOnly=true`。
  - `access=write/delegate/control` 与风险和只读声明一致。
  - main/child/shared audience 与所在注册表一致。
  - 危险工具内部确认协议启用后，对应工具必须声明自身确认策略。
  - `turnCallLimit` 必须是正整数。
  - quick access 的 scope、相关性和场景配置有效。
- `toToolMap` 遇到重名时抛错，不允许静默覆盖。
- 尽量从工具 metadata 派生 registry 属性，减少重复声明。

### 验收标准

- 构造重名工具、未知 toolset 或 readOnly 冲突时，测试能稳定失败。
- 所有现有主 Agent 和子 Agent 注册项通过一致性校验。

## P2：让声明的 Tool 语义真正参与编排

### 当前问题

- `completionSemantics` 主要进入结果 Envelope，没有实际控制 eventual 工具的后续行为。
- `turnCallLimit` 类型允许任意数字，但当前执行器主要处理值为 1 的情况。
- `task_context` 与 `manual` 在可见性判断中没有实质区别。

### 改进方案

- 为 `completionSemantics=eventual` 定义明确状态机：
  - accepted
  - running
  - awaiting_input
  - completed
  - failed
- eventual 工具成功只表示任务已受理，禁止模型宣称最终工作已完成。
- 将工具调用次数记录为 `toolName -> count`，严格执行任意正整数 `turnCallLimit`。
- 明确三种激活模式：
  - `always`：始终可见。
  - `manual`：必须经显式激活或安全快捷槽暴露。
  - `task_context`：仅在匹配的 task capability/context 存在时可见。
- 对非法激活原因返回结构化错误，而不是简单表现为 tool not found。

### 验收标准

- eventual 工具受理后，模型只能报告“已登记/执行中”。
- `turnCallLimit=2` 时第三次调用被稳定拦截。
- `task_context` 工具不能通过普通手动激活绕过任务上下文限制。

## P2：提供结构化错误分类

### 当前问题

所有业务异常大多被统一转换为 `TOOL_EXECUTION_FAILED`，模型无法可靠区分 revision 冲突、资源不存在、权限不足、超时和临时错误。

### 改进方案

- 新增 `AgentToolError`：

```ts
type AgentToolErrorCode =
  | 'NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'PERMISSION_DENIED'
  | 'CONFIRMATION_REQUIRED'
  | 'CONFIRMATION_EXPIRED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'TEMPORARY_UNAVAILABLE'
  | 'INTERNAL_ERROR'
```

- 错误对象至少包含：
  - `code`
  - `message`
  - `retryable`
  - 可选 `details`
  - 可选 `nextSuggestions`
- `defineAgentTool` 保留已知业务错误码，仅将未知异常转换为 `INTERNAL_ERROR`。
- ToolMessage 的逻辑失败应明确标记为 error，便于 Trace、统计和模型适配器统一识别。

### 验收标准

- revision 冲突能引导 Agent 重新读取，而不是盲目重试。
- not found 不会被误判为临时系统故障。
- 失败调用不会进入成功统计或生成成功 receipt。

## P1：统一工具副作用记录层（ChangeSet + EffectReceipt）

### 要解决的问题及影响

当前工具可以直接修改业务数据库，Turn Workspace 也已经能保存 `durableToolReceipts`，但两者之间尚未形成适用于所有副作用工具的正式协议。文档、图片、地图或实体工具增多后，Agent 可能只知道工具调用结束，却无法稳定判断哪些对象已经改变、哪些尚未开始、哪些在崩溃边界处结果未知。

- 用户交互影响：复杂编辑被中断或部分失败时，Agent 可能重复执行已经生效的操作、错误宣称全部完成，或者无法准确说明哪些修改需要人工核对。
- 开发维护影响：如果每种资源分别实现一套 Turn 跟随记录，中断、恢复、审计和撤销逻辑会随工具数量重复扩张，并产生不同资源间不一致的语义。

### 目标边界

建立一层统一、轻量的副作用记录，而不是为全部工具建设虚拟文件系统：

1. **业务存储仍是事实来源。** 文档、图片、地图和实体继续由各自 Service 与数据库保存。
2. **EffectReceipt 记录一个真实副作用动作的结果。** 所有有副作用的工具接入同一协议；只读工具不接入，结果仍作为可丢弃或可压缩的 Turn 证据。
3. **ChangeSet 聚合同一轮或同一任务的多个 EffectReceipt。** 它用于向 Agent 和用户解释整体进度，并为后续审阅、提交和撤销提供组织边界。
4. **Turn Workspace 只保存投影。** 当前 `durableToolReceipts` 是正式记录层的 Workspace 投影，用于中断封存和下一轮承接，不替代业务事实和持久化 EffectReceipt。
5. **AI 只消费紧凑摘要。** 底层 revision、幂等键和恢复状态由运行时维护，模型不负责手工拼装或修复记录。

关系如下：

```text
工具调用
  ├─ 业务修改（最终事实）
  └─ EffectReceipt（动作、目标、结果与恢复依据）
          └─ ChangeSet（一次任务内的聚合视图）
                  └─ Workspace / Turn Snapshot（当前 Turn 的稳定投影）
```

### 最小数据模型草案

字段只保留恢复、审计和 Agent 解释实际需要的信息，具体存储结构在第一阶段实现时确定：

```ts
type EffectReceipt = {
  eventId: string
  turnId: string
  changeSetId: string
  toolCallId: string
  idempotencyKey?: string
  operation: string
  subject: { type: string; id: string }
  status: 'completed' | 'failed' | 'aborted' | 'unknown'
  beforeRevision?: string | number
  afterRevision?: string | number
  summary: string
  diffRef?: string
  resultRef?: string
  compensatable?: boolean
  completedAt?: string
}

type ChangeSet = {
  id: string
  eventId: string
  turnId: string
  status: 'open' | 'completed' | 'partial' | 'unknown'
  receiptIds: string[]
  summary?: string
}
```

`planned` 是副作用执行前的状态标记，不代表动作已经发生。工具完成后必须落为明确 Receipt；进程无法证明结果时转为 `unknown`，恢复逻辑不得盲目重放。对于能与业务修改共用事务的本地操作，可以在同一事务内直接产生 completed Receipt，从而不暴露中间窗口。

### 原子性与暂存边界

- 同一 SQLite 或同一事务资源中的修改，应让“业务修改 + 小型 EffectReceipt”共用事务；不把完整 Turn Snapshot 放进业务事务。
- 同一事务能够覆盖的多个对象，可以作为一个 ChangeSet 原子提交。
- 图片等大文件先写入临时区或内容寻址存储，事务只切换最终引用并写 Receipt；失败时清理未引用对象。
- 外部服务无法与本地数据库形成真正原子事务，使用幂等键、执行前 planned 标记、结果 Receipt、补偿动作和 `unknown` 核对流程。
- 暂存区只服务于“多个对象必须一起生效”的编辑任务，不强迫所有副作用工具先暂存。普通单对象写入继续直接执行并记录 Receipt。
- 删除能力暂不进入本阶段；统一记录层先覆盖创建、更新、移动、重命名等已有写操作。

### 工具接入约束

- `readOnly=true` 的工具不创建 ChangeSet 或 EffectReceipt。
- 有副作用的工具必须声明其目标类型、幂等方式、revision 能力和可否补偿，并在成功、失败或结果未知时返回统一执行状态。
- ToolNode 负责把已持久化 Receipt 的摘要投影到 Workspace，不根据具体资源类型写文档、图片或地图专用分支。
- 业务适配器负责把工具操作与实际事务连接起来；新增资源类型只实现统一副作用适配接口。
- ChangeSet 完成不等于用户任务完成。Agent 仍根据目标判断是否需要继续，但不能在存在 `partial` 或 `unknown` 时宣称全部成功。
- EffectReceipt 只描述已经执行或无法确认结果的动作，不保存模型思维过程，也不替代业务版本历史。

### 分阶段迁移

1. **协议定型：** 以现有 `durableToolReceipts` 为投影基础，统一 completed、failed、aborted、unknown 语义和稳定标识。
2. **世界文档验证：** 选择现有文档创建、更新、移动和重命名工具，实现最小持久化 EffectReceipt，并与业务修改尽可能同事务提交。
3. **ChangeSet 聚合：** 让同一 Turn 的多个文档动作形成可读的整体摘要，验证部分完成、中断承接和崩溃核对。
4. **渐进扩展：** 图片、地图、实体编辑出现实际需求时逐类接入统一适配接口，不一次性迁移全部工具。
5. **版本与撤销：** 在 Receipt 稳定后复用 revision、diff/ref 和补偿信息建设审阅与撤销，不让 ChangeSet 自行承担完整业务版本库职责。

### 验收标准

- 世界文档业务修改成功后，业务事实和对应 Receipt 不会出现一边成功、一边永久缺失。
- 用户中断时，下一轮能准确说明已经完成、未开始、失败和需要核对的动作。
- 崩溃恢复不会自动重放 `unknown` 副作用；可通过幂等键或业务 revision 核对真实结果。
- 一个 ChangeSet 包含多个动作时，可以明确表达全部完成、部分完成或结果未知。
- 新增一种副作用资源时，不需要分别修改 Turn、中断、恢复和审计主链。
- 只读工具不承担额外持久化成本，完整 Turn Snapshot 不进入业务修改事务。

### 已完成基础（2026-08-13）

- 非只读工具成功返回后，已将 operation、subject、completion、summary、evidenceRef、payload 和完成时间写入 Turn Workspace 的 `durableToolReceipts`。
- 写入回执后会立即形成稳定 Turn Version checkpoint，不再依赖下一个 Graph 节点启动。
- 用户中断会等待当前有副作用工具完成回执边界；只读工具仍允许直接抛弃。
- 这解决了正常中断中的 Workspace 无感知，但尚未解决进程在业务提交与 checkpoint 之间被强杀的窗口；该窗口由本节的持久化 Receipt 与 `planned/unknown` 协议继续收口。

## 测试补充

建议至少增加以下测试层次：

### 单元测试

- `defineAgentTool` 输入、输出、异常和 Envelope 校验。
- registry 唯一性与元数据一致性校验。
- tool visibility 和三种 activation mode。
- quick access 相关性、成功率与时间衰减。
- 不同 `contextRetention` 的上下文行为。

### Graph 集成测试

- catalog → activate → concrete tool 的完整循环。
- 读取长文档 → 下一轮模型可见正文 → revision 写入。
- eventual 子 Agent 工具不会被误报为已完成。
- 工具失败后 transcript 清理不会丢失恢复所需信息。

### 危险工具确认协议测试（后置场景实现时补充）

- 确认请求与工具名、关键参数、目标和 revision 正确绑定。
- 用户拒绝后业务 Service 没有执行副作用。
- 拒绝理由作为数据返回，不会被提升成系统指令。
- AI 收到拒绝结果后继续运行，而不是终止 Graph。
- 已拒绝、过期或已消费的确认请求不能复用。
- persona detector 的状态不会改变工具内部确认结果。

### 回归测试

- 世界观只读查询。
- 文档创建、更新、移动、重命名和删除。
- 人物编辑子 Agent 的最小权限边界。
- 工具调用统计和快捷槽生成。

## 推荐实施顺序

### 当前阶段

1. [x] 修复工具完整结果在同轮推理前丢失的问题，并增加核心协议测试。
2. [x] 增加 registry 启动校验和关键单元测试。
3. [ ] 优化 Quick Access 的相关性、作用域、时间衰减和统计逻辑。
4. [x] 落实 `completionSemantics`、`turnCallLimit` 和 `task_context` 语义。
5. [x] 引入结构化业务错误并完善工具结果恢复能力。
6. [ ] 优化工具目录检索、上下文 token 预算和观测指标。

### 后置阶段：危险工具确认场景

1. 为危险工具实现内部确认、批准和拒绝协议。
2. 支持用户在拒绝时补充理由，并把拒绝结果返回 AI 继续运行。
3. 完成副作用隔离、目标/revision 绑定和确认协议测试。
4. 在工具内部协议可用后，再移除 `toolNode` 的 persona 安全开关与通用前置拦截，避免出现无保护的过渡状态。
