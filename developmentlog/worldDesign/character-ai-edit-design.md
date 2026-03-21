# 人物编辑 AI 方案实现记录

## 当前定位

当前人物编辑子 agent 已经进入任务队列真实实现阶段。  
它现在不再是“未来规划中的抽象执行器”，而是：

`主 agent -> delegate_character_editor -> TaskExecutionRecord -> SubAgentDispatcherService -> character_editor LangGraph 子图 -> TaskNotificationRecord`

这意味着：

1. 主 agent 可以正式委派人物编辑任务
2. 人物编辑 execution 会进入后台队列
3. 子 agent 可以在缺少 world 信息时挂起并等待补充
4. 补充信息后会基于 `pendingContext` 继续执行

---

## 为什么人物编辑必须是专用子 agent

人物编辑不是“改一行人物表”，而是编辑一个 `character` 实体聚合。

它至少涉及：

1. `WorldEntityRecord`
2. `character_profile`
3. `character_demographic`
4. 与人物相关的 `Relation`

因此当前人物编辑的正确方向仍然是：

`主 agent 只负责登记任务与与用户交互`
`character_editor 负责后台解析目标人物并执行编辑`

---

## 当前框架选择

### 已确定方案

当前 `character_editor` **已经改造成独立 LangGraph 子图版本**。

也就是说：

- 主 agent 使用主图
- `character_editor` 使用独立子图
- 两者之间通过任务队列和通知系统连接

---

### 为什么现在用 LangGraph 子图

当前改成 LangGraph 子图的原因是：

1. 人物编辑已经需要内部多阶段状态
2. 需要支持“缺 world 信息 -> 挂起 -> 用户补充 -> 续跑”
3. 需要把“解析世界观 / 解析角色 / 执行编辑”分成不同阶段
4. 简单 bounded loop 已不足以表达这种内部状态推进

因此当前选择为：

`主 agent：LangGraph`
`character_editor：独立 LangGraph 子图`

---

## 当前子图内部职责

当前 `character_editor` 子图负责：

1. 读取 execution payload
2. 恢复 `pendingContext`
3. 解析 world
4. 解析 character
5. 根据 `editingDirection` 决定优先编辑方向
6. 在目标人物已确定后，调用人物专用工具执行编辑
7. 产出结构化结果

---

## 当前任务队列接入方式

人物编辑当前已经接入统一任务系统：

### 主任务状态

- `active`
- `running`
- `pending_main_ack`
- `awaiting_user_input`
- `awaiting_user_confirmation`
- `done`
- `cancelled`

### execution 状态

- `queued`
- `dispatching`
- `running`
- `awaiting_input`
- `reported_done`
- `failed`
- `cancelled`

### 通知类型

- `subagent_completed`
- `subagent_needs_input`
- `subagent_failed`

---

## 当前实现的核心变化

### 1. 人物委派协议不再强制要求 entityId

为了支持“只给人物名，不给 world”的场景，当前人物委派协议已经扩展为支持：

- `entityId`
- `characterName`
- `worldId`
- `worldName`

其中：

1. 如果已经有 `entityId`，可以直接走已解析路径
2. 如果只有 `characterName + worldName`，子图会先解析 world，再找人物
3. 如果只有 `characterName` 没有 `worldName`，子图会挂起并请求补充 world 名

---

### 2. 子 agent 使用 pendingContext 持久化续跑状态

当前没有引入歧义解析记忆表。  
第一版采用的是：

`pendingContext 持久化方案`

其作用是：

1. 当子 agent 缺少继续执行所需信息时，不丢失当前进度
2. 等用户补充 world 名后，可以沿用原任务继续执行

当前 `pendingContext` 持久化在主任务上，而不是临时停留在内存中。

并且：

`当主任务 done / cancelled 时，pendingContext 会被重置`

这保证了人物任务结束后不会遗留挂起状态。

---

## 当前 pendingContext 结构

当前第一版 `pendingContext` 已定义为：

```ts
type CharacterEditorPendingContext = {
  phase: 'resolve_world' | 'resolve_character' | 'apply_edit'
  originalUserRequest: string
  targetCharacterName?: string
  targetWorldName?: string
  resolvedWorldId?: string
  resolvedEntityId?: string
  editingScope?: Array<'profile' | 'demographic' | 'relation' | 'portrait'>
  editingDirection?: 'character_deeds' | 'character_profile' | 'demographic_facts'
  expectedOutcome?: string
  source?: 'chat' | 'world_entity_view'
  lastNeedsInputMessage?: string
}
```

它的职责不是做长期记忆，而是：

`让同一个任务在等待用户补充信息后可以续跑`

---

## 当前 execution payload 定义

```ts
type CharacterEditorExecutionPayload = {
  taskId: number
  executionId: number
  worldId?: string
  worldName?: string
  entityId?: string
  characterName?: string
  userRequest: string
  originalUserRequest: string
  editingScope?: Array<'profile' | 'demographic' | 'relation' | 'portrait'>
  editingDirection?: 'character_deeds' | 'character_profile' | 'demographic_facts'
  expectedOutcome?: string
  source?: 'chat' | 'world_entity_view'
  pendingContext?: CharacterEditorPendingContext
}
```

这意味着同一次人物编辑任务可以经历：

1. 第一次 execution：只有人物名，没有 world
2. 子 agent 返回 `needs_input`，并写入 `pendingContext`
3. 第二次 execution：用户补充 world 名，payload 带上旧的 `pendingContext`
4. 子图继续执行

---

## 当前 handler output 定义

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
  pendingContext?: CharacterEditorPendingContext
}
```

其中：

- `completed`
  表示本轮 execution 已经可交付

- `needs_input`
  表示当前 execution 需要用户补充 world 名、人物名或更明确信息

- `failed`
  表示本轮执行失败

---

## 当前 editingDirection 约定

为了让主 agent 在委派时就明确子 agent 的编辑目标，当前协议已经加入 `editingDirection`。

第一版支持：

- `character_deeds`
- `character_profile`
- `demographic_facts`

当前约定为：

- `character_deeds`
  表示优先编辑人物事迹、经历、秘密、转折等叙事内容
- `character_profile`
  表示优先编辑 profile 层
- `demographic_facts`
  表示优先编辑 demographic 层

其中最重要的第一版约束是：

`当 editingDirection=character_deeds 时，子 agent 默认应优先调用 upsert_character_profile，并把内容写入 character_profile.data.description`

这正是为了支持“AI 只负责编辑人物事迹正文”的当前目标。

---

## 当前子图行为

当前 `character_editor` 子图的行为已经明确为：

### 情况 A：给了明确 worldName

子图会：

1. 先按 worldName 查 world
2. 若 world 唯一，则拿到 worldId
3. 再在该 world 下按人物名查 character
4. 若人物唯一，则进入编辑阶段

---

### 情况 B：没有给 worldName

子图会：

1. 直接返回 `needs_input`
2. 提示主 agent 向用户索要 world 名称
3. 生成并持久化 `pendingContext`

此时不做全库角色搜索，也不做长期歧义解析记忆。

---

### 情况 C：补充了 worldName 后续跑

当用户补充 world 名后：

1. 主 agent 继续当前任务
2. 创建新的 execution
3. delegate tool 会把当前输入与旧 `pendingContext` 合并
4. 子图从 `resolve_world / resolve_character` 阶段继续推进

---

### 情况 D：主 agent 明确传入 editingDirection=character_deeds

子图会：

1. 把本轮任务视为“人物事迹编辑”
2. 将默认编辑落点收敛到 `character_profile.data.description`
3. 优先调用 `upsert_character_profile`
4. 除非用户明确要求修改基础属性，否则不优先调用 demographic 工具

---

## 当前工具能力边界

### 已具备的初步可用能力

当前人物编辑子 agent 已具备第一批基础能力：

1. `get_character_detail`
2. `upsert_character_profile`
3. `upsert_character_demographic`

因此现在已经能支持：

- 基础人物档案修改
- 基础 demographic 修改
- 人物事迹定向写入 `character_profile.data.description`

---

### 当前还未补齐的能力

当前仍未补齐：

1. `list_character_relations`
2. `upsert_character_relation`
3. `search_character_reference_entities`
4. `validate_character_consistency`

因此第一版人物编辑子 agent 仍应视为：

`可挂起续跑、可做基础 profile / demographic 编辑`

而不是：

`已经具备完整人物关系编辑与复杂歧义解析能力`

---

## 当前代码落点

### 委派入口

- `src/main/services/aiservice/ai-utils/tools/task/delegateCharacterEditor.ts`

### 人物共享 schema

- `src/main/services/aiservice/ai-utils/tools/character/shared.ts`

### 人物工具集

- `src/main/services/aiservice/ai-utils/toolkits/characterEditorToolkit.ts`

### 写入工具

- `src/main/services/aiservice/ai-utils/tools/character/upsertCharacterProfile.ts`
- `src/main/services/aiservice/ai-utils/tools/character/upsertCharacterDemographic.ts`

### 人物编辑子图执行器

- `src/main/services/task/characterEditorExecution.ts`

### dispatcher 与 pendingContext 持久化

- `src/main/services/task/subAgentDispatcherService.ts`
- `src/main/services/task/taskService.ts`
- `src/share/entity/database/TaskRecord.ts`

---

## 当前结论

当前人物编辑子 agent 已经实现为：

`独立 LangGraph 子图`
`支持 pendingContext 挂起续跑`
`缺 world 名时请求主 agent 补充`
`用户补充后继续在同一任务下运行`

并且当前已经保证：

`主任务关闭时清空 pendingContext`

这就是当前人物编辑子 agent 的真实实现边界。
