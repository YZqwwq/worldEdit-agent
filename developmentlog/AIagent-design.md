# AI Agent 架构评审记录

## 当前整体结构

从当前代码看，AI agent 相关部分已经形成了一条比较完整但耦合偏高的链路：

`renderer(Chat UI)`
`-> preload / IPC`
`-> AIService`
`-> LangGraph 主图`
`-> tools / task system / worldbuilding services`
`-> subagent execution`
`-> task notification / coordinator / main loop`
`-> Message / Task* records / Trace`

更具体一点，当前系统主要由这几层组成：

### 1. 前端聊天层

负责：

- 展示聊天记录
- 接收流式回复
- 展示调试面板
- 展示任务列表与 trace
- 轮询历史与任务快照

代表文件：

- `src/renderer/src/views/AIChatView.vue`
- `src/renderer/src/services/aiClientService.ts`
- `src/renderer/src/components/AILogPanel.vue`
- `src/renderer/src/components/TaskQueuePanel.vue`

---

### 2. Electron 接入层

负责：

- 暴露 IPC
- 将 renderer 请求转发给主进程服务

代表文件：

- `src/preload/index.ts`
- `src/main/services/aiservice/aiIpc.ts`

---

### 3. 主 agent 运行层

负责：

- 接收用户消息
- 驱动 LangGraph 主图
- 写聊天消息
- 与任务协调器发生交互

代表文件：

- `src/main/services/aiservice/aiService.ts`
- `src/main/services/aiservice/agentrsystem/agentReactSystem.ts`
- `src/main/services/aiservice/agentrsystem/node/*`

---

### 4. 任务与后台编排层

负责：

- 任务状态管理
- execution 队列
- notification 回传
- 主 agent 后台轮询接管
- 协调器判断静默处理 / 请求用户
- trace 埋点

代表文件：

- `src/main/services/task/taskService.ts`
- `src/main/services/task/taskExecutionService.ts`
- `src/main/services/task/taskNotificationService.ts`
- `src/main/services/task/subAgentDispatcherService.ts`
- `src/main/services/task/taskCoordinatorService.ts`
- `src/main/services/task/mainAgentLoopService.ts`
- `src/main/services/task/taskTraceService.ts`

---

### 5. tool 与业务领域层

负责：

- 主 agent 工具
- 子 agent 工具
- worldbuilding 读写
- 具体业务规则

代表文件：

- `src/main/services/aiservice/ai-utils/toolkits/*`
- `src/main/services/aiservice/ai-utils/tools/*`
- `src/main/services/worldbuilding/worldbuildingService.ts`

---

## 当前架构中不合理的地方

下面的问题并不意味着当前实现“不能工作”，而是说明它已经进入“功能能跑，但结构开始打架”的阶段。

---

## 一. 高耦合问题

### 1. `AIService` 已经变成事实上的 God Service

当前 `AIService` 同时负责：

- 聊天消息持久化
- agent stream 驱动
- graph log 转发
- purge / reset
- 在用户消息入口主动触发 `mainAgentLoopService.tick()`
- 判断是否走 `taskCoordinatorService.tryHandleUserReply()`
- 在补参场景下直接触发 dispatcher

这说明它已经混合了：

- 会话层职责
- agent runtime 职责
- 任务编排入口职责
- 存储职责

问题在于：

1. 任意一个任务编排变动都会影响聊天入口
2. 任务系统对聊天层形成了反向耦合
3. 后续如果引入多会话、多 agent runtime，会非常难拆

当前最需要拆分的地方之一就是这里。

---

### 2. 主任务协调逻辑被分散在多个入口

现在任务相关决策分散在：

- `taskNotificationNode`
- `taskLifecycleNode`
- `AIService.sendStreamMessage()`
- `TaskCoordinatorService`
- `MainAgentLoopService`

这导致“谁才是主 agent 的真正任务协调入口”并不清晰。

表现为：

1. 用户消息进来时，`AIService` 先主动 tick 一次 loop
2. 然后再试图走 `taskCoordinatorService.tryHandleUserReply()`
3. 如果没被协调器截获，又进入 LangGraph 主图
4. 而主图里仍然保留着 `taskNotificationNode`

这是一种典型的“双路径并存”的过渡结构。

它短期可用，但长期会造成：

- 行为解释困难
- 测试困难
- race condition 更难定位

---

### 3. `TaskCoordinatorService` 现在已经绑定具体 executor 细节

目前 `TaskCoordinatorService` 明确知道：

- `character_editor`
- `characterEditorPendingContextSchema`
- `delegateCharacterEditorTaskPayloadSchema`

这意味着“通用协调器”实际上已经被人物编辑场景侵入。

问题是：

1. 协调器本应只做“决策与路由”
2. executor-specific 的 payload 拼装应由各自 handler 管理
3. 现在如果再接入第二个、第三个子 agent，协调器会继续膨胀

因此这里需要尽快改成：

`Coordinator + ExecutorSpecificContinuationHandler Registry`

而不是把所有 continuation 规则写死在一个服务里。

---

### 4. tool 层直接耦合任务与业务基础设施

例如 `delegate_character_editor` 当前直接依赖：

- `worldbuildingService`
- `taskService`
- `taskExecutionService`
- `subAgentDispatcherService`

这意味着一个 tool 同时承担了：

- 参数校验
- 业务目标解析
- 任务创建
- execution 写库
- dispatcher 触发

tool 层已经不再只是 “LLM callable application boundary”，而开始直接操作底层系统。

更合理的方式应当是：

- tool 调 application use-case
- use-case 再调 task / worldbuilding / dispatcher

否则 tool 会越来越像控制器，难以复用也难以测试。

---

## 二. 职责不清晰的问题

### 1. `taskNotificationNode` 的职责已经和后台轮询重叠

在当前版本里：

- `MainAgentLoopService` 已经负责后台轮询 `pending_main_ack`
- `TaskCoordinatorService` 已经负责消费 notification

但主图里仍保留：

- `taskNotificationNode`

这会带来一个问题：

当前系统里“notification 是由后台主 agent 处理”，还是“由下一轮聊天主图处理”，并没有被架构上彻底定死。

这属于典型的过渡期冗余设计。

如果未来继续保留双路径，会出现：

1. 有些通知被后台 loop 抢先消费
2. 有些通知在用户对话回合里被消费
3. 两条路径的行为可能逐渐分叉

这个节点后续应该被明确：

- 要么彻底退役
- 要么只作为 fallback 恢复路径

但不能长期和 `MainAgentLoopService` 共享一等职责。

---

### 2. `taskLifecycleNode` 混合了太多事情

当前它同时承担：

- 用户输入分类
- 任务创建判断
- capability 检查
- task 创建
- 任务关闭
- experience recall

这已经不是一个单一职责节点，而是一个“小型 orchestrator”。

它的问题是：

1. prompt 很容易继续膨胀
2. 模型判断与副作用混在一起
3. 很难对“分类正确性”和“任务操作副作用”分开测试

更合理的拆法应当是：

- `taskIntentClassifier`
- `taskCapabilityResolver`
- `taskRegistrationAction`
- `experienceRecallNode`

现在这些都粘在一起了。

---

### 3. `contextNode` 已经变成“大杂烩 Prompt Builder”

当前 `contextNode` 一次性拼入：

- persona
- persona state
- task lifecycle notice
- recalled experiences
- tool usage prompt
- memory summary
- memory short-term history

这让它变成了一个“巨大上下文拼接器”。

问题在于：

1. 很难知道某条系统信息为什么进入 prompt
2. 任何一项上下文改动都要改这个节点
3. prompt 体积控制与调优会越来越困难

而项目里其实还保留了一套：

- `promptPipeline.ts`

但它当前并没有接入主链，形成了“已有抽象，但没真正落地”的状态。

这说明提示词构建层是职责不清的。

---

### 4. 用户可见消息与内部协调消息边界虽然在方向上正确，但实现还不够纯

现在方向是对的：

- 内部协调不直接进入聊天

但实际实现里，协调器一旦决定向用户发消息，就直接写 `Message` 表。

这会带来两个问题：

1. `Message` 既承载普通聊天，也承载后台编排消息
2. message source 只有一个宽泛的 `type` 字段，约束很弱

这不是立即要推翻的问题，但说明：

用户对话消息模型仍然偏弱，缺乏明确的 message source / origin 设计。

---

## 三. 冗余与过渡性设计

### 1. `PromptPipeline` 当前是明显的悬空设计

文件存在：

- `src/main/services/aiservice/pipeline/promptPipeline.ts`

但主链没有使用它。

这类“已经抽象、但未接入”的设计会带来两个问题：

1. 阅读代码时会误判它是正式架构的一部分
2. 后续维护者不清楚应继续沿哪条路走

如果短期不打算接入，应考虑：

- 明确标注实验性
- 或删除

---

### 2. `mainAgentToolkit` 中仍有明显 demo / 占位式工具

例如：

- `add` tool

这类工具在早期验证阶段很有用，但在当前架构里会稀释主 agent 工具集的真实职责边界。

它不是大问题，但属于典型的“原型期残留”。

---

### 3. 观测体系已经开始双轨并存

当前已有两套观测：

- `graphlog` / `AILogPanel`
- `TaskTraceRecord` / `TaskQueuePanel`

这本身没错，但边界还不够清晰。

现在更像是：

- 一套记录“图节点调试”
- 一套记录“任务编排时间线”

但在代码结构上还没有形成正式约定，所以未来非常容易继续重复造轮子。

应该明确：

- `graphlog`：开发时调试主图执行细节
- `taskTrace`：面向业务任务时间线的可观测状态

否则后面很容易第三次再引入一种“运行日志”。

---

## 最需要拆分的地方

按优先级排序，我认为最值得拆的不是 UI，而是以下几层：

### 1. 先拆 `AIService`

建议至少分成：

- `ChatMessageService`
  只负责消息存取

- `ChatRuntimeService`
  只负责驱动 LangGraph 主图流式输出

- `TaskInputRouter`
  只负责判断当前用户输入是普通聊天还是任务补参

这样 `AIService` 就不再是所有逻辑的落点。

---

### 2. 再拆 `TaskCoordinatorService`

改为：

- `TaskCoordinatorService`
  只做主 agent 的通用决策

- `TaskContinuationRegistry`
  按 executorKind 选 continuation handler

- `CharacterEditorContinuationHandler`
  处理人物编辑的 pendingContext 合并与 execution 续跑

这样协调器就不会继续绑定具体子 agent 细节。

---

### 3. 将 prompt 构建从 `contextNode` 拆出来

建议形成真正的 prompt assembler：

- `buildPersonaContext`
- `buildTaskContext`
- `buildMemoryContext`
- `buildToolPolicyContext`

由节点只负责调用，而不是手写所有拼接细节。

---

### 4. 将 `taskLifecycleNode` 拆成“判断”和“副作用”两层

建议拆为：

- `taskIntentInferenceService`
- `taskCapabilityService`
- `taskRegistrationService`

Node 只负责图内状态推进，不直接承担一堆副作用。

---

## 我认为当前最不清晰的一条边界

最需要尽快定下来的，不是“子 agent 怎么写”，而是：

**“任务通知到底由后台主 agent 处理，还是由下一轮聊天主图处理？”**

当前答案是：

- 两者都能碰到

这正是最危险的过渡状态。

后续应该明确为：

### 推荐方向

`notification 的一等处理入口 = MainAgentLoopService + TaskCoordinatorService`

而：

`taskNotificationNode 只作为恢复路径 / fallback`

如果沿这条路线继续走，系统边界会清晰很多。

---

## 建议的重构顺序

为了避免大改失控，我建议按下面顺序推进：

### 第一阶段：厘清主任务编排入口

1. 保留 `MainAgentLoopService`
2. 弱化 `taskNotificationNode`
3. 明确 notification 的唯一主处理入口

### 第二阶段：拆协调器与 continuation handler

1. 保留 `TaskCoordinatorService`
2. 引入 registry
3. 把 character_editor 的续跑逻辑迁出去

### 第三阶段：拆 AIService

1. 把消息读写抽出去
2. 把聊天 runtime 抽出去
3. 把任务补参路由抽出去

### 第四阶段：整理 prompt 构建层

1. 决定是否正式启用 `PromptPipeline`
2. 如果不用，就删掉
3. 如果用，就替代 `contextNode` 里的手工拼接

---

## 当前结论

当前这套 AI agent 架构的最大问题不是“功能不完整”，而是：

**它已经从单链路原型成长为多入口编排系统，但边界还停留在原型期。**

最典型的表现是：

1. `AIService` 过重
2. 任务协调入口重复
3. `TaskCoordinatorService` 被具体子 agent 侵入
4. prompt 构建层没有真正抽象完成
5. 观测体系开始多轨并存但未正式分层

如果继续在现有结构上只加功能不拆边界，后面一定会越来越难维护。

所以当前最重要的方向不是继续堆新能力，而是：

`先拆入口`
`再拆协调器`
`再拆 prompt 构建`

这样后续无论增加新子 agent、更多任务类型，还是更复杂的主-子 agent 互动，都不会继续把系统压回 God Service 和过渡性双路径结构。

---

## 可执行重构任务列表

下面这版不是“理想架构蓝图”，而是按当前工程实际状态拆出来的可执行改造计划。

目标是：

1. 每一轮都能独立落地
2. 每一轮都能单独验证收益
3. 不要求一次性推翻现有系统

---

## 第一轮：统一任务通知主入口

### 目标

先解决最危险的双路径问题：

`notification 到底由后台主 agent 处理，还是由聊天主图处理`

这一轮的目标是把它收敛成单一主入口。

### 任务

1. 明确 `MainAgentLoopService + TaskCoordinatorService` 为 notification 的唯一主处理入口
2. 将 `taskNotificationNode` 从主图中的“一等入口”降级为 fallback/recovery 入口
3. 在代码中加注释和约束，禁止新逻辑继续把 notification 消费写进主图主链
4. 为 notification 消费路径补一组最小测试场景：
   - `subagent_needs_input`
   - `subagent_completed`
   - `subagent_failed`

### 验收标准

1. notification 在正常流程中只由后台 loop 消费
2. 用户不发新消息时，主 agent 也能处理 pending_main_ack
3. 主图不再承担 notification 的主消费职责

### 预期收益

1. 消除任务协调入口重复
2. 降低 race condition 风险
3. 让任务系统行为更可解释

---

## 第二轮：拆分 TaskCoordinatorService

### 目标

解决“协调器被具体子 agent 侵入”的问题。

当前最明显的问题是：

`TaskCoordinatorService` 已经知道 `character_editor` 的 pendingContext 和 payload schema。

### 任务

1. 定义通用 continuation handler 接口

建议接口方向：

```ts
type TaskContinuationHandler = {
  canHandle(executorKind: TaskExecutorKind): boolean
  tryHandleUserReply(task: TaskRecord, userInput: string): Promise<...>
}
```

2. 新增 `TaskContinuationRegistry`
3. 将 `character_editor` 的补参续跑逻辑迁移到：
   - `CharacterEditorContinuationHandler`
4. 让 `TaskCoordinatorService` 只负责：
   - 收 notification
   - 做主 agent 层决策
   - 路由给 continuation handler

### 验收标准

1. `TaskCoordinatorService` 不再直接 import `characterEditorPendingContextSchema`
2. `TaskCoordinatorService` 不再直接拼 `delegateCharacterEditorTaskPayloadSchema`
3. 新增第二个 executor 时，不需要继续改协调器核心逻辑

### 预期收益

1. 协调器恢复通用性
2. 子 agent 扩展成本下降
3. continuation 逻辑更容易独立测试

---

## 第三轮：拆分 AIService

### 目标

解决 `AIService` 过重的问题。

### 任务

1. 抽出 `ChatMessageService`
   - `saveMessage`
   - `getHistory`
   - `clearHistory`
2. 抽出 `ChatRuntimeService`
   - 只负责驱动 `agent.streamEvents`
   - 只负责 stream chunk 转发
3. 抽出 `TaskInputRouter`
   - 判断用户输入是普通聊天还是任务补参
   - 决定是否先触发 loop tick
4. 让 `AIService` 只保留高层编排接口

### 验收标准

1. `AIService` 不再直接操作消息表细节
2. `AIService` 不再同时负责聊天 runtime 和任务补参路由
3. 每个 service 的文件尺寸和职责明显收敛

### 预期收益

1. 降低入口层耦合
2. 后续做多入口会更轻松
3. 更容易给聊天链路和任务链路分别写测试

---

## 第四轮：拆分 taskLifecycleNode

### 目标

把“模型判断”和“副作用执行”拆开。

### 任务

1. 抽出 `taskIntentInferenceService`
   - 只负责从用户输入推断：
     - `create_task`
     - `continue_task`
     - `confirm_close_task`
     - `none`
2. 抽出 `taskRegistrationService`
   - 只负责 capability check
   - 只负责 task create / close
3. 将 `experience recall` 从 `taskLifecycleNode` 剥离为独立节点或独立 service

### 验收标准

1. `taskLifecycleNode` 不再既做模型判断又做全部副作用
2. task 注册与关闭逻辑可以脱离图单独测试
3. experience recall 不再混在任务判定内部

### 预期收益

1. 主图节点职责更清晰
2. 任务分类错误更容易定位
3. 后续替换分类 prompt 成本更低

---

## 第五轮：整理 prompt 构建层

### 目标

解决 `contextNode` 大杂烩问题，并处理 `PromptPipeline` 的悬空状态。

### 任务

1. 二选一：
   - 正式启用 `PromptPipeline`
   - 或删除它并建立新的 context assembler
2. 将上下文拆成几类 builder：
   - persona context
   - task context
   - memory context
   - tool policy context
3. 为每类 context builder 建立明确输入输出
4. 限制 `contextNode` 只负责调用 assembler，不自己手工拼装所有内容

### 验收标准

1. `contextNode` 明显瘦身
2. prompt 组成项可以独立调试
3. 项目里不再同时存在“旧手工拼接”和“悬空 pipeline”两套思路

### 预期收益

1. prompt 调优效率提升
2. 上下文污染更容易控制
3. 后续接多 agent 时可复用 context builder

---

## 第六轮：正式分层观测体系

### 目标

解决 `graphlog` 和 `taskTrace` 双轨并存但边界模糊的问题。

### 任务

1. 明确文档约束：
   - `graphlog` 只用于图执行调试
   - `taskTrace` 只用于任务编排观测
2. 清理重复日志点，避免两边都记录同一类业务语义
3. 给任务组件只保留 task trace，不直接掺杂 graphlog
4. 给调试面板只保留 graphlog，不承担读业务时间线职责

### 验收标准

1. 两套观测的职责被写清楚
2. 前端展示边界稳定
3. 后续新增日志点时知道该落哪一侧

### 预期收益

1. 降低观测层冗余
2. UI 语义更清晰
3. 维护者不再困惑“哪个日志才是准的”

---

## 每轮优先级建议

### P0

- 第一轮：统一任务通知主入口
- 第二轮：拆分 TaskCoordinatorService

原因：

这两轮直接影响主-子 agent 的正确性和可扩展性，是当前最紧急的问题。

### P1

- 第三轮：拆分 AIService
- 第四轮：拆分 taskLifecycleNode

原因：

这两轮主要解决主链可维护性问题，适合在主-子 agent 循环稳定后推进。

### P2

- 第五轮：整理 prompt 构建层
- 第六轮：正式分层观测体系

原因：

这两轮更偏架构整洁度与长期维护收益，不是最先阻塞当前功能演进的点。

---

## 建议的实际执行顺序

如果按最务实的节奏推进，我建议：

1. 先做第一轮
2. 紧接着做第二轮
3. 验证 character_editor 闭环稳定
4. 再做第三轮
5. 然后做第四轮
6. 最后再整理 prompt 和观测体系

也就是：

`先把主-子 agent 路径变得单一且清晰`
`再处理主链服务拆分`
`最后再收上下文和观测层`

---

## 当前推荐结论

如果现在就要开工重构，最值得先落地的第一批任务是：

1. 让 `taskNotificationNode` 退出主路径
2. 把 `TaskCoordinatorService` 从 `character_editor` 具体逻辑中解耦
3. 给 continuation handler 建 registry

这是当前性价比最高的一组改造，因为它既不会大面积推翻现有代码，又能显著降低后续继续演进时的结构性风险。

---

## 新方向：统一消息分发入口替代轮询

在当前评审基础上，进一步收敛后的方向是：

`主 agent 不再主动轮询有没有待处理任务`

而改为：

`用户消息`
`子 agent 通知消息`
`统一进入主入口分发层`
`由分发层按优先级唤醒主 agent`

这意味着：

1. `MainAgentLoopService` 只是当前过渡实现，不应成为长期主架构
2. 主 agent 的真正驱动源应当是统一 inbox / dispatch 层
3. notification 不应再依赖轮询发现，而应由任务队列主动上报给分发层

---

## 统一消息分发的核心思路

当前系统中，主 agent 实际上会收到两类输入：

### 1. 用户消息

来源：

- 聊天 UI

语义：

- 用户主动向主 agent 提问或补充信息

### 2. 子 agent 队列消息

来源：

- `TaskNotificationRecord`
- 或更准确地说，来自子 agent execution 结束后的通知事件

语义：

- 子 agent 请求主 agent 响应

---

## 状态思路

从交互语义上，可以把消息分发层的来源状态理解为：

- `user-active`
- `tasklist-active`
- `active`

其中：

- `user-active`
  只有用户消息待处理

- `tasklist-active`
  只有子 agent 队列消息待处理

- `active`
  两者同时存在

但是从实现上，更推荐：

`状态只是派生值`
`真正的事实数据应该是 inbox 队列`

也就是说，不要单独维护大量布尔状态，而应维护一条统一待处理输入队列。

---

## 推荐实现模型

建议新增：

- `MainAgentDispatchService`

它维护一条统一 inbox：

```ts
type MainAgentInboxSource = 'user' | 'task_queue'

type MainAgentInboxItem = {
  id: string
  source: MainAgentInboxSource
  createdAt: number
  priority: number
  payload: Record<string, unknown>
}
```

并派生出 dispatch 状态：

```ts
type MainAgentDispatchState = 'idle' | 'active' | 'processing'
```

含义：

- `idle`
  当前没有待处理输入

- `active`
  inbox 中至少有一条待处理输入

- `processing`
  主 agent 当前正在处理一条输入

---

## 顺序规则

当前推荐规则很简单：

1. 用户消息优先于子 agent 队列消息
2. 同来源按进入顺序处理
3. 主 agent 一次只处理一条输入

所以排序逻辑可以收敛成：

`user > task_queue`
`same source => FIFO`

这符合当前产品直觉：

- 用户主动说话优先
- 子 agent 回报不抢占用户回合

---

## 分发层应承担的职责

`MainAgentDispatchService` 应只负责以下事情：

### 1. 接收输入

- `enqueueUserMessage(...)`
- `enqueueTaskNotification(...)`

### 2. 决定顺序

- 用户优先
- 队列消息次之

### 3. 唤醒主 agent

如果当前不在 processing，则立即开始 drain。

### 4. 串行处理

一次只处理一条 inbox item，处理完再取下一条。

这能避免当前架构中最容易出现的并发与竞态问题。

---

## 主 agent 处理入口应如何变化

当前主 agent 的处理入口是分散的：

- 用户消息从 `AIService.sendStreamMessage()` 进入
- 子 agent 通知通过 loop / coordinator 被发现

未来应统一成：

```ts
async function processInboxItem(item: MainAgentInboxItem): Promise<void>
```

然后按来源分流：

### 如果来源是 `user`

则：

1. 判断是否是当前任务的补参
2. 如果是，交给 continuation / coordinator
3. 如果不是，走正常聊天主图

### 如果来源是 `task_queue`

则：

1. 不走普通用户聊天链
2. 直接进入 task coordination
3. 决定静默续跑还是向用户发消息

也就是说：

`主 agent 不再区分谁触发它`
`它只处理统一 inbox item`

---

## 子 agent 一侧如何接入

子 agent 结束一轮 execution 后，当前会：

1. 写 `TaskNotificationRecord`
2. 等待后台 loop 发现

未来应该变成：

1. 写 `TaskNotificationRecord`
2. 立即调用：
   - `mainAgentDispatchService.enqueueTaskNotification(...)`

这样主入口立即进入 `active`，不再依赖定时轮询。

---

## 用户一侧如何接入

当前用户消息入口是：

- `AIService.sendStreamMessage(message)`

未来更合理的方式是：

1. 先保存用户消息
2. 再将其作为 inbox item：
   - `mainAgentDispatchService.enqueueUserMessage(...)`
3. 由 dispatch service 决定是否立即处理

也就是说，`sendStreamMessage` 这个 API 名字可以保留，但内部语义应改成：

`enqueue + dispatch`

而不是：

`直接跑主图`

---

## 与当前架构的关系

这个方向不是完全推翻当前实现，而是给当前结构一个清晰演进路径。

### 当前保留

- `TaskRecord / TaskExecutionRecord / TaskNotificationRecord`
- `TaskCoordinatorService`
- `TaskTraceRecord`

### 当前将逐步退役

- `MainAgentLoopService`
- `taskNotificationNode` 作为 notification 主入口的职责

### 当前将新增

- `MainAgentDispatchService`
- 统一 inbox 模型
- 统一 `processInboxItem()` 入口

---

## 最小实现草图

下面是一版当前工程可落地的最小草图：

```ts
type MainAgentInboxSource = 'user' | 'task_queue'

type MainAgentInboxItem =
  | {
      id: string
      source: 'user'
      createdAt: number
      payload: {
        messageId: number
        text: string
      }
    }
  | {
      id: string
      source: 'task_queue'
      createdAt: number
      payload: {
        taskId: number
        notificationId: number
      }
    }

class MainAgentDispatchService {
  private readonly queue: MainAgentInboxItem[] = []
  private processing = false

  enqueueUserMessage(item: MainAgentInboxItem): void {
    this.queue.push(item)
    void this.drain()
  }

  enqueueTaskNotification(item: MainAgentInboxItem): void {
    this.queue.push(item)
    void this.drain()
  }

  private pickNext(): MainAgentInboxItem | undefined {
    const userIndex = this.queue.findIndex((item) => item.source === 'user')
    if (userIndex >= 0) {
      return this.queue.splice(userIndex, 1)[0]
    }
    return this.queue.shift()
  }

  private async drain(): Promise<void> {
    if (this.processing) return
    this.processing = true
    try {
      while (this.queue.length > 0) {
        const item = this.pickNext()
        if (!item) break
        await this.processInboxItem(item)
      }
    } finally {
      this.processing = false
    }
  }

  private async processInboxItem(item: MainAgentInboxItem): Promise<void> {
    if (item.source === 'user') {
      // 1. 是否任务补参
      // 2. 是则 coordinator 处理
      // 3. 否则走主图聊天链
      return
    }

    if (item.source === 'task_queue') {
      // 1. coordinator 消费 notification
      // 2. 决定静默续跑还是向用户发消息
      return
    }
  }
}
```

这个草图的重点不在于最终代码长什么样，而在于：

`所有输入先入主入口`
`主 agent 不再主动轮询是否有事`

---

## 当前阶段的 P0 / P1 / P2

### P0

这些任务直接影响主-子 agent 主链是否清晰，是当前必须优先做的。

1. 引入 `MainAgentDispatchService` 骨架
2. 将用户消息入口改为：
   - 保存消息
   - enqueue user item
   - 由 dispatch service 决定处理
3. 将子 agent notification 发布链改为：
   - 写 notification
   - enqueue task_queue item
4. 让 `TaskCoordinatorService` 成为 `task_queue` item 的处理器
5. 将 `MainAgentLoopService` 降级为兼容 fallback，而不是主路径

### P0 验收标准

1. 用户消息和 task_queue 消息都从同一个 dispatch service 进入
2. 主 agent 不再依赖轮询作为正常主路径
3. 当用户和子 agent 同时有输入时，用户优先被处理

---

### P1

这些任务用于让统一消息入口稳定、可扩展。

1. 给 dispatch service 增加 inbox item 类型定义与严格约束
2. 将 `AIService` 拆成：
   - 消息存储
   - 主图 runtime
   - dispatch adapter
3. 将 `TaskCoordinatorService` 从 `character_editor` 具体 continuation 逻辑中解耦
4. 为 continuation handler 建 registry
5. 将 `taskNotificationNode` 正式降级为恢复路径 / fallback

### P1 验收标准

1. `AIService` 不再同时承担聊天、任务路由、loop tick 三种职责
2. `TaskCoordinatorService` 不再直接 import 某个具体子 agent schema
3. notification 的正常处理不再依赖主图节点

---

### P2

这些任务属于长期整洁度和扩展性建设。

1. 为 dispatch service 补充更正式的状态表达：
   - `idle`
   - `active`
   - `processing`
2. 为 inbox item 增加更明确的 tracing / correlation id
3. 将 prompt 构建层正式抽象出来
4. 明确 `graphlog` 与 `taskTrace` 的边界
5. 根据需要决定是否保留 DB notification 作为 durable inbox，还是引入独立 inbox record

### P2 验收标准

1. 消息分发层、任务协调层、主图运行层各自边界清晰
2. 观测体系不再重复
3. 后续引入新子 agent 不需要继续改主入口主链

---

## 当前推荐结论

如果现在就要推进下一步架构演进，我建议：

1. 先把“统一消息分发入口”正式定为主方向
2. 先做 `P0`
3. 保留当前 loop 作为过渡 fallback
4. 等 dispatch 主链稳定后，再删掉轮询主路径

一句话总结：

`主 agent 不应该轮询有没有事，而应该被统一消息入口唤醒。`

---

## 消息分发层的“理想可用”标准

当前阶段，不追求把 dispatch 做成复杂的事件总线。  
“理想可用”应收敛为下面 5 条：

1. 用户消息与子 agent 通知只有一个主入口：
   - `MainAgentDispatchService`

2. task queue 入队必须精确到 notification 粒度：
   - 不能只按 `taskId`
   - 必须携带 `notificationId`
   - 避免一个任务多条通知时发生误消费或乱序消费

3. 分发层必须具备最小去重能力：
   - 同一条 notification 重复上报时，不重复入队

4. 分发层必须可观测：
   - 至少能看到 `idle / user-active / tasklist-active / active / processing`
   - 至少能看到用户队列数、子队列数、当前处理项

5. LangGraph 主图不再承担 notification 的正常消费职责：
   - `taskNotificationNode` 退出正常主路径
   - notification 由 dispatch -> coordinator 统一处理

满足这 5 条后，消息分发层才算从“骨架”进入“理想可用的第一版”。

---

## 当前已落地的 P0 收口

本轮实现后，P0 的消息分发层已达到下面状态：

1. `MainAgentDispatchService` 已成为用户消息与子 agent 通知的统一入口
2. `task_queue` item 已升级为：
   - `taskId + notificationId`
3. 分发层已支持 notification 级别去重
4. 任务面板可以直接看到 dispatch 状态与队列数量
5. `taskNotificationNode` 已从主图正常执行路径移除

这意味着当前主链已经从：

`用户入口 + 轮询 + 主图兜底消费`

收敛为：

`用户入口 / 子 agent 通知`
`-> MainAgentDispatchService`
`-> TaskCoordinatorService / Chat Runtime`

后续 P1 的重点就不再是“让 dispatch 能跑”，而是：

1. 拆 `AIService`
2. 把 `TaskCoordinatorService` 从具体 executor 逻辑中解耦
3. 让 continuation handler registry 成为正式扩展点
