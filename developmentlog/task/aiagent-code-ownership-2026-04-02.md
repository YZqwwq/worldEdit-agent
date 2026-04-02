# AI Agent 代码责任地图（2026-04-02）

本文用于明确当前项目中 AI-agent 相关代码的责任边界。

目标不是一次性把所有代码都重构完，而是先建立稳定的归类规则：

- 属于主图的，进入主图节点或主图适配层
- 属于消息队列的，归于 queue
- 属于子 agent 的，进入 child-agent-system
- 属于基础工具的，归于通用工具层

---

## 一、主图职责

### 1. 主图执行节点

目录：

- `src/main/services/aiservice/agentrsystem/node/*`

当前包含：

- `personaNode`
- `contextNode`
- `llmCall`
- `toolNode`
- `memoryNode`

这部分属于主 agent 的 LangGraph 主图执行路径。

### 2. 主控决策节点

目录：

- `src/main/services/aiservice/runtime/nodes/*`

当前包含：

- `awaitingUserInputNode.ts`
- `taskLifecycleIntentNode.ts`
- `taskNotificationDecisionNode.ts`

这部分虽然还没有接入 `agentReactSystem.ts` 那张主图，但语义上已经属于主 agent 的“决策节点层”，不再散落为普通 helper / handler。

### 3. 主图适配与编排层

目录：

- `src/main/services/aiservice/runtime/*`

当前仍然保留的主控适配层：

- `mainAgentLifecycleControlService.ts`
- `mainAgentChatRuntimeService.ts`
- `mainAgentEventOrchestration.ts`
- `mainAgentEffectApplierService.ts`
- `taskNotificationConsumerService.ts`
- `mainAgentEntryService.ts`

这层的职责是：

- 接收 event
- 调用主控节点
- 组装 effect
- 执行 orchestration
- 适配 LangGraph 主图

一句话：

- `agentrsystem/node/*` 是“图内执行节点”
- `runtime/nodes/*` 是“图外主控决策节点”
- `runtime/*.ts` 是“主控编排与适配层”

---

## 二、消息队列职责

目录：

- `src/main/services/aiservice/runtime/queue/*`

本轮已归位：

- `mainAgentDispatchQueueService.ts`
- `taskNotificationDispatchBridge.ts`

这部分负责：

- 主 agent 事件排队
- task notification 入主队列桥接
- 调度串行消费

### 仍与队列强相关、但尚未移动的文件

- `mainAgentEventLogService.ts`
- `mainAgentEventRecoveryService.ts`

它们已经在语义上明显属于 queue / recovery 控制面，后续建议继续向 `runtime/queue` 收拢。

---

## 三、子 Agent 职责

### 1. 子 agent 执行节点

目录：

- `src/main/services/aiservice/child-agent-system/*`
- `src/main/services/aiservice/child-agent-system/nodes/*`

本轮归位后：

- `characterEditorExecution.ts`
- `nodes/characterEditorContinuationNode.ts`

这部分负责：

- 子 agent 执行图
- 子 agent continuation 合并逻辑
- executor-specific pendingContext 消费

### 2. 子 agent 运行控制面

目录：

- `src/main/services/task/*`
- `src/main/services/task/queue/*`

当前职责：

- `subAgentRegistry.ts`
- `subAgentDispatcherService.ts`
- `subAgentCapabilityService.ts`
- `queue/subAgentExecutionQueueService.ts`

这部分属于“子 agent runtime 控制面”，不是主图节点本身，也不是具体 executor 节点。

---

## 四、任务域职责

目录：

- `src/main/services/task/*`

本轮归位后：

- `taskContinuationService.ts`

它当前负责：

- 新任务创建入口
- active task continuation 统一入口
- 调用 awaiting-input 决策节点
- 调用 registry 中的 continuation handler

注意：

`taskContinuationService.ts` 现在已经归到任务域，这比放在 `aiservice/` 下更符合真实职责。

---

## 五、基础工具职责

### 1. 通用工具基础设施

目录：

- `src/main/services/aiservice/ai-utils/core/*`

当前包含：

- `agentTool.ts`
- `toolUsagePrompt.ts`

这是通用工具层，负责：

- tool 定义协议
- tool result envelope
- tool 使用说明拼装

### 2. 工具注册层

目录：

- `src/main/services/aiservice/ai-utils/toolkits/*`

这是主 agent / child-agent 的工具注册清单。

### 3. 具体工具实现

目录：

- `src/main/services/aiservice/ai-utils/tools/*`

当前按领域拆分为：

- `character/*`
- `task/*`
- `world/*`

这部分属于业务工具，不属于主控节点，也不属于消息队列。

---

## 六、本轮已经完成的归位

### 主消息队列

- `middlelayer/event-in-wait/mainAgentDispatchService.ts`
  - -> `aiservice/runtime/queue/mainAgentDispatchQueueService.ts`

### 任务通知桥

- `task/taskNotificationDispatchBridge.ts`
  - -> `aiservice/runtime/queue/taskNotificationDispatchBridge.ts`

### 子 agent 执行队列

- `task/subAgentExecutionQueueService.ts`
  - -> `task/queue/subAgentExecutionQueueService.ts`

### 任务 continuation 入口

- `aiservice/taskContinuationService.ts`
  - -> `task/taskContinuationService.ts`

### character_editor continuation

- `task/characterEditorContinuation.ts`
  - -> `aiservice/child-agent-system/nodes/characterEditorContinuationNode.ts`

### 主控决策散点

已收敛到：

- `runtime/nodes/awaitingUserInputNode.ts`
- `runtime/nodes/taskLifecycleIntentNode.ts`
- `runtime/nodes/taskNotificationDecisionNode.ts`

并删除旧的散点文件。

---

## 七、下一轮建议继续收拢的点

### P1

- 将 `mainAgentEventLogService.ts` 归入 `runtime/queue`
- 将 `mainAgentEventRecoveryService.ts` 归入 `runtime/queue`

### P1

- 将 `mainAgentLifecycleControlService.ts` 中的 `buildHandledResult` 抽成显式 effect builder 节点
- 将 `prepareTaskLifecycle()` 抽成 `taskLifecycleSynthesisNode`

### P1

- 将 `taskNotificationConsumerService.ts` 进一步拆成：
  - consume node
  - effect builder node

### P2

- 评估 `mainAgentChatRuntimeService.ts` 是否应更明确地作为“主图运行适配器”
- 评估 `mainAgentEventOrchestration.ts` 中结果构造函数是否继续节点化 / reducer 化

---

## 总结

当前代码责任已经比之前更清晰：

- 主图决策不再散落成普通 resolver / handler
- 队列代码开始收口到 `runtime/queue`
- 子 agent continuation 已进入 `child-agent-system`
- 任务 continuation 入口已回到 `task` 域

这一步还不是最终形态，但已经建立了后续继续重构时可持续的目录规则。
