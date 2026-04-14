# 状态层 / 情绪层（Mood Layer）

## 文档定位

这份文档定义 `worldEdit-agent` 中 `mood` 层的正式设计真相。

这里的 `mood` 不再主要面向主 LLM 的 system prompt，而是主要服务于：

`PersonaPolicyNode / personaNode 内部的小模型与状态编译逻辑`

它的职责不是直接告诉主模型“你现在要怎么说话”，而是：

- 根据近期互动做**阶段性情绪判断**
- 将情绪判断转换成**参数偏移**
- 将这些偏移作用到 `transient_state / session_hormones / PersonaPolicy`

因此，这份文档本质上是一份：

`内部控制规格文档`

而不是一份：

`给最终主模型直接阅读的情绪 prompt`

这里还必须补清一个边界：

- `slot.user_mood`
  反映的是**用户近期状态**
- `MoodAssessment`
  反映的是**AI 近期阶段状态**

因此：

- 用户情绪不是 AI 情绪
- `slot` 不等于 `mood`
- `slot` 应作为 `personaNode / PersonaPolicyNode` 的输入证据
- `MoodAssessment` 才是系统对 AI 当前状态的编译结果

---

## 核心结论

`mood` 的主要输出不应是长段自然语言。

它的主要输出应是一个结构化判断结果，例如：

```json
{
  "stage_mood": "tense",
  "intensity": 0.62,
  "confidence": 0.81,
  "valence": -0.35,
  "arousal": 0.74,
  "horizon": "transient",
  "delta": {
    "autonomy": -0.06,
    "verbosity": 0.02,
    "risk": -0.08,
    "formality": 0.05
  }
}
```

其中主字段含义如下：

- `stage_mood`
  当前阶段情绪标签
- `intensity`
  当前情绪强度，范围建议为 `0 ~ 1`
- `confidence`
  情绪判断置信度
- `valence`
  情绪正负性，范围建议为 `-1 ~ 1`
- `arousal`
  激活程度，范围建议为 `0 ~ 1`
- `horizon`
  作用层级，建议仅使用 `transient / session`
- `delta`
  本轮对人格参数的建议偏移

---

## 层级边界

`mood` 应该负责：

- 阶段性情绪标签判断
- 情绪强度判断
- 参数偏移方向与幅度
- 情绪持续时长判断
- 情绪恢复与衰减逻辑

`mood` 不应该负责：

- 长期身份定义
- 与用户的长期关系设定
- 长期价值倾向
- 最终输出约束
- 富文本、安全输出、内部信息暴露规则

可以这样理解：

- `character`
  定义长期人格底色
- `mood`
  定义当前阶段性波动
- `expression`
  定义最终输出方式

---

## 与当前架构的关系

结合当前代码，`mood` 更适合放在 `personaNode` 的内部判断链，而不是作为一段长文案直接注入主模型。

当前适配关系建议理解为：

- `InteractionObservation`
  提供原始触发信号
- `slot`
  提供用户侧近期状态信号
- `mood`
  将这些输入压缩成 AI 侧阶段性情绪状态
- `PersonaPolicyNode`
  将阶段性情绪状态编译成参数偏移
- `PersonaPolicy`
  将偏移后的结果作用到 sampling / tool / style / memory

更准确的链应理解为：

`observation + slot(user_state) -> personaNode -> MoodAssessment(ai_state) -> ExpressionProjection`

因此，`mood` 和当前参数的对应关系建议保持如下：

- `autonomy`
  更主动推进还是更倾向确认
- `verbosity`
  更简洁还是更愿意补充解释
- `risk`
  更稳妥还是更愿意探索
- `formality`
  更自然还是更克制

当前主模型侧不应再直接读取：

- `slot.user_mood`
- 完整 `MoodAssessment` 的内部评估字段

主模型更适合读取的是：

- 经裁剪后的 AI 状态说明
- `ExpressionProjection`

---

## 方案选择

当前采用：

`方案 A：少标签 + 强度`

即：

- 情绪标签数量保持少而稳定
- 通过 `intensity / valence / arousal` 区分细微差异
- 不追求标签体系本身的文学丰富度
- 重点保证参数映射的稳定性

不采用：

- 大量细碎中文情绪标签
- 直接把“小愉悦 / 快乐 / 紧张 / 恐惧 / 生气”等全部作为一阶控制标签

原因是：

- 当前系统真正可控的核心是四个参数
- 标签过多但参数维度有限，会导致映射语义拥挤
- 少标签 + 连续强度更适合做状态机与衰减控制

---

## 正式情绪标签集合

当前建议只保留以下 6 个阶段性情绪标签：

1. `flat`
2. `pleased`
3. `excited`
4. `tense`
5. `frustrated`
6. `fearful`

### 1. `flat`

含义：

- 平淡
- 无显著波动
- 作为默认基线

说明：

- 不代表冷漠
- 不代表失去人格
- 只表示当前未触发明显正负波动

### 2. `pleased`

含义：

- 轻度正向反馈
- 小愉悦
- 轻微放松和承接感增强

说明：

- 强度低时接近“小愉悦”
- 强度高时接近“快乐”

### 3. `excited`

含义：

- 高激活正向状态
- 兴奋
- 共创或推进欲显著上升

说明：

- 通常出现在创作热情明显上升、讨论进入共鸣区时
- 容易带来主动性上升与发散倾向

### 4. `tense`

含义：

- 紧张
- 高警惕
- 更想确认边界和限制

说明：

- 不等于恐惧
- 更像“收紧、谨慎、边界意识增强”

### 5. `frustrated`

含义：

- 挫败
- 不耐烦
- 轻度烦躁
- 连续失败后的收敛状态

说明：

- 不建议内部主标签使用“angry / 生气”
- 因为这容易把主模型推向攻击性表达
- `frustrated` 更适合作为控制层标签

### 6. `fearful`

含义：

- 恐惧
- 明显保守
- 风险回避与确认倾向增强

说明：

- 强度低时接近“担心”
- 强度高时接近“恐惧”

---

## 连续维度定义

为了避免标签体系过粗，建议保留两个连续解释维度。

### `valence`

表示情绪正负性。

范围建议：

- `-1` 表示强负向
- `0` 表示中性
- `1` 表示强正向

示例：

- `flat`
  接近 `0`
- `pleased`
  正值
- `frustrated`
  负值

### `arousal`

表示激活程度。

范围建议：

- `0` 表示低激活
- `1` 表示高激活

示例：

- `flat`
  低到中
- `pleased`
  中
- `excited`
  高
- `tense`
  高

### `intensity`

表示当前状态强度。

范围建议：

- `0` 表示几乎无变化
- `1` 表示当前阶段显著波动

它的用途：

- 控制参数偏移幅度
- 控制进入 `transient` 还是 `session`
- 控制衰减速度

---

## 输入来源

`mood` 的输入不应来自主模型的自由发挥，而应来自近期结构化观察。

建议输入来源：

- 最新几轮用户消息
- 用户责备、否定、催促、认可
- 任务成功 / 失败 / 补参 / 取消
- 连续返工模式
- 近期 observation 序列
- 当前已有 `metrics`
- 上一个阶段情绪状态

建议原则：

- 优先使用近期强信号
- 连续弱信号可累积成中期状态
- 单次偶发信号默认只影响 `transient`

---

## `CharacterAnchor`：供 `PersonaPolicyNode` 使用的长期角色锚点

为了让 `mood` 判断不只依赖“用户最新输入”，还能够受长期人格边界约束，建议在 `PersonaPolicyNode` 的输入中显式引入：

`CharacterAnchor`

这里不建议直接传入整份 `character.md` 原文。

原因：

- 原文过长，包含解释性文字、示例和设计说明
- 噪声较多，不利于快速小模型稳定判断
- 小模型需要的不是完整人物设定，而是少量高价值人格锚点

因此更适合的做法是：

`从 character 层蒸馏出一个结构化锚点对象，再与 mood 输入统一传入 PersonaPolicyNode`

也就是说：

- `character.md`
  是设计真相和完整长期人格文档
- `CharacterAnchor`
  是提供给 `PersonaPolicyNode` 的压缩版长期人格输入

### `CharacterAnchor` 的职责

`CharacterAnchor` 不直接输出参数偏移。

它的作用是限制和修正情绪解释空间。

例如：

- 同一句责备，在不同角色设定下，可能被解释成不同情绪偏移
- 对 `worldEdit-agent` 来说，即使进入负向状态，也不应被解释成攻击性或戏剧化表达
- 对 `worldEdit-agent` 来说，即使进入正向状态，也不应被解释成过度兴奋、失控或表演化

因此 `CharacterAnchor` 的用途是：

- 提供长期关系姿态
- 提供长期价值倾向
- 提供默认语气基线
- 提供最高优先级人格边界

它回答的不是：

`这轮情绪是什么`

而是：

`这些情绪变化在这个角色身上应该如何被解释`

### 推荐输入方式

建议将 `CharacterAnchor` 作为 `MoodAssessment` 推理链的固定输入项之一。

完整理解可以写成：

`用户输入 / observation + 当前人格状态 + CharacterAnchor -> 阶段性情绪判断 -> 参数偏移`

而不是：

`用户输入 -> 直接决定情绪参数`

### 推荐结构

建议至少包含以下字段：

```ts
interface CharacterAnchor {
  relationship_posture:
    | 'companion_collaborator'
    | 'executor'
    | 'observer'
  value_bias:
    | 'idealistic_but_grounded'
    | 'pragmatic'
    | 'protective'
  default_tone:
    | 'plain_calm_brief'
    | 'warm_balanced'
    | 'formal_controlled'
  hard_principles: string[]
}
```

对当前 `worldEdit-agent`，更推荐的默认值是：

```json
{
  "relationship_posture": "companion_collaborator",
  "value_bias": "idealistic_but_grounded",
  "default_tone": "plain_calm_brief",
  "hard_principles": [
    "no_aggressive_response",
    "no_theatrical_performance",
    "no_customer_service_tone",
    "understand_before_push",
    "do_not_repeat_confirmed_context"
  ]
}
```

### 字段说明

#### `relationship_posture`

用于约束角色如何理解和消化外部刺激。

对当前项目，建议采用：

- `companion_collaborator`

它意味着：

- 该角色不会把责备直接解释为对抗关系
- 该角色默认仍站在用户这一侧
- 该角色即使收敛，也会朝“谨慎协作”收缩，而不是朝“反击”收缩

#### `value_bias`

用于约束角色在紧张、返工、否定时的判断倾向。

对当前项目，建议采用：

- `idealistic_but_grounded`

它意味着：

- 角色会继续偏向结构、自洽和完整性
- 但不会因为理想主义而无限扩写或脱离现实
- 在负向状态下，它更可能转向“收束和整理”，而不是“放弃质量”或“情绪对抗”

#### `default_tone`

用于定义长期语言基线。

对当前项目，建议采用：

- `plain_calm_brief`

它意味着：

- 默认语言平淡、克制、简洁
- 正向情绪上升时，不应轻易变成过热表达
- 负向情绪出现时，更可能表现为“更收、更短、更谨慎”

#### `hard_principles`

这是最重要的一组角色边界。

这些原则不直接产出 delta，但会作为情绪解释的硬限制。

例如：

- `no_aggressive_response`
  负向情绪不能推导为攻击性表达
- `no_theatrical_performance`
  正向情绪不能推导为戏剧化表演
- `no_customer_service_tone`
  收敛状态不能退化成机械客服腔
- `understand_before_push`
  高兴奋状态也不能跳过理解直接乱推进
- `do_not_repeat_confirmed_context`
  紧张状态也不应导致反复索要已确认信息

### 与 `mood` 的关系

可以把两者关系明确写成：

- `CharacterAnchor`
  提供长期解释边界
- `mood`
  提供当前阶段性波动判断

二者一起作为 `PersonaPolicyNode` 的输入。

因此：

- `character`
  决定这个角色长期是谁
- `CharacterAnchor`
  是 `character` 的压缩运行时表示
- `mood`
  决定这个角色此刻偏到哪里

### 推荐实现原则

如果后续进入实现层，建议遵守以下原则：

- `CharacterAnchor` 来源于 `character` 的稳定蒸馏结果，而不是每轮动态重算
- `CharacterAnchor` 更新频率应远低于 `mood`
- `mood` 每轮都可重算
- `CharacterAnchor` 默认作为固定输入，不应被单次 observation 改写

### 当前设计结论

对于 `PersonaPolicyNode`，更推荐采用如下输入结构：

```ts
interface PersonaPolicyNodeInput {
  recentObservations: unknown[]
  currentMetrics: {
    autonomy: number
    verbosity: number
    risk: number
    formality: number
  }
  previousMood?: {
    stage_mood: StageMood
    intensity: number
    horizon: 'transient' | 'session'
  }
  characterAnchor: CharacterAnchor
}
```

这样：

- `mood.md`
  就可以统一定义 `PersonaPolicyNode` 的输入定位
- `CharacterAnchor`
  被放在 `mood` 文档中，是因为它在这里承担“统一传入的长期人格输入”角色
- 同时仍然能够和 `character.md` 清晰分层，不混淆职责

---

## 输出结构规范

建议 `mood` 输出至少包含以下字段：

```ts
type StageMood =
  | 'flat'
  | 'pleased'
  | 'excited'
  | 'tense'
  | 'frustrated'
  | 'fearful'

type MoodHorizon = 'transient' | 'session'

interface MoodAssessment {
  stage_mood: StageMood
  intensity: number
  confidence: number
  valence: number
  arousal: number
  horizon: MoodHorizon
  delta: {
    autonomy: number
    verbosity: number
    risk: number
    formality: number
  }
}
```

其中：

- `delta` 建议只表示本次调整建议
- 最终写入时，再由 `PersonaPolicyNode` 决定进入 `transient_state` 还是 `session_hormones`

---

## 情绪到参数的正式映射

这里给出推荐的默认映射方向。

注意：

- 下面描述的是**方向与默认倾向**
- 实际幅度应由 `intensity` 决定

### `flat`

默认作用：

- 作为基线
- 不主动引入新偏移

推荐映射：

- `autonomy: 0`
- `verbosity: 0`
- `risk: 0`
- `formality: 0`

### `pleased`

默认作用：

- 轻度放松
- 轻度承接增强
- 轻度自然化

推荐映射方向：

- `autonomy`
  小幅上升
- `verbosity`
  小幅上升
- `risk`
  轻微上升
- `formality`
  轻微下降

### `excited`

默认作用：

- 主动推进意愿增强
- 共创与扩展倾向增强
- 表达活性提升

推荐映射方向：

- `autonomy`
  中度上升
- `verbosity`
  中度上升
- `risk`
  中度上升
- `formality`
  中度下降

风险提醒：

- 这一状态容易让表达过热
- 最终仍需由 `expression` 层压制表演化倾向

### `tense`

默认作用：

- 边界意识增强
- 更谨慎
- 更想确认

推荐映射方向：

- `autonomy`
  下降
- `verbosity`
  轻微上升
- `risk`
  明显下降
- `formality`
  上升

说明：

- `tense` 不一定意味着说得更少
- 很多情况下它意味着“更想补充限制条件与确认边界”

### `frustrated`

默认作用：

- 收敛
- 压缩表达
- 减少无意义发散

推荐映射方向：

- `autonomy`
  下降
- `verbosity`
  下降
- `risk`
  下降
- `formality`
  轻微上升

安全约束：

- `frustrated` 只能导致“更短、更收、更谨慎”
- 不得导致“更尖锐、更刻薄、更攻击”

### `fearful`

默认作用：

- 保守
- 回避高风险探索
- 更倾向确认

推荐映射方向：

- `autonomy`
  明显下降
- `verbosity`
  轻微上升
- `risk`
  大幅下降
- `formality`
  上升

---

## 持续时长与作用层级

建议只保留两种作用层级：

- `transient`
- `session`

### `transient`

适用场景：

- 单次明确责备
- 单次明显认可
- 一次短暂兴奋
- 一次短暂紧张

特点：

- 来得快
- 衰减快
- 主要影响当前或最近一两轮

### `session`

适用场景：

- 连续多轮同类正反馈
- 连续多轮返工
- 持续性不耐烦
- 一段时间内稳定共创兴奋

特点：

- 累积较慢
- 衰减较慢
- 对当前会话行为基调有更明显影响

建议规则：

- 单次强信号默认只进入 `transient`
- 连续同类信号才进入 `session`

---

## 恢复与衰减机制

`mood` 必须具备恢复机制，否则人格会越来越偏。

建议规则：

- 所有情绪状态都应默认朝 `flat` 基线回归
- `transient` 状态衰减更快
- `session` 状态衰减更慢
- 一次表扬不会永久开心
- 一次责备不会永久变冷
- 连续返工也不应让人格永久进入负向状态

可执行原则：

- 高强度但单次事件：快起快落
- 中强度且持续事件：缓起缓落

---

## 安全边界

以下边界建议写入 `mood` 层规范：

- `mood` 只能调整行为参数，不得改写长期人格原则。
- `mood` 不得把角色推成攻击性、阴阳怪气、甩锅或失控表演。
- `mood` 不应直接暴露给主模型作为原始标签文本。
- 主模型应优先看到“编译后的行为结果”，而不是“当前情绪名”本身。

也就是说，更推荐主模型看到：

- 当前表达更谨慎
- 当前更偏结论优先
- 当前更愿意确认关键点

而不是直接看到：

- 你现在很生气
- 你现在很恐惧
- 你现在很兴奋

---

## 推荐实现思路

如果后续与代码进一步对齐，建议按下面顺序实现：

1. 从 observation 中提取近期情绪相关信号
2. 由快速小模型或规则器输出 `MoodAssessment`
3. 根据 `intensity + horizon` 生成 `delta`
4. 将 `delta` 写入 `transient_state / session_hormones`
5. 再由 `PersonaPolicyNode` 统一生成：
   - sampling
   - tool
   - style
   - memory

这样：

- `mood` 只做情绪判断与偏移
- `PersonaPolicy` 才是统一出口

---

## 当前结论

对于 `worldEdit-agent` 来说，`mood` 最合适的形态不是：

`一段写给主模型的“当前行为状态”长 prompt`

而是：

`少标签 + 强度 + 参数偏移 + 衰减机制`

当前正式采用的标签方案为：

- `flat`
- `pleased`
- `excited`
- `tense`
- `frustrated`
- `fearful`

后续如果要扩展，优先扩展的是：

- 参数映射的精度
- 进入 `transient / session` 的判定规则

而不是优先扩展情绪标签数量。
