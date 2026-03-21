# 人物编辑 AI 方案实现记录

## 当前定位

人物编辑 AI 现在不再作为一个抽象“未来子 agent”来讨论，而是已经对齐到当前主-子 agent 任务队列体系中的一个具体执行器：

`主 agent -> delegate_character_editor -> TaskExecutionRecord -> SubAgentDispatcherService -> character_editor -> TaskNotificationRecord`

这意味着人物编辑已经不只是工具契约草案，而是：

1. 可以被主 agent 委派
2. 可以进入异步任务队列
3. 可以在后台执行一轮人物编辑
4. 可以通过通知系统把执行结果回传主 agent

---

## 为什么人物编辑必须是专用子 agent

当前世界观数据结构不是单表人物资料页，而是：

`World -> Entity -> Component -> Relation`

其中人物编辑至少会涉及：

1. `WorldEntityRecord`
2. `character_profile`
3. `character_demographic`
4. 与人物相关的 `Relation`

因此人物编辑的本质不是：

`修改一张人物表`

而是：

`编辑一个 character 实体聚合`

这决定了人物编辑不适合由主 agent 直接完成，也不适合做成一个粗粒度数据库工具，而应该是：

`专用人物执行器 + 专用人物工具集`

---

## 当前架构结论

当前人物编辑方案已经收敛为：

`主 agent 调用人物编辑委派工具`
`人物编辑执行器在后台异步运行`
`执行器只允许使用人物专用工具集`
`执行结果通过任务通知回传主 agent`

所以人物编辑系统当前的角色边界是：

### 主 agent

负责：

1. 识别用户提出了人物编辑任务
2. 创建任务
3. 调用 `delegate_character_editor`
4. 告知用户任务已进入后台执行
5. 在收到后台通知后，请求用户补充信息或确认结束

不负责：

1. 直接改人物数据
2. 自己拆解人物编辑步骤
3. 自己验证人物设定冲突
4. 自己做失败重试闭环

### character_editor 执行器

负责：

1. 读取人物 detail
2. 判断本轮修改涉及哪些层
3. 调用人物专用工具执行
4. 生成本轮 execution 结果
5. 回传 `completed / needs_input / failed`

---

## 当前子 agent 使用的框架

这是当前实现里最需要明确的一点。

### 当前选择

当前 `character_editor` 第一版 **不使用独立 LangGraph 子图**，而是使用：

`LangChain tool-calling bounded worker loop`

具体来说：

1. `SubAgentDispatcherService` 负责调度 execution
2. `characterEditorExecution` 在后台创建一个有界执行循环
3. 循环内部使用当前配置模型 + `characterEditorToolkit`
4. 允许模型在有限轮数内调用人物工具
5. 最终输出结构化 handler result

---

### 为什么当前不直接上独立 LangGraph 子图

当前这样做更适合第一版人物编辑执行器，原因是：

1. 人物编辑现在还是单任务、单 execution 的后台 worker
2. 目标是尽快把 execution payload、工具调用、通知回传跑通
3. 独立 LangGraph 子图会让工程复杂度和调试成本明显上升
4. 当前最核心的问题是“人物写入工具 + execution 结构化输出”，不是复杂图编排

因此当前的工程判断是：

`主 agent 用 LangGraph`
`character_editor v1 用有界 LangChain tool loop`

后续如果人物编辑执行器变得更复杂，例如需要：

1. 多阶段计划
2. 子步骤状态持久化
3. 多次工具批处理
4. 内部专门的验证节点

再把 `character_editor` 升级为独立 LangGraph 子图会更合理。

---

## 当前任务队列接入方式

### 主流程

`用户提出人物编辑需求 -> 主 agent 识别为 character_editor 任务 -> 调用 delegate_character_editor -> 创建 TaskExecutionRecord -> dispatcher 后台执行 -> character_editor 回报结果 -> TaskNotificationRecord 写入 -> 主 agent 下一轮消费通知`

---

### 当前状态轮转

#### 任务状态

人物编辑任务使用统一的主任务状态：

- `active`
- `running`
- `pending_main_ack`
- `awaiting_user_input`
- `awaiting_user_confirmation`
- `done`
- `cancelled`

#### execution 状态

人物编辑 execution 使用统一的执行状态：

- `queued`
- `dispatching`
- `running`
- `awaiting_input`
- `reported_done`
- `failed`
- `cancelled`

#### 通知类型

人物编辑执行器回传：

- `subagent_completed`
- `subagent_needs_input`
- `subagent_failed`

---

## 当前实现落点

### 委派入口

- `src/main/services/aiservice/ai-utils/tools/task/delegateCharacterEditor.ts`

职责：

1. 校验 `worldId / entityId / character`
2. 创建或续接当前 active task
3. 创建 `TaskExecutionRecord`
4. 生成 execution payload
5. 异步交给 dispatcher

---

### 人物工具集

- `src/main/services/aiservice/ai-utils/toolkits/characterEditorToolkit.ts`

当前已接入的第一批工具：

1. `get_character_detail`
2. `upsert_character_profile`
3. `upsert_character_demographic`

当前尚未接入的第二批能力：

1. `list_character_relations`
2. `upsert_character_relation`
3. `search_character_reference_entities`
4. `validate_character_consistency`

---

### 后台执行器

- `src/main/services/task/characterEditorExecution.ts`

职责：

1. 解析 execution payload
2. 构建 character_editor system prompt
3. 运行 bounded tool-calling loop
4. 收集工具调用结果
5. 返回结构化 handler output

---

### 调度与通知

- `src/main/services/task/subAgentDispatcherService.ts`
- `src/main/services/task/taskNotificationService.ts`

含义：

1. dispatcher 负责启动 execution
2. notification service 负责把 execution 结果写成通知
3. 主 agent 下一轮通过 `taskNotificationNode` 消费通知

---

## 第一批 execution payload 定义

当前 `character_editor` 第一版 execution payload 已经明确。

### TypeScript 结构

```ts
type CharacterEditorExecutionPayload = {
  taskId: number
  executionId: number
  worldId: string
  entityId: string
  userRequest: string
  editingScope?: Array<'profile' | 'demographic' | 'relation' | 'portrait'>
  expectedOutcome?: string
  source?: 'chat' | 'world_entity_view'
}
```

### 字段含义

`taskId`

当前所属主任务 id。

`executionId`

当前这一次后台执行回合的 id。

`worldId`

人物所属 world。

`entityId`

目标人物实体 id。

`userRequest`

用户原始人物编辑请求。

`editingScope`

主 agent 或调用方给出的粗粒度编辑范围提示。  
允许值：

- `profile`
- `demographic`
- `relation`
- `portrait`

`expectedOutcome`

本轮期望结果的简要描述。

`source`

来源上下文。当前支持：

- `chat`
- `world_entity_view`

---

## 第一批 handler output 定义

为了让 dispatcher、通知系统、主 agent 都能稳定消费，当前已经明确 `character_editor` 的结构化输出。

### TypeScript 结构

```ts
type CharacterEditorHandlerOutput = {
  outcome: 'completed' | 'needs_input' | 'failed'
  summary: string
  userFacingMessage: string
  changedScopes: Array<'profile' | 'demographic' | 'relation' | 'portrait'>
  appliedTools: Array<{
    name: string
    status: 'ok' | 'error'
  }>
  suggestedFollowUp?: string
}
```

---

### 字段含义

`outcome`

表示本轮后台执行的结论：

- `completed`
  本轮人物编辑已经可交付

- `needs_input`
  还需要用户补充信息或系统补充能力后才能继续

- `failed`
  本轮执行失败

`summary`

给任务系统和日志看的本轮摘要。

`userFacingMessage`

主 agent 对用户同步进展时可直接使用的说明文本。

`changedScopes`

本轮实际涉及的修改范围。

`appliedTools`

本轮实际调用了哪些工具，以及工具是否成功。

`suggestedFollowUp`

给主 agent 或下一轮 execution 的建议后续动作。

---

## 当前工具能力边界

### 已支持的第一批人物编辑能力

当前 `character_editor` 已具备初步可用功能：

#### 1. 人物读取

- 通过 `get_character_detail` 读取人物完整 detail

#### 2. 人物 profile 写入

- 通过 `upsert_character_profile` 更新：
  - `title`
  - `summary`
  - `description`
  - `descriptionFormat`
  - `portraitResourceUrl`
  - `layoutVariant`
  - `personalityTraits`
  - `abilities`
  - `tags`

#### 3. 人物 demographic 写入

- 通过 `upsert_character_demographic` 更新：
  - `age`
  - `ageLabel`
  - `heightLabel`
  - `gender`
  - `raceEntityId`
  - `factionEntityId`
  - `nationEntityId`
  - `birthplaceEntityId`

---

### 当前尚不完整的能力

以下能力仍未完成，因此当前人物编辑执行器仍属于“初步可用”阶段：

#### 1. 关系编辑

还没有真正接通：

- `list_character_relations`
- `upsert_character_relation`

因此涉及关系网修改的请求，当前执行器应更倾向返回：

- `needs_input`

而不是冒险伪造完成。

#### 2. 引用实体搜索

当前还没有：

- `search_character_reference_entities`

因此如果用户要求修改：

- 所属种族
- 所属国家
- 所属势力
- 出生地

但又没有提供可安全识别的目标实体 id，执行器可能无法稳定完成。

#### 3. 一致性检查

当前还没有：

- `validate_character_consistency`

因此第一版人物编辑执行器目前更像：

`能做基础 profile / demographic 写入`

而不是：

`已经具备复杂设定校验能力`

---

## 当前 character_editor 的实际工作模式

当前执行器遵循以下原则：

1. 先读后写
2. 只使用人物工具集
3. 工具调用轮数有限
4. 输出必须结构化
5. 不直接关闭主任务

更具体地说：

### 1. 先读取人物 detail

执行器应先把当前人物 detail 当作编辑基线读取出来。

### 2. 判断本轮是否能安全完成

如果只是 profile / demographic 改动，且信息充分，则执行写入。

如果涉及 relation 或引用对象不清晰，则应返回：

- `needs_input`

### 3. 结构化结束

执行器结束时必须返回：

- `completed`
- `needs_input`
- `failed`

三者之一，而不是自由文本。

---

## 当前与任务队列的对齐关系

当前人物编辑执行器已经是任务队列中的一个标准执行器，因此它必须遵守以下约束：

### 1. execution 才是排队单位

人物编辑不是直接对 `TaskRecord` 执行，而是对：

- `TaskExecutionRecord`

执行。

因此用户补充要求继续修改时，正确方式是：

1. 主任务继续存在
2. 新建一条 execution
3. dispatcher 再跑一轮

### 2. 子 agent 不能直接结束任务

`character_editor` 只能上报：

- `completed`
- `needs_input`
- `failed`

主任务是否真正完成，仍由主 agent 在收到通知后与用户确认。

### 3. 后台完成不等于用户确认完成

当前必须严格区分：

`execution completed`

和：

`task done`

这也是为什么人物编辑完成后仍要经过：

- `pending_main_ack`
- `awaiting_user_confirmation`

这两个阶段。

---

## 当前实现阶段结论

截至当前，人物编辑系统已经从：

`只有委派协议`

推进到：

`已接入任务队列的初步可用 character_editor`

已经具备的部分是：

1. 主 agent 可以识别并委派人物编辑任务
2. execution payload 已结构化
3. 后台执行器已接入 dispatcher
4. execution 结果已结构化
5. 可通过通知系统回传主 agent
6. 已具备 profile / demographic 的基础写入能力

当前还未完全完成的部分是：

1. relation 编辑
2. 引用实体搜索
3. 一致性校验
4. 更复杂的多阶段内部推理

---

## 下一阶段建议

下一阶段最值得优先继续做的是：

### 1. 关系编辑工具

补齐：

- `list_character_relations`
- `upsert_character_relation`

### 2. 引用实体搜索工具

补齐：

- `search_character_reference_entities`

这样 demographic 中的实体引用更新才会更稳定。

### 3. 一致性校验工具

补齐：

- `validate_character_consistency`

### 4. 视复杂度决定是否升级到独立 LangGraph 子图

如果人物编辑执行器未来出现：

1. 多阶段计划
2. 多轮内部验证
3. 子步骤复用
4. 更细的执行日志节点

再将 `character_editor` 升级成独立 LangGraph 子图会更合理。

---

## 当前结论

当前人物编辑 AI 方案已经不再是概念草案，而是一个已经对齐到任务队列体系中的具体执行器方案。

当前正确的工程描述应为：

`主 agent 通过 delegate_character_editor 启动人物编辑 execution`
`character_editor v1 使用 LangChain bounded tool loop，而不是独立 LangGraph 子图`
`执行器通过 characterEditorToolkit 完成初步可用的 profile / demographic 编辑`
`执行结果通过 TaskNotificationRecord 回传主 agent`

这就是当前人物编辑子 agent 的真实架构边界与实现状态。
