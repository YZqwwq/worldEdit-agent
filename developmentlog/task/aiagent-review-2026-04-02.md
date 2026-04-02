# AI Agent 评估问题记录（2026-04-02）

本文记录本轮对项目 AI-agent 部分的代码评估结果，重点覆盖：

- 主 agent 生命周期控制
- 子 agent 续跑链路
- `character_editor` 的补参与执行行为
- runtime spec / registry 的实际落地一致性

---

## 1. awaiting_user_input 阶段的误续跑风险已完成第一轮收敛

### 当前状态

这条问题已完成第一轮修复，不再是当前最高优先级阻塞项。

主 agent 现在不会在 `awaiting_user_input` 下无条件直通 continuation，而是先经过统一的安全分流：

- `continue_task`
- `cancel_task`
- `ask_status`
- `clarify`

当前实现已收敛到：

- `src/main/services/aiservice/runtime/lifecycle/mainAgentLifecycleControlService.ts`
- `src/main/services/aiservice/runtime/lifecycle/nodes/awaitingUserInputNode.ts`
- `src/main/services/task/taskContinuationService.ts`

### 已完成修复

- 生命周期层不再在 `awaiting_user_input` 下直接续跑
- 取消 / 问进度 / 澄清 / 继续 已统一先走同一个决策入口
- continuation 入口也复用了同一个闸门，避免工具侧绕过聊天入口误续跑

### 剩余关注点

- 词表 / 小模型 / fallback 的边界仍可继续调优
- 当前属于“已止血并收口”，不是“语义层绝对最终版”

---

## 2. 角色名未命中 / 多候选时，用户补充的新角色信息可能被静默忽略

### 问题描述

当前 continuation 只会在 `pendingContext.targetCharacterName` 为空时，才用新的用户回复覆盖角色名：

- `resolve_character` 阶段
- 若 `targetCharacterName` 已存在
- 则用户本轮输入不会替换该字段

但在真实流程里：

- “未找到该角色”
- “找到多个同名角色”

这两种情况通常都会保留原始 `targetCharacterName`，等待用户补充更精确的信息。

于是用户虽然补充了新描述，但下一轮 execution 仍然可能继续使用旧名字。

### 当前行为后果

- 用户补充的信息没有被真正纳入下一轮 payload
- 子 agent 继续按旧角色名查询
- 任务反复卡在同一类追问上
- 用户会感觉“我已经说了，但系统没听进去”

### 典型死循环表现

1. 用户先给出一个角色名
2. 系统发现该角色不存在或有多个候选
3. 用户提供更具体的名字或附加说明
4. continuation 没有覆盖原角色名
5. 下一轮仍按旧名字查找
6. 再次回到 `needs_input`

### 代码位置

- `src/main/services/aiservice/child-agent-system/nodes/characterEditorContinuationNode.ts`
- `src/main/services/aiservice/child-agent-system/characterEditorExecution.ts`

---

## 3. timeout policy 已完成收口到 registry entry 驱动

### 当前状态

这条问题已完成修复。

当前 `dispatchHandler` 不再直接读取 `defaultTimeoutPolicy`，而是通过当前 executor 的 registry entry 注入 timeout。

### 当前实现

- `src/main/services/task/subAgentRegistry.ts`
  - `dispatchHandler` 已通过 `runtime.timeoutPolicy.resolveTimeoutMs()` 取值
- `src/main/services/task/subAgentDispatcherService.ts`
  - dispatch 时把当前 registry entry 作为 runtime 配置注入 handler

### 当前含义

这意味着 timeout 现在已经真正属于 runtime spec 的实例化配置，而不是 dispatch handler 私有硬编码。

---

## 4. pendingContext 仍然是受控的 executor 私有 continuation 语言

### 判断

这条分析是正确的。

当前 `pendingContext` 还没有升级成系统级统一 continuation spec，而是由 `character_editor` 自己定义、自己生产、自己消费的一组受控字段。

### 当前体现

`character_editor` 当前依赖的 continuation 语义明显带有 executor 私有字段，例如：

- `phase`
- `lastNeedsInputMessage`
- `targetWorldName`
- `targetCharacterName`
- `resolvedWorldId`
- `resolvedEntityId`

这些字段由执行侧生成，再由 continuation 侧按同一套约定读取。

### 代码位置

- 生产侧：
  - `src/main/services/aiservice/child-agent-system/characterEditorExecution.ts`
- 消费侧：
  - `src/main/services/aiservice/child-agent-system/nodes/characterEditorContinuationNode.ts`

### 含义

这不一定是坏事，因为当前它仍然是：

- 受控的
- schema 约束过的
- 单 executor 闭环内可理解的

但它确实说明：

- continuation 协议层还没有完全统一
- runtime spec 已经统一了 dispatch / continuation handler 的挂载点
- 但 continuation payload 的内部语义，仍然主要由各 executor 私下约定

### 风险

- 后续新增 executor 时，容易继续复制“各写各的 pendingContext 方言”
- 展示层、调试层、恢复层会更难做真正通用化
- registry 虽然知道“由谁续跑”，但还不知道“续跑上下文长什么样”

---

## 5. 任务创建入口已进入 runtime spec，但仍只覆盖 character_editor

### 当前状态

这条问题已完成第一轮修复。

当前 runtime spec 现在已经覆盖：

- `dispatchHandler`
- `startHandler`
- `continuationHandler`
- `timeoutPolicy`
- `retryPolicy`
- `protocol`

### 已完成修复

- `character_editor` 的 start logic 已从 `taskContinuationService.ts` 抽出
- 当前启动逻辑已进入：
  - `src/main/services/aiservice/child-agent-system/characterEditorRuntimeSupport.ts`
- `taskContinuationService.ts` 现在只保留任务域统一入口，再通过：
  - `src/main/services/task/subAgentRegistry.ts`
  调用 `startHandler`

### 代码位置

- `src/main/services/aiservice/child-agent-system/characterEditorRuntimeSupport.ts`
- `src/main/services/task/taskContinuationService.ts`
- `src/main/services/task/subAgentRegistry.ts`

### 含义

这说明 runtime spec 已不再只是“执行期 registry”，而是开始进入“任务启动 + 执行 + 续跑”一体化入口。

### 剩余缺口

- 当前只覆盖 `character_editor`
- 新增 executor 时，仍需要补齐各自的 `startHandler`

---

## 6. 展示层和调试层对 character_editor 的特判已开始收敛，但还未彻底消失

### 当前状态

这条问题已完成第一轮收敛，但还不是最终形态。

### 已完成收敛

- `taskExecutionInspectionMapper.ts`
  - 已不再按 `executorKind === 'character_editor'` 直接硬分支
  - 改为通过 registry entry 的 `inspection` adapter 取输入/输出 section
- `getActiveTaskContext.ts`
  - 已不再直接按 `phase` 特判 `missingFields`
  - 已改为优先读取 registry entry 的 `inspection.getMissingFields()`
  - `recommendedNextTool` 也已改为优先读取 `inspection.getRecommendedNextTool()`

### 当前体现

`character_editor` 的 inspection 语义已经进入 runtime spec，但 executor-specific 展示实现目前仍然存在于：

- `src/main/services/aiservice/child-agent-system/characterEditorRuntimeSupport.ts`

### 代码位置

- `src/main/services/task/taskExecutionInspectionMapper.ts`
- `src/main/services/aiservice/ai-utils/tools/task/getActiveTaskContext.ts`
- `src/main/services/aiservice/child-agent-system/characterEditorRuntimeSupport.ts`

### 需要说明的边界

这里已经不是“展示层完全没统一”，而是：

因为它现在已经通过 runtime spec 统一了调用入口：

- `inspection.buildInputSection`
- `inspection.buildOutputSection`
- `inspection.getMissingFields`
- `inspection.getRecommendedNextTool`

但还没有完全统一到“跨 executor 的通用 inspection schema”层，例如：

- phase 的可视化名称
- missing fields 的推导
- 输入/输出面板的字段组织方式
- recommended next tool 的建议逻辑

### 含义

这说明 runtime spec 现在已经进入：

- 运行路径
- 协议解析路径
- inspection 入口路径

但还没有完全进入：

- 调试路径
- 展示路径
- inspection 语义层

### 风险

- 新增 executor 时，仍需要各自补 inspection adapter
- 如果不继续抽象公共 inspection 语义，executor-specific 字段组织仍会继续累积

---

## 总结

本轮最优先的问题不是分层结构，而是“任务等待补参时，系统对用户输入的判断过于乐观”。

优先级建议：

1. 继续修正 `resolve_character` 场景下 continuation 对用户补充信息的合并逻辑
2. 再补齐 continuation spec 与 inspection 通用语义这两块尚未完全统一的层
3. 最后继续把新增 executor 接入同一套 `startHandler + inspection` runtime spec 结构

---

## 当前任务

1. 继续完善 `resolve_character` 的 continuation 合并语义
- 校准“新回复覆盖旧角色名”后的 payload 合成规则
- 继续验证 `userRequest / originalUserRequest / pendingContext` 在补参续跑时的边界

2. 推进 `pendingContext -> continuation spec`
- 明确哪些字段应上升为系统级 continuation 语义
- 降低 executor 私有 pendingContext 方言继续扩散的风险
- 这是结构协议升级任务，当前不阻塞 LLM 运行链，可独立排期推进
- 目标是把 `pendingContext` 从 executor 私有续跑上下文，升级为系统级 continuation envelope + executorContext

3. 抽象 inspection 通用语义
- 从 `characterEditorRuntimeSupport.ts` 中继续提炼跨 executor 可复用的 inspection schema
- 让 `missingFields / phaseLabel / recommendedNextTool / input-output section` 进一步通用化

4. 为后续 executor 接入补齐 runtime spec 模板
- 新 executor 默认需要接入 `startHandler`
- 新 executor 默认需要接入 `inspection`
- 保持 `dispatch / start / continuation / timeout / retry / protocol / inspection` 为统一真源

---

## 当前剩余优先项相关文件

- `src/main/services/aiservice/runtime/lifecycle/mainAgentLifecycleControlService.ts`
- `src/main/services/aiservice/runtime/lifecycle/nodes/awaitingUserInputNode.ts`
- `src/main/services/aiservice/child-agent-system/nodes/characterEditorContinuationNode.ts`
- `src/main/services/aiservice/child-agent-system/characterEditorExecution.ts`
- `src/main/services/task/taskContinuationService.ts`
- `src/main/services/task/subAgentRegistry.ts`
