# 撤回能力实现边界

更新时间：2026-08-29。

本文件只记录撤回能力的实现边界与推进顺序。撤回不是单一的“删除消息”动作，而是根据消息是否已被 Agent 消费、是否已产生工具结果、是否已产生持久副作用，选择不同的收束路径。

## 目标

撤回能力同时服务两个目标：

1. 尽可能贴近通信工具的对话体验；
2. 保持工具能力的事实完整性，不把已经发生的副作用伪装成从未发生。

核心原则：

- 用户可见消息可以隐藏或标记撤回，但底层事实记录不能被伪造删除；
- 尚未被 Agent 消费的排队消息，撤回后 Agent 不应看到，也不应创建业务副作用；
- 已经进入 Turn 的消息，撤回必须以 Turn 为执行边界，而不是只修改 Message 行；
- 工具返回结果必须使用统一的回退协议；
- 真正的副作用回退由被操作主体自己的版本管理服务完成；
- 主 Agent 只负责发起撤回、等待回退结果、整理用户可见状态，不直接操作各主体的历史版本。

## 四种操作

### 1. 撤回排队消息

适用条件：

```text
Event.status = queued
Turn 尚未 processing
```

处理流程：

```text
cancelQueuedEvent(eventId)
→ 原子确认 Event 仍为 queued
→ Event.status = cancelled
→ User Message.status = reverted
→ 如果已创建但尚未运行 Turn，则 Turn.status = cancelled
→ 从内存队列移除或在取出前再次跳过
```

要求：

- Agent 不应读取该消息；
- 不运行 Persona、Memory、Context、Model 或 Tool；
- 不创建可见 AI 回复；
- 保留 Event 的取消 tombstone，防止重启后重复消费；
- Trace 记录取消原因，但不把消息正文重新注入 Agent。

### 2. 中断当前 Turn

适用条件：

```text
Event.status = processing
Turn.status = processing
Run 正在执行
```

处理流程：

```text
interruptTurn(turnId)
→ AbortController.abort()
→ 等待正在运行的 durable tool 完成其 receipt 边界
→ Turn.status = interrupted
→ 保存稳定 Workspace / Recovery Version
→ 按产品策略保留或隐藏已生成的部分 AI 回复
```

中断只表示“停止继续执行”，不表示已经回滚所有状态。它与完整 Turn 撤回必须是两个不同 API。

### 3. 撤回工具结果

适用条件：

```text
工具调用已经返回
但用户只要求 Agent 不再基于该结果继续推理
```

统一流程：

```text
retractToolObservation(toolCallId)
→ 标记该工具观察为 retracted
→ 从 pending/evidence/ephemeral 后续上下文移除
→ Execution Ledger 保留该调用发生过的事实
→ ToolMessage 可以从用户可见层隐藏
→ 如果没有持久副作用，Turn 可以继续或重新规划
```

只读工具的结果可以被撤回；但 Tool Effect Receipt 不能因为 UI 撤回而删除。

### 4. 撤回完整 Turn

适用条件：

```text
用户明确要求撤回本轮消息及本轮产生的状态影响
```

处理流程：

```text
revertTurn(turnId)
→ 停止当前 Run（如果仍在运行）
→ 隐藏/标记 User Message 与 AI Message
→ 恢复 Memory checkpoint
→ 请求 Persona / Memory Slots / LifeState 的主体版本服务回退
→ 请求各 Tool Effect 对应主体执行补偿或版本恢复
→ 标记不可回退项
→ Turn.status = reverted
→ 写入撤回 Observation 与 Trace
```

完整 Turn 撤回只有在所有必需主体都返回可接受结果后，才能向用户宣称“已完整撤回”。如果存在不可逆或补偿失败的副作用，必须返回部分撤回状态，并明确说明保留项。

## 统一工具回退协议

工具不再只返回“成功/失败”和自由格式文本。所有可能产生副作用的工具，都应在统一结果 Envelope 中声明回退能力：

```ts
type ToolRollbackDescriptor = {
  supported: boolean
  mode: 'version_restore' | 'compensating_action' | 'none'
  subjectType: string
  subjectId: string
  baseRevision?: number
  resultingRevision?: number
  rollbackToken?: string
  rollbackAction?: string
  reason?: string
}
```

工具结果至少包含：

```ts
type ToolResultEnvelope = {
  ok: boolean
  toolName: string
  toolCallId: string
  completion: ToolCompletion
  receipt?: ToolEffectReceiptPayload
  rollback?: ToolRollbackDescriptor
  data?: Record<string, unknown>
  message?: string
}
```

约束：

- `receipt` 说明已经发生的工具事实；
- `rollback` 说明该事实是否可以被主体版本服务回退；
- 工具本身可以提供回退 token 或补偿动作描述，但不应自行跨主体修改历史；
- 主 Agent 不解析具体文档、角色或地图版本结构，只传递标准回退请求。

## 主体版本服务职责

每个可被工具修改的主体，都应提供统一能力：

```ts
interface SubjectVersionAuthority {
  canRollback(input: {
    subjectType: string
    subjectId: string
    targetRevision?: number
    rollbackToken?: string
  }): Promise<{
    allowed: boolean
    reason?: string
  }>

  rollback(input: {
    subjectType: string
    subjectId: string
    targetRevision?: number
    rollbackToken?: string
    reason: 'turn_revert' | 'tool_result_retract'
  }): Promise<{
    status: 'rolled_back' | 'partially_rolled_back' | 'rejected'
    resultingRevision?: number
    commitId?: string
    message?: string
  }>
}
```

主体版本服务负责：

- 校验目标版本仍可恢复；
- 检查是否有后续冲突提交；
- 生成新的恢复 Commit，而不是篡改历史；
- 记录 `restoredFromCommitId`、原因和操作者；
- 处理选择性回退或补偿动作；
- 明确返回完整、部分或拒绝结果。

主 Agent Turn 服务只负责协调，不直接调用文档表、角色表或地图表的底层回退逻辑。

## 事实与投影

撤回时各层职责保持不变：

| 层 | 撤回时的职责 |
|---|---|
| Message | 用户可见性与消息状态投影 |
| Event | 队列输入是否取消、是否已消费 |
| Turn | 本轮是否中断、撤回、完成 |
| Run / Graph | 停止当前执行、保存恢复边界 |
| Execution Ledger | 保留已发生调用、记录撤回动作 |
| Tool Effect Receipt | 保留真实副作用事实，不伪造删除 |
| Subject Version Service | 执行主体版本恢复或补偿 |
| Memory / Persona / LifeState | 按各自 revision 规则回退 |
| Observation | 记录用户撤回这一事实 |
| Trace | 记录撤回决策、耗时、关联 ID 和失败原因 |

## 状态结果

撤回接口不应只返回 `ok: boolean`，至少需要区分：

```ts
type RetractionOutcome =
  | 'queued_cancelled'
  | 'turn_interrupted'
  | 'tool_observation_retracted'
  | 'turn_reverted'
  | 'partially_reverted'
  | 'rejected'
```

部分撤回需要包含：

```ts
type RetractionReport = {
  outcome: RetractionOutcome
  turnId?: number
  eventId?: string
  revertedMessageIds: number[]
  rolledBackSubjects: Array<{ type: string; id: string; revision?: number }>
  retainedEffects: Array<{ receiptId?: string; changeSetId?: string; reason: string }>
  message: string
}
```

## 推进顺序

1. 将当前 `revertLastChatTurn()` 拆成明确的 `cancelQueuedEvent`、`interruptTurn`、`retractToolObservation`、`revertTurn` 四类接口。
2. 先实现排队消息取消，保证 Agent 未消费时无业务副作用。
3. 统一工具结果 Envelope，所有副作用工具都返回 `receipt + rollback` 描述。
4. 为文档、角色、地图等主体实现 `SubjectVersionAuthority` 适配器。
5. 在 Turn 撤回协调器中按 Receipt 分组调用主体版本服务。
6. 处理冲突、后续提交和不可逆副作用，返回 `partially_reverted` 而不是伪装成功。
7. 最后接入 UI：区分“撤回消息”“停止生成”“撤回工具结果”“撤回整轮”。

## 暂不承诺

- 在主体没有版本管理或补偿能力之前，不宣称工具副作用可完整撤回；
- 不通过删除 Trace、Message 或 Effect Receipt 来伪造回滚；
- 不把所有主体的回退逻辑塞入主 Agent Turn Service；
- 不把“中断当前生成”自动解释成“完整 Turn 撤回”。
