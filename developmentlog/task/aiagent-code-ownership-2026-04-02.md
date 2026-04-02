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

### 2. 主控运行时节点

目录：

- `src/main/services/aiservice/runtime/lifecycle/*`
- `src/main/services/aiservice/runtime/notification/*`
- `src/main/services/aiservice/runtime/orchestration/*`

当前包含：

- `lifecycle/mainAgentLifecycleControlService.ts`
- `lifecycle/nodes/awaitingUserInputNode.ts`
- `lifecycle/nodes/taskLifecycleIntentNode.ts`
- `lifecycle/nodes/taskLifecycleSynthesisNode.ts`
- `orchestration/mainAgentEffectApplierService.ts`
- `notification/taskNotificationConsumerService.ts`
- `notification/nodes/taskNotificationConsumeNode.ts`
- `notification/nodes/taskNotificationDecisionNode.ts`
- `notification/nodes/taskNotificationEffectNode.ts`
- `orchestration/mainAgentEventOrchestration.ts`

这部分都属于主 agent 的图外控制面。

它们不进入 `agentReactSystem.ts`，因为负责的是：

- event 分流
- 生命周期判断
- notification 消费
- orchestration 阶段控制

而不是：

- persona
- context
- LLM 推理
- tool 调用
- memory 写入

### 3. 主图适配与编排层

目录：

- `src/main/services/aiservice/runtime/*`

当前仍然保留的主控适配层：

- `mainAgentChatRuntimeService.ts`
- `mainAgentEntryService.ts`

这层的职责是：

- 接收 event
- 调用主控节点
- 组装 effect
- 执行 orchestration
- 适配 LangGraph 主图

一句话：

- `agentrsystem/node/*` 是“图内执行节点”
- `runtime/lifecycle|notification|orchestration/*` 是“图外主控控制面”
- `runtime/*.ts` 是“主图适配层与共享 runtime 服务”

---

## 二、消息队列职责

目录：

- `src/main/services/aiservice/runtime/queue/*`

本轮已归位：

- `mainAgentDispatchQueueService.ts`
- `mainAgentEventLogQueueService.ts`
- `mainAgentEventRecoveryQueueService.ts`
- `taskNotificationDispatchBridge.ts`

这部分负责：

- 主 agent 事件排队
- task notification 入主队列桥接
- 调度串行消费
- event 持久化与恢复

这层本质上是“调度信封层”，因此不进入主图，也不和 lifecycle / notification 决策节点混放。

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
- `characterEditorRuntimeSupport.ts`

这部分属于“子 agent runtime 控制面”，不是主图节点本身，也不是具体 executor 节点。

---

## 四、任务域职责

目录：

- `src/main/services/task/*`

本轮归位后：

- `taskContinuationService.ts`

它当前负责：

- executor start 入口的统一调用
- active task continuation 统一入口
- 调用 awaiting-input 决策节点
- 调用 registry 中的 `startHandler / continuationHandler`

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

### 主控控制面拆分

已收敛到：

- `runtime/lifecycle/nodes/awaitingUserInputNode.ts`
- `runtime/lifecycle/nodes/taskLifecycleIntentNode.ts`
- `runtime/lifecycle/nodes/taskLifecycleSynthesisNode.ts`
- `runtime/orchestration/mainAgentEffectApplierService.ts`
- `runtime/notification/nodes/taskNotificationConsumeNode.ts`
- `runtime/notification/nodes/taskNotificationDecisionNode.ts`
- `runtime/notification/nodes/taskNotificationEffectNode.ts`
- `runtime/orchestration/mainAgentEventOrchestration.ts`

并删除旧的散点文件。

### runtime spec 支撑文件

当前 `character_editor` 的 executor-specific runtime spec 支撑能力已收敛到：

- `aiservice/child-agent-system/characterEditorRuntimeSupport.ts`

这里集中放置：

- `startHandler` 对应的任务创建逻辑
- inspection input/output section 生成
- `missingFields / recommendedNextTool` 等展示语义

---

## 七、下一轮建议继续收拢的点

### P1

- 继续评估 `MainAgentEntryService` 是否需要拆出更纯粹的 runtime adapter / bootstrap 角色

### P1

- 将 `runtime` 根目录里仍然偏“控制面”的文件继续收敛，避免根目录再次堆平
- 为 `runtime/lifecycle` 和 `runtime/notification` 增加更稳定的 index 或 barrel strategy（如果团队认为有必要）
- 继续抽出跨 executor 可复用的 inspection schema，避免每个 executor 都重新组织输入/输出字段

### P1

- 将主图适配层与控制面层的边界继续写入设计文档与 inspection 工具，减少后续误放文件

### P2

- 评估 `mainAgentChatRuntimeService.ts` 是否应更明确地作为“主图运行适配器”
- 评估 `runtime/orchestration/mainAgentEventOrchestration.ts` 中结果构造函数是否继续节点化 / reducer 化

---

## 当前任务

1. `character_editor` 续跑语义继续收敛
- 重点文件：
  - `src/main/services/aiservice/child-agent-system/nodes/characterEditorContinuationNode.ts`
  - `src/main/services/aiservice/child-agent-system/characterEditorExecution.ts`

2. continuation spec 继续从 executor 私有字段上升
- 重点文件：
  - `src/main/services/aiservice/ai-utils/tools/character/shared.ts`
  - `src/main/services/task/subAgentRegistry.ts`
- 任务说明：
  - 这是协议层升级项，不影响当前 LLM 主图与子 agent 的既有运行链
  - 可按“系统级 continuation envelope + executor 私有 context”方式渐进改造

3. inspection 通用语义继续抽象
- 重点文件：
  - `src/main/services/aiservice/child-agent-system/characterEditorRuntimeSupport.ts`
  - `src/main/services/task/taskExecutionInspectionMapper.ts`
  - `src/main/services/aiservice/ai-utils/tools/task/getActiveTaskContext.ts`

4. 后续 executor 接入模板化
- 重点文件：
  - `src/main/services/task/subAgentRegistry.ts`
  - `src/main/services/task/taskContinuationService.ts`

---

## 总结

当前代码责任已经比之前更清晰：

- 主图决策不再散落成普通 resolver / handler
- 队列代码开始收口到 `runtime/queue`
- 子 agent continuation 已进入 `child-agent-system`
- 任务 continuation 入口已回到 `task` 域

这一步还不是最终形态，但已经建立了后续继续重构时可持续的目录规则。
