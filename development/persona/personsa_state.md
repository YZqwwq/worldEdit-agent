# 人格激素调节依据（实现说明）

## 当前方案概览

当前人格激素调节采用 **规则引擎 + 轻量模型识别（带回退）** 的混合机制：

1. 先用内置规则识别用户信号（确定性、可控）
2. 再用 quick model 做语义分类补充（提高泛化）
3. 若模型超时/异常/输出非法，自动回退到规则结果
4. 将最终信号映射到四个激素指标并更新 persona state

> 结论：不是纯小模型驱动，也不是纯关键词驱动，而是“可控优先 + 语义增强”的混合架构。

---

## 我们“基于什么”在调节激素

### 1) 输入证据来源

- **显式语言信号**：用户在文本中表达“详细/简短/保守/大胆/正式/随意”等偏好
- **语义意图识别**：轻量模型在候选信号集合内做分类，识别规则漏检的语义表达

### 2) 信号空间（固定内置）

信号集合为代码内置常量，不从外部动态配置读取，防止人格漂移：

- verbosity: `user_requests_more_detail` / `user_requests_brief_reply`
- autonomy: `user_grants_autonomy` / `user_requests_confirmation`
- risk: `user_encourages_risk` / `user_prefers_safety`
- formality: `user_prefers_formal_tone` / `user_prefers_casual_tone`

### 3) 指标更新方式

每个信号带有固定增量 impact（例如 `+0.08 verbosity`、`-0.06 risk`），更新规则为：

- 按信号 impact 更新对应指标
- 每类每轮最多采纳一个信号
- 所有指标 clamp 到 `[0,1]`

四个激素指标：

- `autonomy_level`
- `verbosity_index`
- `risk_tolerance`
- `formality_score`

### 4) 从激素到行为策略

激素不会直接“写文案”，而是先生成 PersonaPolicy，再作用到系统行为：

- **采样参数**：temperature / topP / maxTokens
- **工具策略**：敏感工具是否先确认、风险工具是否允许
- **风格策略**：简洁/平衡/详细，正式/中性/随意
- **记忆策略**：压缩阈值与短期窗口长度

---

## 设计原则

1. **可解释性**：规则和 impact 全部可审计
2. **稳定性**：模型失败时有规则兜底，不影响主链路
3. **一致性**：信号集合固定，不允许运行时任意自定义
4. **渐进性**：在不破坏现有架构前提下引入语义识别能力

---

## 后续可演进方向（预留）

- 将模型分类结果上报到 graphlog，增强可视化可追溯性
- 对模型分类增加置信度阈值和拒识策略
- 引入“信号冲突仲裁”策略（如同时出现激进与保守表达）
