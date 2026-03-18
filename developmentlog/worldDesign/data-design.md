# 世界观数据架构设计记录

## 当前目标

当前世界观系统的目标不是做一个“把所有设定塞进一张表”的静态资料页，而是建立一套：

- 可持续扩展
- 可校验
- 可被 UI 消费
- 可被未来 AI 工具消费

的数据架构。

我们希望未来 AI 不只是“看到一段世界观文本”，而是能够通过结构化工具：

- 创建世界
- 创建实体
- 为实体写入组件数据
- 建立实体关系
- 查询当前 schema 和允许的字段

因此世界观数据结构必须先成为一个稳定的“知识建模系统”。

---

## 当前总体架构

当前世界观系统采用四层核心结构：

1. `World`
2. `Entity`
3. `Component`
4. `Relation`

同时，在这四层之上，再增加一层“定义层”：

5. `Definition Layer`

也就是：

`World -> Entity -> Component -> Relation`

并由：

`EntityDefinition / ComponentDefinition / RelationDefinition`

来描述这套数据系统本身。

---

## 第一层：World

`World` 表示一个完整世界观容器。

当前数据对象：

- `WorldPayload`

数据库实体：

- `src/share/entity/database/WorldRecord.ts`

主要字段：

- `id`
- `name`
- `summary`
- `status`
- `schemaVersion`
- `createdAt`
- `updatedAt`

作用：

- 作为所有世界观实体的归属根节点
- 用来区分不同世界观项目
- 为后续 schema migration 提供版本号入口

可以把它理解成：

“一个世界观工程”

而不是一个具体设定对象。

---

## 第二层：Entity

`Entity` 是世界中的一个具体对象。

当前数据对象：

- `WorldEntityPayload`

数据库实体：

- `src/share/entity/database/WorldEntityRecord.ts`

主要字段：

- `id`
- `worldId`
- `type`
- `name`
- `slug`
- `title`
- `summary`
- `status`
- `schemaVersion`

当前支持的实体类型：

- `character`
- `race`
- `faction`
- `nation`
- `city`
- `region`
- `map`
- `map_location`
- `event`
- `item`
- `rule`
- `custom`

`Entity` 的作用是：

- 提供一个统一的实体壳
- 为不同类型对象提供共同主键和归属信息
- 让人物、国家、城市、事件都能被统一引用和关系化

它本身不承担全部业务字段。

也就是说：

`Entity 是对象壳，不是完整对象内容`

---

## 第三层：Component

`Component` 用来承载实体的具体内容模块。

当前数据对象：

- `WorldEntityComponentPayload`

数据库实体：

- `src/share/entity/database/WorldEntityComponentRecord.ts`

主要字段：

- `id`
- `entityId`
- `componentType`
- `schemaVersion`
- `dataJson`

它的本质是：

`一个实体可以挂多个组件，每个组件负责一个维度的数据`

例如：

- 人物可以有：
  - `character_profile`
  - `character_demographic`
- 国家可以有：
  - `nation_profile`
- 事件可以有：
  - `event_profile`

这样设计的好处是：

- 不需要把所有类型字段塞进一张大表
- 每个实体类型都可以有自己的 starter component
- 后续可以不断给实体“追加能力”

例如未来加入：

- `civilization_profile`
- `ability_system_profile`
- `magic_rule_profile`
- `technology_profile`

都可以作为组件加入，而不需要推翻现有结构。

---

## 第四层：Relation

`Relation` 用于表达实体和实体之间的图谱关系。

当前数据对象：

- `WorldEntityRelationPayload`

数据库实体：

- `src/share/entity/database/WorldEntityRelationRecord.ts`

主要字段：

- `id`
- `worldId`
- `sourceEntityId`
- `targetEntityId`
- `relationType`
- `direction`
- `dataJson`
- `startTimeId`
- `endTimeId`

它的作用是：

- 把两个实体连接起来
- 表达多对多、可演化、可查询的关系
- 未来为 AI 推理、世界观查询、关系图谱提供基础

当前已设计的关系类型包括：

- `parent_of`
- `member_of`
- `governs`
- `located_in`
- `part_of`
- `allied_with`
- `hostile_to`
- `originates_from`
- `possesses`
- `participates_in`

关系层非常重要，因为很多世界观信息并不适合直接塞进组件字段里。

例如：

- 两个国家是同盟
- 某势力敌对某势力
- 某人物参与某事件
- 某城市属于某区域

这些都更适合做成 `Relation`，而不是组件内部字段。

---

## 第五层：Definition Layer

为了让这套系统未来可被 UI 和 AI 正确消费，我们又在数据层之上建立了定义层。

当前主要定义类型：

- `WorldbuildingEntityDefinition`
- `WorldbuildingComponentDefinition`
- `WorldbuildingRelationDefinition`
- `WorldbuildingFieldDefinition`
- `WorldbuildingSchemaCatalogPayload`

相关代码：

- `src/share/cache/worldbuilding/worldbuilding.ts`
- `src/share/cache/worldbuilding/definitions.ts`

定义层负责说明：

- 系统允许哪些实体类型
- 每种实体默认挂哪些组件
- 每个组件有哪些字段
- 字段是什么类型
- 哪些字段引用别的实体
- 哪些关系类型合法
- 哪些源类型和目标类型允许建立关系

这层不是存业务数据，而是存“数据规则”。

它是未来 AI 使用工具时最关键的一层契约。

---

## 为什么不用“一张大 JSON”或“一张超宽表”

如果世界观系统做成：

- 一个超大的 JSON 文档
- 或一张字段极多的大表

短期看似简单，长期会非常难维护。

问题包括：

1. 字段越来越多，类型越来越混乱
2. 新增概念时必须不断改旧表结构
3. 人物、国家、事件、地图会互相污染字段语义
4. AI 很难知道“当前什么字段合法”
5. UI 很难自动生成编辑器
6. 关系查询会非常痛苦

所以当前选择的是：

`统一实体壳 + 可扩组件 + 独立关系 + 显式定义层`

这是更适合世界观长期生长的结构。

---

## 当前的关联方式

当前世界观数据主要有两种关联方式：

### 1. 组件字段里的 `entity_ref / entity_ref_list`

例如：

- 人物基础属性里的 `raceEntityId`
- 国家档案里的 `capitalEntityId`
- 事件档案里的 `participantEntityIds`

这类关联适合表达：

- 强归属关系
- 高频读取关系
- 组件内部不可缺少的结构化字段

可以理解为：

`字段级引用`

---

### 2. 独立 `Relation`

例如：

- `character member_of faction`
- `nation allied_with nation`
- `city located_in region`
- `character participates_in event`

这类关联适合表达：

- 多对多关系
- 动态关系
- 需要独立备注或上下文的数据
- 后续可能被图谱查询和 AI 推理使用的边

可以理解为：

`图谱级引用`

---

## 当前推荐的使用规则

为了避免组件字段和关系层混乱，推荐采用以下原则：

### 放在组件里的关系

适合：

- 这是实体自身属性的一部分
- 这是高频字段
- 这是“填这个组件就应该填”的结构化归属信息

例子：

- 人物的种族
- 国家的首都
- 事件的发生地

---

### 放在 Relation 里的关系

适合：

- 这是实体之间的独立边
- 可能是一对多或多对多
- 需要备注、时间、置信度
- 将来希望做图谱查询或关系可视化

例子：

- 同盟
- 敌对
- 参与
- 统治
- 隶属

---

## 当前是否便于后续拓展

结论：

`是，当前架构是便于继续扩展的。`

原因主要有三点。

### 1. 实体类型可扩

如果未来确定“文明体系”“能力体系”是一级核心对象，可以直接新增：

- `civilization`
- `ability_system`

然后加入：

- 对应的 entity definition
- 对应的 starter component
- 对应的 relation definition

不需要推翻 `World / Entity / Component / Relation` 结构。

---

### 2. 组件类型可扩

即使暂时不想增加新的实体类型，也可以先通过：

- `custom` 实体
- 新增 component type

来承载试验性的结构。

例如：

- `civilization_profile`
- `ability_system_profile`
- `energy_source_profile`

这样能先验证数据模型，再决定是否升格为一级实体类型。

---

### 3. 关系类型可扩

未来即使不加新实体，也可以增加新的关系语义：

- `inherits_from`
- `controls`
- `uses_system`
- `evolves_into`
- `founded_by`

这种扩展不会破坏已有实体表和组件表，只需要补 relation definition 和 relation schema。

---

## 未来加入“文明体系”“能力体系”时建议怎么做

当前建议分两种情况。

### 情况 A：它们是世界核心对象

如果“文明体系”“能力体系”在世界观里地位很高，建议直接建成一级实体类型。

例如：

- `civilization`
- `ability_system`

并为它们增加：

- `civilization_profile`
- `ability_system_profile`

然后通过关系连接：

- `nation part_of civilization`
- `race originates_from civilization`
- `character uses ability_system`
- `rule governs ability_system`

这种方式适合：

- 体系本身可被单独讨论
- 体系和多个对象发生关联
- AI 未来需要把它们当作单独对象操作

---

### 情况 B：它们还是实验性概念

如果目前还不能确定它们是不是一级对象，可以先：

- 使用 `custom` 实体
- 配合新的 profile component

这样成本更低，也能保持数据结构整洁。

一旦概念稳定，再把它升级成独立实体类型。

---

## 当前数据流

当前世界观数据链路是：

`renderer -> preload -> ipcMain -> worldbuildingService -> typeorm/sqlite`

关键层：

- 前端页面：
  - `src/renderer/src/views/WorldEditHomeView.vue`
  - `src/renderer/src/views/WorldEditorView.vue`
  - `src/renderer/src/views/WorldEntityView.vue`
- renderer service：
  - `src/renderer/src/services/worldbuildingClientService.ts`
- preload：
  - `src/preload/index.ts`
- main service：
  - `src/main/services/worldbuilding/worldbuildingService.ts`
- shared types：
  - `src/share/cache/worldbuilding/worldbuilding.ts`
- shared definitions：
  - `src/share/cache/worldbuilding/definitions.ts`
- database entities：
  - `src/share/entity/database/WorldRecord.ts`
  - `src/share/entity/database/WorldEntityRecord.ts`
  - `src/share/entity/database/WorldEntityComponentRecord.ts`
  - `src/share/entity/database/WorldEntityRelationRecord.ts`

---

## 未来 AI 使用工具时需要的能力

为了让 AI 真正参与世界观创作，当前数据架构已经在向以下能力靠拢：

### 1. 查询 schema catalog

AI 需要知道：

- 可以创建哪些实体类型
- 每种实体默认组件是什么
- 组件有哪些字段
- 合法关系有哪些

当前已增加：

- `WorldbuildingSchemaCatalogPayload`

这就是未来 AI 工具的“说明书”。

---

### 2. 基础写操作标准化

AI 最终应该通过这些操作而不是自由拼 JSON：

- `createWorld`
- `createEntity`
- `upsertComponent`
- `createRelation`

当前主进程 service 已经基本具备这些能力。

---

### 3. 数据校验

未来 AI 工具最怕的是“写入结构错误”。

当前已经通过：

- component schema 校验
- relation schema 校验
- entity type / component type 允许性校验
- relation source / target type 允许性校验

来减少这类问题。

这意味着未来 AI 就算创作得比较激进，也更难把数据库写坏。

---

## 当前架构的优点

### 1. 结构清晰

- `World` 是项目容器
- `Entity` 是对象壳
- `Component` 是对象内容模块
- `Relation` 是对象之间的图谱边
- `Definition` 是规则层

---

### 2. 扩展成本低

增加新概念时通常只需要：

- 新增实体类型
- 或新增组件类型
- 或新增关系定义

而不是重构整套数据库。

---

### 3. 适合未来自动化

因为 schema 已经显式化，所以未来不论是：

- AI 工具调用
- 自动表单渲染
- 图谱可视化
- 关系编辑器

都更容易实现。

---

## 当前架构仍然缺什么

虽然底层方向已经比较稳，但目前还没有完全做完。

当前还缺的主要是：

### 1. 通用组件编辑器

现在实体页仍然是“按类型映射一个默认描述组件”，还不是基于 `fields` 自动生成表单。

---

### 2. 通用关系编辑器

关系定义已经有了，但前端还没有通用的关系创建和编辑面板。

---

### 3. 更完整的引用校验

目前 schema 已能说明某字段是 `entity_ref`，但还可以继续增强：

- 检查引用实体是否真实存在
- 检查引用实体是否属于允许类型

---

### 4. 查询能力

如果未来世界观变大，还需要补：

- 反向引用查询
- 某实体邻接关系查询
- 某关系类型过滤
- 时间维度查询

---

## 当前结论

当前世界观数据架构已经形成了一个比较稳的基础：

- 用 `World` 管项目容器
- 用 `Entity` 管对象壳
- 用 `Component` 管对象内容
- 用 `Relation` 管图谱连接
- 用 `Definition Layer` 管规则和 schema

这套结构不是为了“先把页面做出来”，而是为了后续：

- 长期扩展世界观
- 引入更多体系设定
- 让 AI 通过工具安全参与创作

因此，就当前阶段而言，这套架构是正确且值得继续往下做的。

---

## 后续建议

下一阶段建议优先做：

1. 基于 `fields` 的通用组件编辑器
2. 基于 relation definitions 的关系编辑器
3. 实体引用选择器
4. 面向 AI 的 schema catalog + world query 工具设计

这样世界观系统就会从“可存储”进入“可创作、可扩展、可被 AI 操作”的阶段。
