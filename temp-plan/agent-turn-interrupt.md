# Agent Turn 中断方案

## 决策

主 Agent 不再提供“暂停并继续同一个 Turn”。用户运行中控制统一收敛为“中断当前 Turn”。

中断是当前消息和 Turn 的终态。系统停止当前运行，封存中断前已经产生的内容，原子提交可发布结果，然后让该消息离开调度链并释放 Agent Runtime 执行槽。

应用崩溃、进程退出和数据库恢复不是用户中断，仍由 `turn-version-design.md` 单独处理。

## 更改原因

### 产品语义

本项目的主 Agent 具有持续人格和对话关系。用户在 Agent 说话或行动时插话，更自然的含义是“打断这一轮并开始新的交流”，而不是冻结内部 Graph 后再从某个函数位置恢复。

下一轮 Agent 应知道自己刚才已经说过什么、完成了哪些工具动作，以及用户在什么阶段打断了它。这比向用户暴露暂停点、HEAD、回退和继续等工作流概念更符合对话产品。

### 系统复杂度

真正暂停同一个 Graph 需要维护 continuation、安全边界、重复继续保护、进程内执行槽与持久化恢复之间的两套状态。LangGraph 的原生 interrupt 也会结束本次调用并依赖 checkpointer 重新调用节点，不会冻结 JavaScript 调用栈。

中断可以复用已有 AbortController、Turn Workspace、执行账本和统一提交入口，不需要额外维护 `pause_requested/paused/resuming` 状态机。

### 一致性

旧实现把暂停事实同时写入消息队列、Event、Turn 和 Version，并在继续时重新入队原 Event，容易形成两个执行所有者。中断后当前消息直接进入终态，不存在重新领取、顺序竞争和重复恢复。

## 生命周期

```text
消息队列
  未处理 -> 正在处理 -> 离开调度集合
                         completed / interrupted / failed / cancelled

Agent Runtime
  running -> interrupt_requested -> interrupted
```

1. 用户发起中断，入口按当前 `eventId + turnId` 定位活动运行。
2. Runtime 通过 AbortSignal 停止当前模型流或可取消工具。
3. 不再开始新的模型、工具或子 Agent 动作。
4. 收集中断前已经写入 Turn Workspace 的稳定现场。
5. 通过唯一的 `commitInterruptedTurn` 原子提交。
6. 事务成功后 Turn 进入 `interrupted`；队列收到提交回执后把 Event 标记为 `completed`，消息离开调度集合。
7. Runtime 释放执行槽，队列可以领取下一条未处理消息。

## 中断提交

中断表示当前 Agent 处理已经结束。最近稳定 HEAD 中已经形成的 Workspace 缓存全部正式提交；尚未进入稳定缓存的瞬时计算和在途工具结果不伪装为已完成。

### 完整封存

- 原始用户消息与发送时页面快照。
- 已经展示给用户的流式 AI 文本。
- Turn Workspace 基础快照与当前 Draft。
- 本轮执行账本及任务阶段。
- 已完成工具和子 Agent 的结果、收据与证据引用。
- 正在执行或尚未开始动作的最后状态。
- 中断原因、时间和运行位置。

### 正式发布

- 已经展示的部分 AI 文本，消息状态标记为 `interrupted`。
- 已完成且有明确回执的工具结果。
- 稳定 HEAD 中的 Persona、Mood、Memory、Memory Slots、Observation 和其他 Workspace Draft。
- “用户在此处打断当前 Turn”的 Interaction Observation。

### 已持久化工具副作用边界

2026-08-13 已接通用户中断场景：有副作用工具成功返回后，Runtime 会立即把结构化回执写入 `TurnWorkspace.draft.durableToolReceipts`，并以 `toolContextReloadNode` 为继续位置形成稳定 checkpoint。用户中断如果发生在工具执行期间，Runtime 会等待当前有副作用工具完成回执 checkpoint，再读取稳定 HEAD 和提交 interrupted Turn；只读工具不阻塞中断。

用户体验影响：修正前文档可能已经修改，但 Agent 在中断后仍认为动作没有发生，导致重复修改或错误说明；修正后 interrupted Turn 能准确封存已落地动作。

维护影响：修正前数据库事实、Turn Workspace 与 Final interruption receipt 可能互相矛盾；现在正常用户中断链路拥有统一的持久化回执边界。进程在“业务数据库提交完成、回执 checkpoint 尚未写入”的极短窗口内强杀，仍需后续 `planned/receipt/unknown` 协议处理，不把本次修复扩大成跨数据库事务。

### 不属于可提交缓存

- 未完成回复不能标记为完整结论。
- 没有回执的外部工具副作用。
- 仍处于模型内部计算或尚未进入 Workspace 的内容。

中断不会回退已经形成的稳定缓存，也不会恢复旧 Turn；下一轮直接读取本轮已经提交的状态。

## 工具边界

- 已完成：保存工具结果和 receipt，下一轮可直接引用。
- 未开始：记录 `not_started`，不产生影响。
- 可取消且执行中：请求取消并记录 `aborted`。
- 可能已经产生副作用但无法确认：记录 `unknown`，下一轮不得自动重放非幂等动作。

工具调用前后的 `planned/receipt/unknown` 仍是后续恢复和中断准确性的必要基础。

## 下一轮承接

短期上下文应明确提供：

- 上一轮由用户主动中断。
- 中断前已经向用户展示的部分回复。
- 已经完成并可使用的工具证据。
- 尚未完成、已取消或状态未知的动作。

这些信息是执行事实，不是隐藏思维链。Agent 可以自然承接用户的新消息，而不需要先声明“正在恢复上一轮”。

未来可以在提交成功后另行加入一个最高优先级的 `interruption_followup` Event，让 Agent 反问或进行自我整理。它必须属于新的 Turn；当前阶段不创建该事件。

## 第一阶段范围

- 删除暂停、继续和暂停回退产品入口。
- 删除队列 `pausedEvent` 及原 Event 重新入队逻辑。
- 保留一个明确的用户中断入口。
- 建立唯一 `commitInterruptedTurn`。
- 支持模型流中断和稳定 Workspace 提交。
- 普通对话与后台人格阶段共用 Turn Version 中断边界；后台阶段不再丢弃稳定 Workspace。
- 暂不创建中断后的高优先级 Agent 后续消息。
- 不在本阶段修改应用崩溃恢复策略。

## 验收标准

1. 中断后 Turn 只进入一次 `interrupted`；Queue Event 在收到提交回执后进入 `completed`。
2. 部分流式回复在 UI 和数据库中一致，并明确标记为未完成。
3. 已完成工具结果不会丢失，也不会在下一轮无意义重跑。
4. 未完成工具不会被误报为成功。
5. 最近稳定 HEAD 中的 Memory、Persona、Mood 和 Slot 会完整发布，节点内尚未落入稳定缓存的瞬时结果不会被猜测提交。
6. 中断提交事务失败时不释放执行槽，也不留下部分终态。
7. 提交成功后执行槽只释放一次，队列按原顺序领取下一条消息。
8. 下一轮 Agent 可以准确知道上一轮被打断前已经完成了什么。

实现说明：Event 是否完成只由队列在 Turn 提交回执之后判断，不再保留无消费方的 `eventCommitted` 返回字段。
