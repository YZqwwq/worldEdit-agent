# 人物编辑 AI 方案草案

## 背景

当前世界观系统的数据结构已经不是“单表人物资料页”，而是：

`World -> Entity -> Component -> Relation`

其中人物至少包含以下几层数据：

1. `WorldEntityRecord`
2. `character_profile`
3. `character_demographic`
4. 与人物相关的 `Relation`

因此，“让 AI 编辑人物”不能被简单理解为“修改人物表的一行数据”，而应该被理解为：

`编辑一个人物实体聚合`

这个聚合既包含叙事文本，也包含结构化属性，还包含关系网络。

---

## 设计目标

本方案的目标不是让主 agent 直接改数据库，而是建立一套符合当前任务系统和工具系统边界的人物编辑路径。

目标包括：

1. 主 agent 不直接执行复杂人物编辑
2. 人物编辑任务由专门的子 agent 处理
3. 子 agent 只能使用人物专用工具集
4. 人物、国家、事件等不同实体类型未来可以有不同编辑规范与 skill
5. 后续可以平滑扩展到 `nation_editor`、`event_editor`、`faction_editor`

---

## 已讨论的三种方案

### 方案 1

做一个专注于编辑人物的子 agent，让主 agent 调用。

### 方案 2

做一个编辑数据库的工具，限定子 agent 只能操作人物表，让主 agent 调用。

### 方案 3

做一个专门编辑人物表的工具，让子 agent 调用。

---

## 对三种方案的判断

### 对方案 1 的判断

方向正确，但单独使用还不够。

优点：

1. 符合当前任务系统中“主 agent 只负责任务注册和结束”的边界
2. 可以把人物编辑的 prompt、规范、审美标准、字段约束封装在人物子 agent 中
3. 未来可以自然扩展出其他类型编辑子 agent

不足：

1. 如果没有专用工具，人物子 agent 仍然容易退化为自由发挥写 JSON
2. 只靠 prompt 约束，写入稳定性不足

结论：

`方案 1 的角色边界是正确的，但需要配合专用工具集。`

---

### 对方案 2 的判断

不建议采用。

问题：

1. 它会把主 agent 和具体人物写入逻辑绑得太紧
2. 不符合“主 agent 不负责复杂执行”的边界
3. 容易误导实现，把“人物编辑”理解成单表更新
4. 不符合当前世界观数据模型中“人物是聚合对象”的事实

结论：

`方案 2 不贴当前架构边界，也不贴当前数据模型。`

---

### 对方案 3 的判断

方向基本正确，但表述需要调整。

需要把“专门编辑人物表的工具”改成：

`人物专用编辑工具集`

原因：

1. 人物不是一张表，而是实体聚合
2. 实际需要的不应是一个粗粒度大工具，而是一组原子工具
3. 工具层应该贴合当前 `Entity + Component + Relation` 结构

结论：

`方案 3 适合作为人物子 agent 的内部能力实现方式。`

---

## 推荐的最终方案

推荐将方案收敛为：

`主 agent 调用人物编辑子 agent -> 人物编辑子 agent 调用人物专用工具集`

也就是：

`方案 1 + 方案 3 的组合`

对外：

- 主 agent 只负责识别“这是一个人物编辑任务”
- 主 agent 只负责委派给 `character_editor`

对内：

- `character_editor` 子 agent 使用 `characterEditorToolkit`
- toolkit 中只包含人物相关的查询和写入工具

---

## 为什么不做通用 world editor 子 agent

当前不建议做“通用所有表的世界观编辑子 agent”。

原因是不同实体类型的编辑重心完全不同。

### 人物编辑关注点

1. 角色经历
2. 人格特征
3. 成长线
4. 关系网
5. 立绘与文本风格一致性
6. 身份归属与设定冲突

### 国家编辑关注点

1. 政体
2. 首都
3. 主导种族
4. 核心领土
5. 外交关系
6. 制度与理念

### 事件编辑关注点

1. 时间
2. 地点
3. 参与方
4. 经过
5. 因果链
6. 结果与后效

这些对象的：

- 编辑顺序
- 校验标准
- 用词规范
- prompt 约束
- 工具优先级

都明显不同。

所以推荐路线不是：

`一个通用 world editor agent`

而是：

- `character_editor`
- `nation_editor`
- `event_editor`
- `faction_editor`

按对象类型分别成长。

---

## 当前推荐的角色分工

### 主 agent

负责：

1. 判断用户是否发起了人物编辑任务
2. 通过任务系统注册任务
3. 调用 `delegate_character_editor`
4. 告知用户任务开始
5. 在子 agent 回报完成后请求用户确认结束

不负责：

1. 直接修改人物数据
2. 自己拆人物编辑步骤
3. 自己决定人物设定冲突怎么修

### 人物编辑子 agent

负责：

1. 读取人物完整 detail
2. 读取 schema 规则
3. 判断用户修改的是叙事文本、基础属性还是关系
4. 调用人物专用工具执行
5. 自己完成必要的内部检查
6. 上报可交付结果给主 agent

---

## 推荐的最小技术架构

### 1. 委派工具

新增一个委派型工具：

- `delegate_character_editor`

它属于主 agent 工具集。

用途：

1. 将人物编辑任务交给人物编辑子 agent
2. 启动人物编辑任务运行链

### 2. 人物编辑子 agent

新增一个专用人物编辑子 agent：

- `character_editor`

它不直接暴露给主 agent 的普通回答链，而是通过委派工具触发。

### 3. 人物工具集

新增一个专门的人物编辑工具集：

- `characterEditorToolkit`

该 toolkit 只给 `character_editor` 子 agent 使用。

---

## 人物专用工具集建议

第一版不建议做一个“大而全”的人物编辑工具，而建议做一组人物专用原子工具。

### 第一批最低必要工具

#### 1. `get_character_detail`

用途：

1. 获取人物完整 detail
2. 返回 entity、components、relations

本质上可以在现有 `get_entity_detail` 之上加一层“必须是 character”的约束。

#### 2. `upsert_character_profile`

用途：

1. 更新人物叙事档案
2. 写入 `character_profile`

可覆盖字段：

- `title`
- `summary`
- `description`
- `portraitResourceUrl`
- `layoutVariant`
- `personalityTraits`
- `abilities`
- `tags`

#### 3. `upsert_character_demographic`

用途：

1. 更新人物基础属性
2. 写入 `character_demographic`

可覆盖字段：

- `age`
- `ageLabel`
- `heightLabel`
- `gender`
- `raceEntityId`
- `factionEntityId`
- `nationEntityId`
- `birthplaceEntityId`

### 第二批建议工具

#### 4. `list_character_relations`

用途：

1. 查询人物已有关系边
2. 为关系修订提供基础

#### 5. `upsert_character_relation`

用途：

1. 创建或修订人物关系
2. 支持人物与人物、势力、国家、事件等的关系更新

### 第三批扩展工具

#### 6. `search_character_reference_entities`

用途：

1. 帮人物编辑子 agent 搜可引用实体
2. 避免直接写错 `raceEntityId` / `nationEntityId`

#### 7. `validate_character_consistency`

用途：

1. 做人物内部设定一致性检查
2. 检查文本和结构化字段是否冲突

该工具不是第一批必须，但未来会很有价值。

---

## 推荐的编辑流程

### 主流程

`用户提出人物编辑需求 -> 主 agent 判定为复杂人物编辑任务 -> 主 agent 调用 delegate_character_editor -> 人物编辑子 agent 读取人物 detail + schema -> 选择人物专用工具执行 -> 子 agent 完成内部检查 -> 回报主 agent -> 主 agent 请求用户确认`

### 子 agent 内部流程

`读取人物 -> 分析修改意图 -> 判断涉及 profile / demographic / relation 哪些层 -> 调用相应工具 -> 汇总结果 -> 上报`

---

## 为什么工具粒度不能太粗

如果做一个粗粒度工具，例如：

- `edit_character_everything`

会有几个问题：

1. 输入过于复杂
2. 输出不稳定
3. 一次失败影响范围大
4. 不利于后续扩展
5. 模型更容易误用

因此推荐坚持：

`一个工具只做一件事`

这样更符合你们当前 AI 工具层的设计原则。

---

## 与当前世界观编辑页的关系

当前 [WorldEntityView.vue](/d:/other/code/html/electron/world-agent/worldedit-agent/src/renderer/src/views/WorldEntityView.vue) 已经体现出人物编辑的独特性：

1. 人物有单独的立绘编辑区
2. 人物有专用的 `character_profile`
3. 人物有专用的 `character_demographic`
4. 人物的编辑明显不是通用实体表单

这进一步说明：

`人物编辑已经在 UI 层是专门化对象，因此在 AI 层也应该对应专门化 agent 和 toolkit。`

---

## 第一版建议落地顺序

### 第一步

先做设计落地，不急着接完整运行链：

1. 明确 `delegate_character_editor` 契约
2. 明确 `characterEditorToolkit`
3. 明确人物编辑子 agent 的职责 prompt

---

## `delegate_character_editor` 工具契约草案

这一节用于收敛第一版主 agent 可调用的人物委派工具设计。

当前定位：

`delegate_character_editor` 不是“直接改人物数据库”的工具，而是“把人物编辑任务委派给人物编辑子 agent”的工具。

它的职责是：

1. 校验委派输入是否完整
2. 确认目标实体存在且确实是 `character`
3. 创建或续接任务记录
4. 生成一次人物编辑执行记录
5. 启动人物编辑子 agent
6. 立刻返回“已接受委派”的结构化结果给主 agent

它不负责：

1. 直接修改人物数据
2. 在主调用链里等待人物编辑完成
3. 在工具内部做复杂验证和重试

### 工具归属

建议：

- 工具名称：`delegate_character_editor`
- 所属 toolkit：`mainAgentToolkit`
- 目标执行器：`character_editor`
- 风险等级：`medium`
- `readOnly = false`
- `idempotent = false`

为什么不是 `low`：

因为它虽然不直接写人物数据，但会：

1. 创建任务
2. 创建执行记录
3. 启动后台子 agent

因此它属于“会改变系统运行状态”的中风险工具。

---

### 与当前任务系统需要对齐的地方

当前任务系统的执行器类型里还没有 `character_editor`。

因此在真正实现该工具前，需要把以下几处一起扩展：

1. `TaskExecutorKind` 增加：
   - `character_editor`

2. `subAgentCapabilityService` 中增加：
   - `character_editor -> delegate_character_editor`

3. `taskLifecycleNode` 在识别“人物编辑任务”时，能够建议：
   - `executorKind = character_editor`

也就是说，这个工具契约不仅是工具本身的草案，也是后续把人物编辑正式接入任务系统的锚点。

---

### 推荐输入 Schema

第一版建议只支持“编辑已有角色”，不要一开始就同时支持“创建新角色”。

这样可以显著降低复杂度。

#### 输入字段

- `worldId`
- `entityId`
- `userRequest`
- `editingScope`
- `expectedOutcome`
- `source`

#### 推荐 TypeScript 结构

```ts
type DelegateCharacterEditorInput = {
  worldId: string
  entityId: string
  userRequest: string
  editingScope?: Array<'profile' | 'demographic' | 'relation' | 'portrait'>
  expectedOutcome?: string
  source?: 'chat' | 'world_entity_view'
}
```

#### 字段说明

`worldId`
主 agent 已确认的目标世界。

`entityId`
目标人物实体 id。  
第一版不支持省略。

`userRequest`
用户原始需求文本，作为人物编辑子 agent 的任务起点。

`editingScope`
可选。由主 agent 或调用方粗略指明修改范围。  
允许值：

- `profile`
- `demographic`
- `relation`
- `portrait`

不要求绝对准确，主要用于给子 agent 一个起始焦点。

`expectedOutcome`
可选。给子 agent 一个更明确的目标，例如：

- “补全人物简介并强化成长线”
- “修正基础属性并确保种族归属一致”

`source`
可选。说明委派来自哪里。  
推荐值：

- `chat`
- `world_entity_view`

这对以后做不同来源的提示优化会有帮助。

---

### 推荐输入 Zod 草案

```ts
const delegateCharacterEditorInputSchema = z.object({
  worldId: z.string().trim().min(1),
  entityId: z.string().trim().min(1),
  userRequest: z.string().trim().min(1).max(4000),
  editingScope: z
    .array(z.enum(['profile', 'demographic', 'relation', 'portrait']))
    .max(8)
    .optional(),
  expectedOutcome: z.string().trim().max(1000).optional(),
  source: z.enum(['chat', 'world_entity_view']).optional()
})
```

---

### 前置校验规则

工具执行前必须完成以下校验：

1. `worldId` 存在
2. `entityId` 存在
3. `entityId` 对应实体真实存在
4. 实体必须属于该 `worldId`
5. 实体类型必须是 `character`
6. 当前任务系统允许创建或续接人物编辑任务

如果任一失败，工具应返回结构化失败，而不是进入委派。

---

### 推荐输出 Schema

这个工具的输出不应是假装“人物已经编辑完成”，而应明确表示：

`任务已被接受并委派`

#### 推荐 TypeScript 结构

```ts
type DelegateCharacterEditorOutput = {
  accepted: boolean
  taskId: number
  executionId: number
  executorKind: 'character_editor'
  status: 'queued' | 'running'
  entity: {
    id: string
    worldId: string
    type: 'character'
    name: string
  }
  summary: string
  nextAction: 'await_subagent_result'
}
```

#### 推荐 Zod 草案

```ts
const delegateCharacterEditorOutputSchema = z.object({
  accepted: z.literal(true),
  taskId: z.number().int().positive(),
  executionId: z.number().int().positive(),
  executorKind: z.literal('character_editor'),
  status: z.enum(['queued', 'running']),
  entity: z.object({
    id: z.string(),
    worldId: z.string(),
    type: z.literal('character'),
    name: z.string()
  }),
  summary: z.string(),
  nextAction: z.literal('await_subagent_result')
})
```

---

### 输出语义

返回成功时，含义必须是：

1. 主 agent 已成功把人物编辑任务交给了人物编辑子 agent
2. 后台执行已经开始，或已经进入队列
3. 主 agent 现在应该告诉用户任务已开始
4. 主 agent 不应声称人物已经被修改完成

也就是说，这个工具的成功语义是：

`delegation accepted`

而不是：

`editing finished`

---

### 失败语义

建议重点覆盖以下失败类型：

#### 1. 目标实体不存在

例如：

- `CHARACTER_NOT_FOUND`

适用场景：

- `entityId` 无效

#### 2. 目标实体不是人物

例如：

- `ENTITY_IS_NOT_CHARACTER`

适用场景：

- 调到了 `nation` / `event` / `city`

#### 3. 世界与实体不匹配

例如：

- `ENTITY_WORLD_MISMATCH`

适用场景：

- `entityId` 属于别的 world

#### 4. 当前缺少人物编辑能力

例如：

- `CHARACTER_EDITOR_CAPABILITY_UNAVAILABLE`

适用场景：

- 系统未加载 `delegate_character_editor`
- 或 `character_editor` 子 agent 尚未配置

#### 5. 当前已有未结束任务

例如：

- `ACTIVE_TASK_ALREADY_EXISTS`

适用场景：

- 单任务模式下已经有别的 active task

#### 6. 委派启动失败

例如：

- `SUBAGENT_DISPATCH_FAILED`

适用场景：

- 任务记录已创建，但 dispatcher 无法正常启动子 agent

---

### 推荐成功消息

工具成功时建议返回类似 message：

```text
Character editing task has been delegated successfully.
```

对主 agent 的后续建议可以是：

```text
Tell the user that the character editing task has started and the specialized character editor is now working on it.
```

---

### 推荐失败建议

例如：

- 如果人物不存在：
  - `请先确认 entityId，或先使用查询工具读取该人物详情。`

- 如果对象不是人物：
  - `该工具只适用于 character 实体，请改用对应实体类型的编辑能力。`

- 如果没有能力：
  - `当前系统还没有加载人物编辑子 agent 能力，请先加载 delegate_character_editor 能力工具。`

---

### 推荐实现步骤

第一版建议 `delegate_character_editor` 内部只做以下几步：

1. 读取人物 detail，确认实体合法
2. 创建或续接 `TaskRecord`
3. 创建 `TaskExecutionRecord`
4. 组装人物编辑任务输入
5. 调用未来的 `SubAgentDispatcherService`
6. 立即返回委派成功结果

不要在这个工具里：

1. 直接写 profile
2. 直接写 demographic
3. 直接写 relation
4. 在主线程里等待执行完成

---

### 与人物编辑子 agent 的输入桥接

`delegate_character_editor` 最终应向人物编辑子 agent 提供一份结构化任务输入。

推荐桥接结构：

```ts
type CharacterEditorTaskPayload = {
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

这个 payload 由委派工具生成，再交给人物编辑子 agent。

---

### 第一版范围控制

为了避免第一版过于复杂，推荐明确限定：

1. 只支持编辑已有角色
2. 不支持通过该工具直接新建角色
3. 不支持一次处理多个角色
4. 不支持跨 world 编辑
5. 不在工具中做角色文本自动生成本体逻辑

也就是说，第一版 `delegate_character_editor` 只是：

`人物编辑任务启动器`

而不是：

`人物编辑全功能入口`

---

### 当前结论

`delegate_character_editor` 的正确定位不是数据库写入工具，而是主 agent 调用的人物编辑委派工具。

它的本质职责是：

1. 校验目标人物是否合法
2. 建立人物编辑任务
3. 启动人物编辑子 agent
4. 向主 agent 返回“任务已开始”

这会使它同时符合：

1. 当前任务系统边界
2. 当前工具系统规范
3. 当前人物编辑架构方向

因此，`delegate_character_editor` 应被作为人物 AI 编辑路线中的第一层入口工具来设计。

### 当前代码落地状态

当前已经形成代码骨架的部分：

1. `delegate_character_editor` 协议工具文件
2. `characterEditorToolkit` 草案文件
3. `get_character_detail` 工具
4. 人物编辑相关 schema 草案

当前状态已更新为：

`delegate_character_editor` 已接入主 agent 工具集

但当前仍有一个重要现实限制：

1. 人物编辑子 agent 本体尚未实现
2. dispatcher 尚未接通
3. 当前工具调用成功后，返回的是“任务已登记并进入协议队列”，而不是“人物编辑已经完成”

因此当前状态应被理解为：

`协议入口已启用，但后台人物编辑执行链尚未真正接通`

### 第二步

先只做人物读取与 profile/demographic 写入：

1. `get_character_detail`
2. `upsert_character_profile`
3. `upsert_character_demographic`

### 第三步

再补人物关系工具：

1. `list_character_relations`
2. `upsert_character_relation`

### 第四步

最后再补一致性检查工具和经验沉淀。

---

## 当前结论

当前最适合的人物编辑 AI 方案不是：

- 主 agent 直接调人物写入工具
- 也不是做一个通用世界编辑大 agent

而是：

`主 agent 调用人物编辑子 agent`

并且：

`人物编辑子 agent 使用人物专用工具集`

这条路线同时满足：

1. 当前任务系统边界
2. 当前工具系统设计原则
3. 当前世界观数据结构
4. 不同实体类型应有不同 skill 规范的产品判断

因此，这一方案应被视为当前人物 AI 编辑方向的第一优先级。
