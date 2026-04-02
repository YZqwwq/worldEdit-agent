# AI Agent 评估问题记录（2026-04-02）

本文记录本轮对项目 AI-agent 部分的代码评估结果，重点覆盖：

- 主 agent 生命周期控制
- 子 agent 续跑链路
- `character_editor` 的补参与执行行为
- runtime spec / registry 的实际落地一致性

---

## 1. awaiting_user_input 阶段对用户输入的吸收过于激进

### 问题描述

当前只要 active task 处于 `awaiting_user_input`，主 agent 就会直接把用户输入交给 continuation service 继续执行，而不会先判断这条输入到底是不是“有效补参”。

这意味着以下输入也可能被错误吸收：

- 进度询问
  - 例如“现在进度怎么样？”
- 暂停性表达
  - 例如“等等，我再想想”
- 含糊反馈
  - 例如“不是这个”
- 新意图切换
  - 例如用户开始说另一件事

### 当前行为

- `mainAgentLifecycleControlService` 在检测到 `activeTask.status === 'awaiting_user_input'` 后，直接调用 `taskContinuationService.continueActiveTask(text)`
- `characterEditorContinuation` 再把该输入当作世界名、角色名或新一轮 `userRequest` 写入后续 execution

### 风险

- 会把非补参型消息错误写进任务执行链
- 用户体验会表现为“系统误解了我的话”
- 任务可能进入错误分支并继续后台执行
- 某些输入会直接触发异常，导致当前 `user_message` 事件失败

### 额外一致性问题

生命周期层和 continuation 层对“取消语义”的识别规则不一致。

- 生命周期层取消词见：
  - `src/main/services/aiservice/runtime/mainAgentLifecycleControlService.ts`
- continuation 层取消词见：
  - `src/main/services/task/characterEditorContinuation.ts`

例如：

- 生命周期层没有把“结束”识别为取消
- continuation 层却把“结束”识别为取消型输入并抛错

结果是：

- 输入“结束”
- 不会先走任务取消
- 反而会进入 continuation
- 最后抛出 `The user reply looks like a cancellation, not a continuation payload.`

### 代码位置

- `src/main/services/aiservice/runtime/mainAgentLifecycleControlService.ts`
- `src/main/services/task/characterEditorContinuation.ts`

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

- `src/main/services/task/characterEditorContinuation.ts`
- `src/main/services/aiservice/child-agent-system/characterEditorExecution.ts`

---

## 3. runtime spec 已抽象，但 timeout 仍未完全通过 registry entry 驱动

### 问题描述

当前代码已经把 executor runtime spec 抽到了 `subAgentRegistry`，包括：

- `dispatchHandler`
- `continuationHandler`
- `timeoutPolicy`
- `retryPolicy`
- `protocol`

但 `character_editor` 的 dispatch handler 内部仍然直接使用 `defaultTimeoutPolicy`，并不是从当前 registry entry 自身注入 timeout。

### 含义

这说明 runtime spec 的设计方向是对的，但 timeout 这块还没有完全做到“声明即生效”。

### 风险

- 文档和真实执行路径存在偏差
- 后续若要按 executor 定制 timeout，会优先在这里出现不一致
- registry 的可扩展性已经有了，但行为仍然带有“默认实现硬编码”的尾巴

### 代码位置

- `src/main/services/task/subAgentRegistry.ts`

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
  - `src/main/services/task/characterEditorContinuation.ts`

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

## 5. registry 还没有覆盖任务创建入口

### 判断

这条分析也是正确的。

当前 runtime spec 已经覆盖了：

- `dispatchHandler`
- `continuationHandler`
- `timeoutPolicy`
- `retryPolicy`
- `protocol`

但“如何启动一个 executor 的新任务”还没有进入 registry。

### 当前体现

`character_editor` 的创建入口仍然主要写在：

- `taskContinuationService.ts`

包括：

- 目标解析
- 初始 task/execution 创建
- 初始 payload 组装
- 任务 summary / title 生成
- 首次 enqueue

这些都还是 `character_editor` 启动逻辑本体，而不是 runtime spec 中的 `startHandler` 之类统一入口。

### 代码位置

- `src/main/services/aiservice/taskContinuationService.ts`
- 对照：
  - `src/main/services/task/subAgentRegistry.ts`

### 含义

这说明当前系统已经做到：

- “续跑入口 registry 化”

但还没有做到：

- “任务启动入口 registry 化”

也就是说，runtime spec 目前更像是“执行期 registry”，还不是完整的“任务全生命周期 registry”。

### 风险

- 新增 executor 时，容易继续把 start logic 堆进 `taskContinuationService`
- 启动逻辑和续跑逻辑会分散在不同层，扩展成本增加
- registry 还不能真正成为“单一 executor runtime 真源”

---

## 6. 展示层和调试层仍保留 character_editor 特判

### 判断

这条分析基本正确，而且是当前 runtime spec 落地阶段很典型的中间态。

协议解析本身已经开始走 runtime spec，但展示语义还没有完全泛化。

### 当前体现

在展示与调试相关代码中，仍然存在明显的 `character_editor` 特化处理：

- `taskExecutionInspectionMapper.ts`
  - 有 `buildCharacterEditorInputSection`
  - 有 `buildCharacterEditorOutputSection`
  - 有 `formatCharacterPendingPhase`
  - 输入/输出 section 仍按 `executorKind === 'character_editor'` 分支
- `getActiveTaskContext.ts`
  - `getMissingFields()` 直接按 `phase=resolve_world|resolve_character` 推导
  - `recommendedNextTool` 仍然直接特判 `character_editor`

### 代码位置

- `src/main/services/task/taskExecutionInspectionMapper.ts`
- `src/main/services/aiservice/ai-utils/tools/task/getActiveTaskContext.ts`

### 需要说明的边界

这里不是“完全没有统一”。

因为它已经部分统一了：

- notification payload 的解析走了
  - `getSubAgentRuntimeSpec(...).protocol.parsePayload(...)`

但还没有完全统一到“展示与调试语义”层，例如：

- phase 的可视化名称
- missing fields 的推导
- 输入/输出面板的字段组织方式
- recommended next tool 的建议逻辑

### 含义

这说明 runtime spec 已经进入：

- 运行路径
- 协议解析路径

但还没有完全进入：

- 调试路径
- 展示路径
- inspection 语义层

### 风险

- 新增 executor 时，调试面板和上下文工具会继续追加分支
- 最终会出现“运行层可扩展，展示层难扩展”的结构不对称
- executor-specific 语义可能散落到多个界面辅助层中

---

## 总结

本轮最优先的问题不是分层结构，而是“任务等待补参时，系统对用户输入的判断过于乐观”。

优先级建议：

1. 先修正 `awaiting_user_input` 阶段的输入吸收规则
2. 再修正 `resolve_character` 场景下 continuation 对用户补充信息的合并逻辑
3. 再补齐 continuation spec / start entry / 展示语义 这三块尚未完全统一的层
4. 最后把 timeout policy 真正收拢到 runtime spec 的实例化路径里

---

## 相关文件

- `src/main/services/aiservice/runtime/mainAgentLifecycleControlService.ts`
- `src/main/services/task/characterEditorContinuation.ts`
- `src/main/services/aiservice/child-agent-system/characterEditorExecution.ts`
- `src/main/services/task/subAgentRegistry.ts`
