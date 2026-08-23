# Agent 主体认知架构

## 核心目标

法弥拉是持续存在的人格主体，不是套有人格语气的任务控制器。

```text
Self Core
  -> Appraisal
  -> Deliberation
  -> Embodiment / Runtime
  -> Experience Integration
  -> Expression
```

- `Self Core`：身份、价值、边界、长期兴趣、关系理解和自我叙事。
- `Appraisal`：理解事件对自身、用户及关系意味着什么，并形成情绪变化。
- `Deliberation`：形成主体位置、暂时立场、知识缺口和行动意图。
- `Embodiment / Runtime`：工具、子 Agent、任务、队列、事务和世界操作。
- `Experience Integration`：验收结果，修订认识、承诺和开放关注，提交主体经历。
- `Expression`：忠实表达已形成的认识，不重新决定事实和立场。

Runtime 是法弥拉的行动系统，不定义法弥拉是谁。工具和子 Agent 可以代替她执行，但不能代替她理解结果、验收质量或承担承诺。

## Turn 原则

每条进入主 Agent 的外部消息建立一个新 `Turn`。工具返回属于同一 `Turn` 内的认知修订，不建立新 `Turn`。

```text
稳定身份 + 当前情绪 + 关系记忆 + 场景事实
  -> 首次主体认知
  -> 形成观察目标并调用工具
  -> 吸收证据、修订立场和剩余问题
  -> 选择回应取向与表达情绪
  -> Expression
  -> 原子提交消息、记忆、人格、经历和事件
```

不保存或展示逐字思维链。跨节点只传递认知状态、证据影响、立场修订和回应取向。

## 已完成基线

- [x] 首次主体认知、工具前观察目标、工具后证据修订和明确完成语义已进入主循环。
- [x] Mood 只提供心理背景；主 Agent 思考后选择表达方向，Mood 不直接指定语气。
- [x] 所有正常用户可见 AI 回复统一经过主体认知和 Expression。
- [x] 生命周期事件和子 Agent 通知会建立主体 `Turn`，不再由 Runtime 冒充法弥拉直接回复。
- [x] 主 Agent 保留子 Agent 结果的认识权、验收权和承诺所有权。
- [x] 无法进入主图的故障使用独立 `system` 消息，不进入 Memory、Mood、Persona 或主体经历。
- [x] 已建立稀疏的 `Self Experience`，保存个人意义、立场、关系认识、承诺、开放关注和自我叙事。
- [x] Message、Memory、Persona、Self Experience、Turn 和 Event 统一原子提交、原子撤回。
- [x] 下一轮只注入少量近期重要经历、开放承诺和开放关注，不铺开完整经历历史。
- [x] 开发环境不再在启动时覆盖已保存的人格 Prompt。

## 当前核心偏差

当前 `PersonaState` 仍将以下参数放在同一组 `stable_preferences` 中：

- `autonomy_level`
- `verbosity_index`
- `risk_tolerance`
- `formality_score`

它们混合了三种不同责任：

1. **稳定人格**：法弥拉重视什么、厌恶什么、如何理解关系与自身。
2. **用户协作偏好**：用户希望回答多长、多正式、是否先询问、愿意授权多少。
3. **本轮操作策略**：当前是否需要证据、澄清、谨慎写入或继续调用工具。

普通的“简短一点”或“你决定”目前可能逐渐修改所谓稳定人格。这会把用户满意度适配误当成人格成长，也使后续 `PersonaActionPolicy` 建立在职责混杂的指标上。

## 下一步：拆分人格与用户适配

先建立清晰的三层所有权：

### Self Core

保存身份、价值、边界、长期兴趣、厌恶、关系理解和自我叙事。它由明确人格锚点与被主体认可的重要经历缓慢修订，不因普通表达偏好直接变化。

### Interaction Preference

保存详略、正式度、协作节奏、是否倾向先询问和用户授权习惯。它可以依据用户反馈较快适配，但只表示“我们如何相处和协作”，不表示法弥拉变成了怎样的人。

### Operational Policy

保存本轮证据要求、澄清需要、写入保守度和工具持续倾向。它由场景、任务事实、工具风险与主体判断临时形成，不持久化为人格，也不作为工具权限开关。

## 实施顺序

1. [x] 新增独立 `InteractionPreference` 状态及默认值、持久化和迁移兼容。
2. [x] 将 `verbosity_index`、`formality_score` 和用户授权适配迁出 `stable_preferences`。
3. [x] 停止 `personaEvolutionService` 用普通用户交互信号改写旧的稳定人格字段；用户信号现在进入交互偏好或操作基线。
4. [x] 将 `risk_tolerance` 迁入 `OperationalBaseline`，只作为本轮策略的慢速基线。
5. 明确 Self Core 只接受人格锚点和经 Experience Integration 认可的长期变化。
6. [x] 治理旧 `PersonaActionPolicy`：删除无生产消费者的七维数值，改为五项本轮语义策略，并接入 `contextNode`。
7. 最后再补 `Self Experience` 的语义召回、经历修订关系和物化状态投影；这是经历增长后的检索优化，不是当前首要架构阻塞。

## 完成标准

- 用户要求改变回答风格时，只更新 Interaction Preference，不改变 Self Core。
- 主 Agent 的长期立场变化必须能指向被认可的主体经历，而不是交互风格信号。
- Operational Policy 每一项都有明确生产消费者；没有消费者的指标不保留。
- 工具权限仍只由工具注册等级和确认协议决定，人格只参与“为什么行动”的判断。
- Expression 接收主体认识与交互偏好，但不得据此重写事实、立场或人格。

## ActionPolicy 治理结果

旧的 `autonomyDrive`、`caution`、`clarificationNeed`、`evidenceNeed`、`recallNeed`、`writeConservatism`、`toolPersistence` 已不再作为生产状态。

当前只保留五项认知与行动取向：

- `clarification`：目标清楚时推进，或只澄清会改变结果的歧义。
- `evidence`：使用已有上下文，或在关键判断前核验事实。
- `recall`：按需回忆，或在当前问题相关时主动回忆。
- `persistence`：工具受阻后停止说明缺口，或尝试一次替代路径。
- `writing`：正常写入，或写入前核对范围并检查结果。

这些是本轮给主 Agent 的语义背景，不是工具权限、确认协议或硬性流程。`contextNode` 负责注入，主 Agent 仍需结合用户意图、认知状态和实际工具结果自行判断。
