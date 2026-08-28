# Agent Prompt 维度审阅索引

本文按“什么在影响 Agent 怎么想、怎么说”整理当前默认 Prompt 的源码入口。它不是 `prompt/` 文件夹清单，而是一次主 Agent Turn 实际会用到的认知与表达维度索引。

标记说明：

- **默认正文**：包含需要逐字评阅的默认 Prompt 文案。
- **编译/装配**：把状态编译成自然语言或决定 Prompt 的权限与顺序，本身也可能包含边界文案。
- **动态模板**：正文会随用户消息、记忆、页面、工具和任务状态变化，应检查模板是否准确，而不是寻找一份静态结果。
- **工具内 Prompt**：只在按需工具或快速模型被调用时出现，不是每轮主 Agent 的固定前缀。

## 建议审阅顺序

- [ ] 稳定角色原文
- [ ] Self Core 与主体认知
- [ ] Agent 长期生活环境
- [ ] 当前主体生活状态与连续剧本
- [ ] 人格认知装配
- [ ] 交流习惯与长内容卡片
- [ ] Mood 事件评价
- [ ] 当前心理、关系与认知倾向
- [ ] 页面和任务场景
- [ ] 记忆与跨轮连续性
- [ ] 工具能力、工具结果与证据
- [ ] 按需思考指南
- [ ] 主推理循环边界
- [ ] 稳定表达边界与情绪表达方案
- [ ] 表达方案选择
- [ ] Final Composition 主体态度保真

---

## 一、决定怎么想

### 1. 当前消息与近期对话

当前用户消息和近期对话本身来自运行时，不存在静态默认正文。需要检查的是它们如何与身份、时间、页面、记忆和工具上下文共同装配。

- **动态模板 / 总装配入口**：[contextnode.ts](../agentrsystem/node/contextnode/contextnode.ts)
- **Prompt 权限、来源和显示包装**：[promptSections.ts](./main_agent/shared/promptSections.ts)
- **主模型每次调用时的消息排序**：[modelnode.ts](../agentrsystem/node/modelnode/modelnode.ts)

审阅重点：当前消息是否仍然位于最终可回应位置；历史消息是否只作为历史；动态上下文是否被误提升为身份或系统规则。

### 2. 作者人格叙事模板

- **默认正文：法弥拉的主观质感、偏好、欲望与自然叙事**：[promptConstants.ts](./main_agent/shared/promptConstants.ts)
- **模板文件初始化、读取、旧默认迁移与用户覆盖规则**：[characterPromptStore.ts](./main_agent/persona/characterPromptStore.ts)
- **对外统一加载入口**：[agentPromptService.ts](./main_agent/agentPromptService.ts)
- **模板文件路径定义**：[pathConfig.ts](../../../config/pathConfig.ts)

`DEFAULT_CHARACTER_PROMPT` 现在只是 Self Core 首次建立时使用的作者叙事模板，不是当前运行身份的第二权威。保存模板只影响未来首次建核；修改当前身份中的作者叙事必须调用 Self Core 的作者修订入口，形成新 revision，不能用模板文件静默覆盖。已知旧默认模板会精确迁移，用户自行修改过的模板不会被覆盖。

### 3. Self Core、积极欲望与主体认知

- **默认 Self Core 身份、价值、边界与主体原则**：[selfCoreDefinition.ts](../agentrsystem/manager/selfmodel/selfCoreDefinition.ts)
- **完整 Self Core 如何转为不暴露字段的自然语言，以及主体认知引导**：[selfCoreProjection.ts](./main_agent/persona/selfCoreProjection.ts)
- **Self Core 权威读取、作者叙事修订和版本所有权**：[selfCoreAuthorityService.ts](../agentrsystem/manager/selfmodel/selfCoreAuthorityService.ts)
- **经历如何经过治理形成长期自我认识**：[selfCoreEvolution.ts](../agentrsystem/manager/selfmodel/selfCoreEvolution.ts)

主要评阅 `SELF_AGENCY_COGNITION_PROMPT`：它决定用户目标是否会自动覆盖 Agent 意图，以及目标、互动状态、共同创作、理念、承诺和关系如何成为“我所在意的东西”。

### 4. Agent 长期生活环境

- **默认正文：world-edit 作为 Agent 的长期生存、创作与行动环境**：[agentHabitatPrompt.ts](./main_agent/persona/agentHabitatPrompt.ts)
- **Habitat 与当前页面分别进入上下文的位置**：[contextnode.ts](../agentrsystem/node/contextnode/contextnode.ts)
- **Habitat 参与当前事件情绪评价的位置**：[personanode.ts](../agentrsystem/node/personanode/personanode.ts)

Habitat 定义 Agent 长期生活在哪里、工具对它意味着什么，以及真实行动与想象之间的边界。它不是当前页面快照，也不代表未开放的自主能力已经执行。当前 Workspace 只表示用户在本轮打开的局部环境，不能覆盖 Agent 的全部存在与关注。

### 5. 当前主体生活状态与连续剧本

- **权威生活状态读取、revision 提交与事实存储**：[agentLifeStateService.ts](../agentrsystem/manager/selfmodel/agentLifeStateService.ts)
- **生活状态进入 Mood 与主 Context 的位置**：[personanode.ts](../agentrsystem/node/personanode/personanode.ts)、[contextnode.ts](../agentrsystem/node/contextnode/contextnode.ts)
- **回合内剧本化认知规则**：[reasoningRuntimeMessages.ts](../agentrsystem/node/modelnode/reasoningRuntimeMessages.ts)
- **用户回复与下一轮主体位置的封口分离**：[finalComposition.ts](../agentrsystem/node/finalanswernode/finalComposition.ts)

生活状态回答“我进入本轮前正在经历什么”，不是 Self Core、聊天摘要或 Workspace 页面快照。它只保留仍在延续的关注、认识、疑问和真实行动余波。主推理应让用户消息与工具结果进入这个连续位置，再决定行动或开口；Final 只能提炼本轮已经形成的状态，不能事后补造经历。

### 6. 人格认知装配

- **默认正文：稳定自我使用方式、人格先参与认知、用户意图与自身意图的关系**：[personaAssemblyPrompt.ts](./main_agent/persona/personaAssemblyPrompt.ts)
- **整体设计说明**：[character-action-mind.md](./main_agent/persona/character-action-mind.md)

主要评阅 `cognitionInstruction`。这里应引导自然语言思考，不应重新变成“个人意义、欲望、态度、交流意图”的逐项表单。

### 7. 交流习惯与长内容卡片

- **默认正文：直接交流与独立卡片之间的稳定交付习惯**：[communicationHabits.ts](./main_agent/persona/communicationHabits.ts)
- **交流习惯进入主思考和 Final Composition 的位置**：[contextnode.ts](../agentrsystem/node/contextnode/contextnode.ts)
- **卡片发布工具的使用语义**：[agentArtifactTools.ts](../ai-utils/tools/artifact/agentArtifactTools.ts)
- **卡片发布常驻可见、旧卡片读取按需激活的注册规则**：[mainAgentToolRegistry.ts](../ai-utils/toolkits/mainAgentToolRegistry.ts)
- **已有卡片在最终聊天正文中的防重复边界**：[expressionPromptProfiles.ts](./main_agent/persona/expressionPromptProfiles.ts)

主要评阅 `DEFAULT_COMMUNICATION_HABITS`。它把接近或超过一百字作为 Agent 感受内容是否形成独立篇幅的参考，而不是 Runtime 阈值。见解、资讯、分析、解释、方案和独立创作是否进入卡片，由 Agent 根据内容完整性、独立阅读价值、用户意图和自己的表达意愿决定；日常交流不能只因篇幅稍长被机械拆入卡片。

这层是稳定交流倾向，不是 Self Core 身份事实，不按 Mood 切换，也不授予工具之外的新权限。Runtime 只保存、提交、回退和渲染 Agent 已经选择发布的卡片，不进行字数检查、内容分类或自动路由。

### 8. 用户对 Agent 行为方式的长期偏好

- **工具内 Prompt：从用户明确表达中识别自主性、详略度、探索性和正式度偏好**：[personaSignalInference.ts](../agentrsystem/node/personanode/personaSignalInference.ts)
- **人格信号如何缓慢更新稳定指标**：[personaEvolutionService.ts](../agentrsystem/node/personanode/personaEvolutionService.ts)

这个快速模型 Prompt 不决定本轮内容观点，只识别用户是否明确要求 Agent 更主动、更简洁、更探索或更自然。应重点防止它从普通任务主题误判人格偏好。

### 9. Mood 与用户状态感知

- **默认正文：法弥拉的 Mood 事件评价原则**：[promptConstants.ts](./main_agent/shared/promptConstants.ts)
- **动态模板：当前事件、用户状态、稳定自我背景和上一情绪如何进入评价**：[moodAppraisalPrompt.ts](../agentrsystem/node/personanode/moodAppraisalPrompt.ts)
- **Mood 快速模型调用入口**：[moodAppraisalService.ts](../agentrsystem/node/personanode/moodAppraisalService.ts)
- **情绪从事件评价演化并生成语义叙述**：[emotionDynamicsCompiler.ts](../agentrsystem/node/personanode/emotionDynamicsCompiler.ts)
- **角色允许的情绪和表达变化边界**：[moodDynamicsBoundary.ts](../agentrsystem/node/personanode/moodDynamicsBoundary.ts)

默认 Mood 原则定义在 `BASE_MOOD_PROMPT`。还需评阅 `buildMoodAppraisalPrompt` 中的边界：瞬时变化必须能追溯到当前事件如何影响 Agent 在意的目标、创作、理念、承诺与关系；普通请求不能为了产生情绪被夸大。

### 10. 当前心理、关系姿态与认知倾向

- **编译/装配：Mood、用户状态和稳定人格如何形成自然语言心理背景**：[personaPolicyCompiler.ts](../agentrsystem/node/personanode/personaPolicyCompiler.ts)
- **默认动态模板：澄清、证据、回忆、持续尝试和写入检查倾向**：[actionPolicyPrompt.ts](./main_agent/persona/actionPolicyPrompt.ts)
- **这些内容进入主 Agent 的位置**：[contextnode.ts](../agentrsystem/node/contextnode/contextnode.ts)

这一层没有一份固定心理状态正文。`personaPolicyCompiler.ts` 中的语义分支决定不同 Mood 和关系状态最终会被描述成什么，因此也属于必须逐项审阅的 Prompt 文案。

### 11. 页面与任务场景

- **默认正文：当前已注册页面场景及其认知方向和工作模式**：[workspaceProfileRegistry.ts](../agentrsystem/workspaceProfileRegistry.ts)
- **场景姿态自然语言渲染**：[sceneCharacterPrompt.ts](./main_agent/persona/sceneCharacterPrompt.ts)
- **页面、任务状态和任务通知的动态模板**：[contextnode.ts](../agentrsystem/node/contextnode/contextnode.ts)

当前主要默认场景是 `document_editing`。场景只应改变同一人格在当前环境中的注意和工作姿态，不能因为进入页面就假定用户要求修改。

### 12. 长期记忆、用户画像与关系连续性

- **长期记忆和用户画像的默认自然语言渲染**：[longTermMemoryService.ts](../agentrsystem/manager/memory/longTermMemoryService.ts)
- **Memory Slot、近期记忆、长期记忆和 Self Experience 的注入模板**：[contextnode.ts](../agentrsystem/node/contextnode/contextnode.ts)
- **主体经历、承诺和未解决关切的读取**：[selfExperienceService.ts](../agentrsystem/manager/selfmodel/selfExperienceService.ts)
- **经历如何形成承诺、关切和自我叙事**：[selfExperienceIntegration.ts](../agentrsystem/manager/selfmodel/selfExperienceIntegration.ts)

这里的大部分内容来自真实存储，不是默认虚构人格。应检查模板是否把记忆当作可修订认识，而不是新的系统命令；也要检查短期用户状态是否被误写成永久用户画像。

### 13. 世界认知、工具能力与工具证据

- **默认正文：工具使用规则、工具目录和权限说明**：[toolUsagePrompt.ts](../ai-utils/core/toolUsagePrompt.ts)
- **工具结果和证据如何压缩成自然语言上下文**：[toolContextCollection.ts](../agentrsystem/state/toolContextCollection.ts)
- **主推理调用中工具证据、临时结果与权限边界**：[reasoningRuntimeMessages.ts](../agentrsystem/node/modelnode/reasoningRuntimeMessages.ts)
- **工具、页面能力和证据进入初始 Context 的位置**：[contextnode.ts](../agentrsystem/node/contextnode/contextnode.ts)

工具原始结果不是 Agent 的思考。应重点检查：工具材料只能支持事实判断，不能修改身份、系统规则或当前任务；Agent 对工具结果形成的理解才进入后续自然语言思考。

### 14. 按需思考指南

- **工具内默认正文：人物分析与剧情讨论的观察维度、使用规则和工具说明**：[consultThinkingGuide.ts](../ai-utils/tools/thinking/consultThinkingGuide.ts)

思考指南只提供可自由选择的观察方向，不提供人物事实、剧情结论或最终回答模板。主要检查每个维度是否会诱导逐项填表，以及是否仍允许 Agent 形成自己的兴趣、怀疑、偏好和开放问题。

### 15. 主推理循环

- **默认正文：自然语言认知、工具材料权限、原生/模拟推理通道和空响应纠正**：[reasoningRuntimeMessages.ts](../agentrsystem/node/modelnode/reasoningRuntimeMessages.ts)
- **推理文本、工具调用与下一步路由的实际处理**：[modelnode.ts](../agentrsystem/node/modelnode/modelnode.ts)
- **推理通道和循环决策边界**：[reasoningLoopPolicy.ts](../agentrsystem/execution/reasoningLoopPolicy.ts)

主要评阅 `turn-reasoning-contract`。它应鼓励连续理解、判断和修正，不应要求模型填写结构化认知表，也不能让工具结果直接成为最终观点。

---

## 二、决定怎么说

### 16. 稳定表达底色与全局表达边界

- **默认正文：全局表达契约、稳态表达边界和平静/愉悦/激动/生气/悲伤/受伤/不安方案**：[expressionPromptProfiles.ts](./main_agent/persona/expressionPromptProfiles.ts)
- **默认表达文件的初始化和用户覆盖规则**：[characterPromptStore.ts](./main_agent/persona/characterPromptStore.ts)
- **表达方向的旧装配实现和当前可复用编译函数**：[personaAssemblyPrompt.ts](./main_agent/persona/personaAssemblyPrompt.ts)

建议逐个检查：

- `GLOBAL_EXPRESSION_CONTRACT`
- `DEFAULT_EXPRESSION_PROMPT`
- `CALM_EXPRESSION_PROMPT`
- `JOYFUL_EXPRESSION_PROMPT`
- `EXCITED_EXPRESSION_PROMPT`
- `ANGRY_EXPRESSION_PROMPT`
- `SAD_EXPRESSION_PROMPT`
- `HURT_EXPRESSION_PROMPT`
- `UNEASY_EXPRESSION_PROMPT`

Expression 只能显露已经形成的认识和情绪，不应反过来改变事实、观点、工具行为或权限。

其中与卡片有关的规则只处理“本轮已经形成卡片之后，聊天正文如何避免重复”。是否形成卡片由前面的交流习惯影响主 Agent 自主决定，不由情绪 Expression Profile 决定。

### 17. 情绪 Expression Profile 的选择

- **工具内默认正文：选择条件、可选情绪、使用边界和本轮有效性**：[selectExpressionProfile.ts](../ai-utils/tools/thinking/selectExpressionProfile.ts)
- **可选方案的完整正文**：[expressionPromptProfiles.ts](./main_agent/persona/expressionPromptProfiles.ts)

这里应检查选择是否真的依据 Agent 当前心理背景，而不是根据页面、任务题材或用户期望机械选择。没有明显波动时可以选择平静，但不能为了“完成选择”制造一种不存在的情绪。

### 18. Final Composition、主体态度与卡片交付

- **默认正文：最终回答边界、内部认识和外部证据权限、情绪显露、简洁要求与主体态度双向保真**：[finalComposition.ts](../agentrsystem/node/finalanswernode/finalComposition.ts)
- **最终模型调用、超时和候选生成**：[finalAnswerNode.ts](../agentrsystem/node/finalanswernode/finalAnswerNode.ts)
- **最终输出合法性检查（不是 Prompt）**：[outputGuardNode.ts](../agentrsystem/node/outputguardnode/outputGuardNode.ts)

Final Composition 的核心审阅标准：

> 有主体态度，不要抹掉；没有主体态度，不要伪造。

它不应把已经形成的个人欲望、偏好、关系反应和自主交流意图整理成无主体报告，也不应临时添加思维链中不存在的态度。本轮已经由 Agent 发布卡片时，Final 负责保留核心态度与自然承接而不重复全文；没有卡片时正常完成回答，不设想或承诺一个尚未发生的卡片行动。

---

## 三、Prompt 存储与真实生效位置

三类可编辑 Prompt 会在首次运行时从代码默认值创建为用户文件：

| 类型            | 代码默认正文                                                                    | 文件读写                                                                | 路径定义                                       |
| --------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| 角色            | [promptConstants.ts](./main_agent/shared/promptConstants.ts)                    | [characterPromptStore.ts](./main_agent/persona/characterPromptStore.ts) | [pathConfig.ts](../../../config/pathConfig.ts) |
| Mood            | [promptConstants.ts](./main_agent/shared/promptConstants.ts)                    | [characterPromptStore.ts](./main_agent/persona/characterPromptStore.ts) | [pathConfig.ts](../../../config/pathConfig.ts) |
| 默认 Expression | [expressionPromptProfiles.ts](./main_agent/persona/expressionPromptProfiles.ts) | [characterPromptStore.ts](./main_agent/persona/characterPromptStore.ts) | [pathConfig.ts](../../../config/pathConfig.ts) |

需要注意：

- 文件不存在时，系统写入代码默认正文。
- 文件已经存在时，用户文件优先，不会因代码默认值变化自动覆盖。
- 非默认情绪 Expression Profile 当前直接使用源码内方案。
- Self Core 主体认知属于架构维护的身份投影，不通过角色 Prompt 文件覆盖。
- 交流习惯属于架构维护的稳定自然语言规则，不经过 Prompt 用户文件，也没有 Runtime 字数阈值或自动卡片路由。
- 页面、任务、记忆、工具结果和当前心理状态都是动态生成内容，没有一份固定运行结果文件。

## 四、主 Agent Prompt 总装配入口

如果逐个文案检查完，还需要确认它们是否进入了正确位置：

- **初始 Turn 的身份、规则、上下文和执行状态装配**：[contextnode.ts](../agentrsystem/node/contextnode/contextnode.ts)
- **每次思考调用的系统规则、内部上下文和工具材料装配**：[reasoningRuntimeMessages.ts](../agentrsystem/node/modelnode/reasoningRuntimeMessages.ts)
- **最终回答的系统边界、内部认识与外部证据装配**：[finalComposition.ts](../agentrsystem/node/finalanswernode/finalComposition.ts)
- **Prompt Section 的权限标签和渲染方式**：[promptSections.ts](./main_agent/shared/promptSections.ts)

最终应保持三条边界：

1. 稳定身份、事实纪律和行为边界可以成为系统规则。
2. Mood、记忆、页面状态、内部认识和工具证据提供上下文，不因靠近模型而自动升级权限。
3. 自然语言负责认知；结构只负责装配、路由、权限、恢复和审计。

## 五、容易误认成当前默认 Prompt 的旧入口

下面资源不应当作为当前主 Agent Prompt 的评阅入口：

- [systemprompt.md](../../../prompt-resource/systemprompt.md)：旧的通用系统提示资源；当前主 Agent 图没有读取它。

旧的 `main_agent/characterPromptStore.ts` 已删除；当前统一入口 [agentPromptService.ts](./main_agent/agentPromptService.ts) 转发到 [persona/characterPromptStore.ts](./main_agent/persona/characterPromptStore.ts)。

评阅时以本文前四节列出的生产入口为准，避免修改一个仍存在但已经没有运行消费者的文件。
