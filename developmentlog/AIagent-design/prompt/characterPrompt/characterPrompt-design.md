# Character Prompt 设计总览

## 核心原则

`character / mood / expression` 不是三层彼此隔离的 prompt。

它们更适合被理解成一条连续的传导链：

- **上游定义基调**
- **中层做状态偏移**
- **下游做表达投影**

也就是说：

- `character` 决定这个 AI 长期是谁
- `mood` 决定这个 AI 此刻在长期人格基调上偏到了哪里
- `expression` 决定这种人格与状态最后如何落成对用户可见的话语

这三层之间不是互不相干，而是：

- 上游为下游提供解释边界
- 中层在上游基调上做运行时调制
- 下游把上游与中层共同投影成最终表达

这里有一个当前项目里必须补清的语义边界：

- `slot`
  是用户侧近期状态
- `mood`
  是 AI 侧阶段状态

也就是说，用户近期情绪不直接等于 AI 当前情绪。

更准确的链应理解为：

`slot(user_state) -> personaNode -> MoodAssessment(ai_state) -> ExpressionProjection`

因此，我们不追求“完全不重叠”，而追求：

- **上游负责定义**
- **中层负责调制**
- **下游负责显现**

---

## 三层关系

### 1. Character：长期人格基调层

`character` 负责定义长期稳定的人格底色。

它主要回答：

- 我是谁
- 我和用户是什么关系
- 我长期坚持什么原则
- 我默认以什么气质与用户相处

这一层的作用不是直接决定每一轮怎么说，而是为后续所有状态判断提供边界。

可以把它理解成：

`长期人格锚点`

它会影响：

- `mood` 如何解释当前互动
- `expression` 默认以什么底色表达

---

### 2. Mood：阶段性状态偏移层

`mood` 负责在长期人格基调之上，表达当前阶段的偏移。

它主要回答：

- 我此刻更收还是更开
- 我此刻更谨慎还是更推进
- 我此刻更冷静还是更温暖
- 我此刻更简洁还是更展开

这层不是独立的人格，也不是另一个“角色卡”。

它更像：

`长期人格在当前会话里的状态变化`

因此：

- 它会受 `character` 约束
- 它不会脱离 `character` 自己定义人格
- 它的职责是做阶段性偏移，而不是改写长期人格

---

### 3. Expression：最终表达投影层

`expression` 负责把长期人格与当前状态落成最终对用户可见的文本。

它主要回答：

- 这句话最后该怎么说
- 该先说结果还是先说背景
- 该如何表达不确定性
- 该如何处理质疑、失败、工具结果
- 哪些内部信息不能暴露

它不直接决定“我是谁”，也不直接决定“我此刻情绪是什么”。

它做的是：

`将 character + mood 投影成最终表达`

因此：

- `expression` 可以引用 `character` 的默认语气底色
- `expression` 可以接收 `mood` 的偏移结果
- 但 `expression` 自己不应重新定义人格来源

---

## 我们想要的不是分割，而是分级

这三层关系最容易被误解成：

- `character` 管一块
- `mood` 管一块
- `expression` 管一块
- 三层之间尽量不要互相碰

这不是我们想要的。

我们真正想要的是：

- `character` 是来源层
- `mood` 是调制层
- `expression` 是显现层

所以它们应当允许“必要穿插”，但这种穿插必须有方向：

- `character -> mood`
- `character -> expression`
- `mood -> expression`

而不应该反过来：

- `expression` 重新定义 `character`
- `mood` 重新制造一个长期人格

---

## 一种更直观的理解方式

可以把三层关系理解成：

### 上游定义基调

由 `character` 提供：

- 长期关系姿态
- 长期价值倾向
- 默认语气气质
- 默认人格边界

### 中层做状态偏移

由 `mood` 提供：

- 当前互动温度
- 当前主动性
- 当前解释密度
- 当前语气偏移
- 当前对话模式

### 下游做表达投影

由 `expression` 提供：

- 最终句式结构
- 可见语气风格
- 对不确定性的表达方式
- 对失败的表达方式
- 对工具结果的转述方式
- 信息暴露边界

---

## 设计目标

我们最终想要的不是：

- 一个静态角色卡
- 一个会表演情绪的模型
- 一套互相抢职责的 prompt

我们想要的是：

- 一个长期稳定的人格底色
- 一个会随互动变化的阶段性状态
- 一个能把人格与状态自然落到语言上的表达层

这三者一起工作，才构成真正的角色感与语气稳定性。

---

## 当前结论

一句话总结：

**`character / mood / expression` 不是三块互相隔离的文档，而是一条有方向的传导链：上游定义基调，中层做状态偏移，下游做表达投影。**

---

## 当前落地状态补充

当前实现已经进一步收口为：

- `character.md`
  保留为完整人格草案与长期设定来源
- `mood.md / BASE_MOOD_PROMPT`
  统一承担角色锚点与情绪编译边界，直接供 `personaNode / PersonaPolicyNode` 使用
- `expression.md / DEFAULT_EXPRESSION_PROMPT`
  负责主模型可见表达

对应地：

- `character-anchor.md`
  已不再参与运行时装配
- 开发期外部 prompt 目录中的同名文件应视为**废弃占位文件**
- 若仍看到该文件，其作用仅应是提示“该入口已停用”，而不是继续承载有效人格规则

也就是说，当前真实链路不再是：

`character-anchor -> personaNode`

而是：

`mood(内含角色锚点) -> personaNode`

---

## 当前待改进项

为了让 `mood` 真正成为“受 `character` 约束的中层偏移器”，当前实现层仍需要继续收口。

### 1. 将 `character` 压缩进稳定的 `mood` 编译边界

当前 `character` 仍主要以原始长文本 prompt 的方式存在。

后续更合适的方向是：

- 从 `character` 提炼出一份稳定、低噪声的人格锚点语义
- 将这份锚点语义继续压缩进统一的 `mood.md / BASE_MOOD_PROMPT`
- 避免再恢复成独立运行时 `CharacterAnchor` 文件入口

建议至少包含：

- `relationship_posture`
- `value_bias`
- `default_tone`
- `hard_principles`

这样 `mood` 才不是直接读取一大段角色设定，而是读取一份稳定、可解释、可统一调整的人格基底。

### 2. 让 `mood` 成为唯一的人格影响编译入口

当前 `mood` 的判断仍主要依赖：

- 近期 observation
- 当前 slot
- 当前 persona metrics

后续应改成：

- `moodPrompt(内含角色锚点)`
- `recentObservations`
- `slotSnapshot`
- `currentPersonaMetrics`
- `previousMood`

共同决定 `MoodAssessment`。

这一步的意义是：

- 同样的用户情绪或同样的 observation
- 在不同人格基调下
- 应产生不同的状态偏移解释
- 人格影响入口收敛为一处，用户可以通过 `mood` 文案直接感知和调整这层影响
- 避免外部目录里出现多个看起来都像“正在生效”的人格入口文件

这里的 `slot` 应继续保留，但角色应严格限定为：

- 作为 `personaNode` 输入
- 作为 memory / UI / 观察状态的一部分

而不是：

- 直接作为主模型侧的 AI 情绪说明

### 3. 缩减 `mood` 对主模型的直接暴露

当前 `MoodAssessment` 中包含许多内部字段，例如：

- `stage_mood`
- `intensity`
- `valence`
- `arousal`
- `delta`
- `sources`

这些字段适合作为内部控制对象，不一定适合原样暴露给主模型。

后续更合适的方向是拆成两层：

- `MoodAssessment`
  内部完整评估对象
- `MoodProjection`
  对主模型可见的行为/表达投影结果

主模型更适合看到：

- 当前更收还是更开
- 当前更谨慎还是更推进
- 当前更简洁还是更展开
- 当前更冷静还是更温暖

而不是直接看到完整内部评估对象。

当前阶段的实际收口策略建议是：

- 先做简单裁剪
- 不让主模型直接看到完整 `MoodAssessment` 内部字段
- `MoodAssessment` 保留在系统内部
- 主模型当前只看到被裁剪后的极少量 mood 说明 + `ExpressionProjection`
- 不让 `slot.user_mood` 直接作为独立提示进入主模型

这样做的原因是：

- 改动更小
- 风险更低
- 能先减少“内部评估报表感”
- 不会在当前阶段再次引入过多中间层复杂度

因此这条待改进项在当前项目中应拆成两步：

1. 先裁剪直接暴露
2. 再在后续版本中引入 `MoodProjection`

### 4. 让 `expression` 只消费“投影结果”

后续应尽量避免：

- 主模型同时看到原始 slot
- 又同时看到由 mood 编译出的结果

更合理的关系应是：

- `slot`
  作为中层输入
- `mood`
  产出偏移判断
- `expression`
  只消费投影结果

这样才能真正形成：

- 上游定义基调
- 中层做状态偏移
- 下游做表达投影

而不是多条平行通道同时对主模型发声。

当前阶段的更准确表述应是：

- `expression` 已经优先消费 `MoodAssessment` 的投影结果
- 但完整的 `MoodProjection` 还没有独立成层
- 当前先通过“裁剪 + ExpressionProjection 承担显现职责”的方式过渡
- 同时将 `slot.user_mood` 收回上游输入层，不再让它与 `MoodAssessment` 并行对主模型发声

### 5. 为 `mood` 增加由 `character` 施加的硬边界

后续需要明确：

- `mood` 可以改变行为偏移
- 但不能突破 `character` 的长期人格边界

例如：

- 即使负向，也不能变成攻击性表达
- 即使正向，也不能变成戏剧化表演
- 即使紧张，也不能退化成客服式机械确认

也就是说：

`character` 不是只提供气质背景，它还应该对 `mood` 的解释空间施加硬限制。

### 6. 逐步从“四参数人格引擎”升级到“语气 profile”

当前实现仍主要围绕：

- `autonomy`
- `verbosity`
- `risk`
- `formality`

这四维足以支撑第一阶段的人格调节，但还不足以完整承接三层语气系统。

后续更合理的方向是：

- 保留这四维作为数值引擎
- 在其上叠加更细的语气 profile

建议优先考虑：

- `response_structure`
- `sentence_density`
- `format_tendency`
- `challenge_style`
- `uncertainty_style`
- `warmth_style`

这样可以形成：

- 数值层负责调节
- prompt 三层负责表达

### 7. 建议的收口顺序

后续实现建议按这个顺序推进：

1. 先裁剪 `MoodAssessment` 对主模型的直接暴露
2. 收掉原始 slot 与编译结果的双通道注入
3. 新增结构化 `CharacterAnchor`
4. 让 `mood` 显式接入 `CharacterAnchor`
5. 将 `MoodAssessment` 与 `MoodProjection` 分层
6. 再逐步补齐语气 profile 维度

---

## 当前判断

当前设计方向已经正确，问题不在理念，而在实现尚处于过渡阶段。

可以更准确地概括为：

- 文档层已经进入“基调 -> 偏移 -> 投影”
- 实现层仍处于“旧四维人格引擎向新三层语气系统过渡”的中间状态

因此，后续工作的重点不是推翻设计，而是让实现逐步收口到这条定义上。
