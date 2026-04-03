# 人格系统设计说明（隐性人格驱动架构）

## 背景与目标

本项目的人格系统不再仅仅是“提示词里的角色设定文本”，而是升级为一个**隐性控制层**。  
它不直接把数值指标暴露给模型，而是通过策略映射影响 Agent 在每一轮对话中的真实行为：

1. 影响模型采样参数（temperature / topP / maxTokens）
2. 影响工具调用决策（是否要求确认、是否允许高风险工具）
3. 影响回复风格（简短/详细、正式/自然、主动/确认）
4. 影响记忆策略（压缩阈值、短期窗口大小）

核心目标是让人格像“激素系统”一样成为底层调节器，而不是显式台词。

---

## 核心思想

### 1. 隐性人格（Implicit Persona）

我们不把 `autonomy / verbosity / risk / formality` 作为数字直接告诉模型。  
相反，数值只用于系统内部计算策略，模型侧仅看到经过转换后的行为约束与风格叙事。

这能避免：

- 人格参数被用户提示词直接操控
- 模型“背诵人格指标”而非自然表现
- 参数与行为脱节

### 2. 先调节，再反应

人格演化发生在每轮推理前：

`收到用户输入 -> 人格节点解释信号 -> 更新人格状态 -> 生成策略 -> 注入上下文 -> LLM 回复`

这对应人类行为中的“先受刺激，后行为输出”。

### 3. 策略统一出口

人格数值不会直接散落在各节点里做硬编码判断，而是统一收敛为 `PersonaPolicy`：  
每轮由 `personaNode` 生成，再由 `llmCall / toolNode / memory` 消费。

---

## 架构分层

### A. 人格状态层（State Layer）

- 持久化实体：`PersonaState`
- 指标：`autonomy_level / verbosity_index / risk_tolerance / formality_score`
- 近期信号：`recent_interaction_buffer`
- 语义叙事：`current_behavioral_narrative`

该层回答“我现在是什么状态”。

### B. 人格策略层（Policy Layer）

新增统一策略对象 `PersonaPolicy`，包含：

- `sampling`：temperature / topP / maxTokens
- `tool`：confirmBeforeSensitiveTools / allowRiskyTools / exploratoryBias
- `style`：detailLevel / tone / instruction
- `memory`：compressThreshold / shortTermLimit
- `signals`：本轮识别到的信号标签

该层回答“本轮应该怎么行动”。

### C. 执行层（Execution Layer）

由 Agent 图节点消费策略：

- `contextNode`：注入风格约束（不暴露原始数值）
- `llmCall`：按策略覆盖采样参数
- `toolNode`：按策略裁决敏感/高风险工具
- `memoryManager`：按策略调整压缩与短期窗口

该层回答“系统如何具体执行”。

---

## 当前图执行流程

当前图主链路为：

`START -> personaNode -> contextNode -> llmCall -> (toolNode 循环 | memoryNode) -> END`

其中人格系统关键步骤：

1. `personaNode` 从本轮用户输入识别信号
2. 更新 PersonaState（指标演化）
3. 生成 PersonaPolicy
4. 将策略写入图状态供后续节点消费

---

## 用户信号到人格演化（示例）

目前采用轻量规则映射（可后续改为可配置文件）：

- “详细/展开/步骤” -> 提升 `verbosity`
- “简短/一句话/别废话” -> 降低 `verbosity`
- “你决定/直接做” -> 提升 `autonomy`
- “先确认/谨慎” -> 降低 `autonomy`
- “大胆/尝试” -> 提升 `risk`
- “稳妥/别冒险” -> 降低 `risk`
- “正式一点” -> 提升 `formality`
- “随意点/口语化” -> 降低 `formality`

每轮按类别最多采纳一个信号，避免过激震荡。

---

## “激素值”如何影响实际行为

### 1. 对模型采样的影响

- 风险偏好高 -> 更高 temperature/topP（探索更强）
- 冗长度高 -> 更高 maxTokens（允许更完整表达）
- 正式度高 -> 适度抑制随机性（表达更克制）

### 2. 对工具决策的影响

- 自主性低或风险低 -> 敏感工具需确认
- 风险低 -> 阻断高风险工具（给出更安全替代）
- 风险高 + 自主高 -> 提高探索型调用倾向

### 3. 对语气和输出结构的影响

- 详细度映射到 brief/balanced/detailed
- 正式度映射到 casual/neutral/formal
- 自主性映射到“主动推进 vs 关键点确认”

这些被合成为 `style.instruction` 注入上下文。

### 4. 对记忆系统的影响

- 高 verbosity：更早触发压缩（防止上下文膨胀）
- 高 verbosity：短期窗口适度扩大（保留更多近期细节）

---

## 理论基础（工程化解释）

本设计并不追求生物学拟真，而是借鉴三个认知思路：

1. **双层控制**：状态层（人格指标）与策略层（行为控制）分离
2. **闭环调节**：输入信号 -> 状态变化 -> 策略变化 -> 行为变化
3. **隐式表达优先**：让人格通过行为体现，而不是通过自我宣告体现

这使人格系统从“设定文本”升级为“控制系统”。

---

## 设计取舍

1. **不做多会话人格分片**：维持长期陪伴的单会话人格连续性
2. **不做硬上限截断**：未来优先做“循环感知并上报给模型”的机制
3. **保留可视日志**：日志用于观察人格策略如何作用于节点决策

---

## 后续演进方向

1. 将信号规则从代码迁移到可配置 JSON（便于在线调参）
2. 增加“策略解释事件”到 graphlog（可视化本轮策略）
3. 引入平滑/衰减机制，避免人格被单次输入强烈拉动
4. 引入“显式确认令牌”，让用户可临时覆盖工具策略

---

## 一句话总结

人格系统在本项目中的定位是：  
**一个隐性、持续、可调节的行为控制内核，驱动 Agent 在采样、工具、语气、记忆四个维度形成一致人格。**
