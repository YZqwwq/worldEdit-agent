# 人格与记忆系统设计说明（当前实现）

## 目标

当前系统的定位是：

- 以陪聊为主
- 干活为辅
- 人格不是固定 prompt，而是会随互动变化的调节层
- 记忆不是单段大摘要，而是分层协作

当前主张：

`人格负责调节行为`
`记忆负责维持连续性`
`observation 负责把互动转成可积累信号`

## 当前主链

主链仍然保持：

`START -> personaNode -> contextNode -> llmCall -> (toolNode 循环 | memoryNode) -> END`

但人格与记忆已经拆成了独立层：

`InteractionObservation -> 短期插槽 / 人格状态 -> 阶段记忆 -> 长期记忆 -> contextNode 注入`

## 人格系统

### 核心职责

人格系统的职责不是输出一段“角色设定”，而是根据互动动态调整本轮行为。

它当前主要影响：

- 采样参数
- 风格表达
- 工具风险策略
- 记忆窗口参数

### 当前人格结构

人格状态仍采用三层：

1. `stable_preferences`
   长期稳定偏好
2. `session_hormones`
   当前会话中的中期波动
3. `transient_state`
   最近一两轮的短期波动

最后汇总为：

- `metrics`
- `current_behavioral_narrative`
- `PersonaPolicy`

### 输入来源

人格系统的输入来自 `InteractionObservation`，例如：

- `user_message`
- `user_interrupt`
- `user_revert`
- `task_completed`
- `task_failed`
- `task_cancelled`

同时也会消费短期插槽中的：

- 当前对话状态
- 当前用户情绪

### 当前 PersonaPolicy

当前人格策略输出四个出口：

1. `sampling`
2. `tool`
3. `style`
4. `memory`

其中 `memory` 目前控制：

- `archiveThreshold`
- `shortTermLimit`

## 当前记忆系统

当前记忆系统已经收敛为四层最小结构。

### 1. 短期窗口

定义：

`短期窗口 = 最近对话`

职责：

- 保留最近几条原始 `user/ai` 消息
- 让模型自然接续上下文

特点：

- 不做结构化
- 不负责长期总结
- 超出窗口后进入阶段归档缓冲

### 2. 短期插槽

定义：

`短期插槽 = 当前状态 + 当前情绪`

当前只保留两块：

1. `conversation_state`
   - `conversation_mode`
   - `interaction_state`
2. `user_mood`
   - `current_mood`
   - `valence`
   - `confidence`

职责：

- 告诉 agent 当前应当如何陪用户交流
- 提供短时的互动控制状态

特点：

- 由 observation 增量更新
- 不保存大段内容
- 不承载长期偏好

### 3. 阶段记忆

定义：

`阶段记忆 = 阶段摘要 + 阶段氛围`

当前只保留两块：

1. `summary`
2. `moodLabel`

职责：

- 把一小段聊天阶段压成轻量归档
- 保住最近几段聊天的连续性

特点：

- 由 `archiveBuffer` 触发生成
- 优先用 quick model 归档
- 失败时回退到规则摘要

### 4. 长期记忆

定义：

`长期记忆 = 总体总结 + 用户画像`

当前只保留两块：

1. `memorySummary`
2. `userProfile`

职责：

- 提供跨阶段仍成立的长期背景
- 为主 agent 提供稳定的人与关系认知

特点：

- 不再直接吃原始对话
- 先由阶段记忆生成，再被长期记忆吸收

## 四层记忆的边界

### 短期窗口

回答：

`刚刚具体说了什么`

### 短期插槽

回答：

`这几轮现在是什么状态`

### 阶段记忆

回答：

`最近这一段聊成了什么`

### 长期记忆

回答：

`以后隔很久再聊，也仍然成立的认知是什么`

## 当前注入策略

当前由 `memoryPromptPolicy` 统一控制注入。

大致顺序是：

1. 长期记忆
2. 短期插槽
3. 视情况注入最近阶段记忆
4. 短期窗口原始消息

设计原则：

- 长期记忆提供稳定背景
- 短期插槽提供当前调节信息
- 阶段记忆只作为补充
- 短期窗口负责自然接话

## 当前已经移除的旧方案

以下旧方案已经退出主链：

- 单段长期 `summary` 作为主数据源
- `recent_matters`
- `persistentOpenLoops`
- 六段式长期记忆
- 富结构阶段记忆（`topicTags / keyFacts / carryForwardTopics`）
- 文件式历史导入作为当前主存储方案

当前数据库与运行时主链都以新结构为准。

## 当前仍保留的兼容层

为了避免破坏旧数据恢复，目前仍保留少量兼容：

1. 旧 turn checkpoint 中的 `summary` 恢复兼容
2. `memory_state.summary` 作为旧数据库行的恢复兜底

这些兼容层不再参与主链行为控制，只用于旧数据恢复。

## 未来待修复 / 待收敛

### 1. checkpoint 旧 `summary` 兼容下线

当前仍保留旧 `memoryCheckpointJson.summary` 的恢复逻辑。

后续应在确认旧 turn 数据不再需要恢复后移除。

### 2. memory_state.summary 旧列下线

当前 `memory_state.summary` 仍作为老数据兜底。

后续应在完成数据库迁移后移除。

### 3. 阶段切分策略升级

当前阶段切分仍主要基于窗口阈值。

后续更理想的方案应加入：

- 话题切换
- 情绪转折
- 长时间停顿
- 明显关系段落变化

使阶段边界更符合陪聊节奏。

### 4. 插槽写入时机继续优化

当前插槽已改为“读时只读”，但写入仍通过 reconcile 流完成。

后续可以继续收敛为更明确的“事件写入时更新”模型。

### 5. 长期记忆按需读取方案评估

当前长期记忆仍默认注入。

后续可评估：

- 保留极短长期背景默认注入
- 更详细长期记忆改为工具按需读取

以进一步降低 prompt 体积。

## 一句话总结

当前人格与记忆系统已经收敛为：

`短期窗口 = 最近对话`
`短期插槽 = 当前状态 + 当前情绪`
`阶段记忆 = 阶段摘要 + 阶段氛围`
`长期记忆 = 总体总结 + 用户画像`

并由 observation 驱动人格与记忆共同演化。
