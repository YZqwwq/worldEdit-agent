# Agent 当前待办总览

更新时间：2026-08-28。

思考与表达专题于 2026-09-12 更新，当前目标与实施顺序见 [think-express/README.md](think-express/README.md)。该专题不再以文学化主体剧本或拟真口吻作为目标；其他专题日期与结论未在本次复核。

本目录只保留尚未完成或仍需真实验收的工作。完成记录和旧方案由 Git 历史保存。

## 当前判断

Agent 的运行图、工具循环、Turn Workspace、统一提交、Reasoning 与 Final Composition 已具备可用基座，不需要整体重构。最新静态审计发现多工具恢复位置、撤回范围和状态重复仍需先收口；完成这些最小修正后，再集中推进真实模型下的能力表现、应用控制和 Context 成本。

## 推进顺序

1. **状态流正确性收口**：先修复多工具调用恢复可能跳过剩余工具的问题，并明确撤回究竟覆盖消息还是完整 Turn；随后收敛重复 Lifecycle、模型步数和无消费者状态。方案见 `agent-state-flow-plan.md`。
2. **多维思考与证据交接**：在完成主线的基础上形成有依据的候选观点与疑问，并验证交接完整性。方案见 `think-express/thinking.md`。
3. **简短表达与独立交付**：先完成短正文与真实卡牌，再贯通有序消息气泡和历史恢复。方案见 `think-express/expression.md` 与 `think-express/implementation.md`。
4. **世界认知实测**：验证人物、国家、地区、势力的按需搜索、阅读、对象引用传递和认知保存。
5. **文档编辑反馈闭环**：统一全文与局部编辑的 Diff 卡片，并让定位失败对用户可见。
6. **Context 与费用可观测性**：先统计每轮 Context 去向、Token、缓存和费用，再决定压缩与限制。
7. **长期人格演化**：建立 Post-Turn Observer，让重要经历、关系和承诺以候选方式进入治理，而不是由主推理直接写入。
8. **可开关的回合间自主生活推进**：在主体生活状态和回合内剧本稳定后，让 Agent 按真实时间、动机与未完成事项自主阅读、探索和构想；默认关闭，具体方案见 `HDSI-scripted-cognition.md`。
9. **运行可靠性余项**：按真实故障价值推进中断目标绑定、提交后 Outbox 和生产级多 Effect 验收。

## 专题文件

- `think-express/README.md`：当前思考与表达目标、专题文件导航。
- `think-express/archive/thinking-2026-08-28.md`：旧人格、Mood、Reasoning 和长期习惯待办，历史参考。
- `HDSI-scripted-cognition.md`：历史主体剧本方案，不作为当前思考与表达方向。
- `cognitive_world_domcment.md`：世界文档发现、世界认知与人物印象边界。
- `document-editor-plan.md`：文档版本、编辑工具和 Diff 交互。
- `agent-core-plan.md`：运行闭环、工具治理、Context 与长期状态治理。
- `agent-state-flow-plan.md`：Graph 状态、Turn Workspace、恢复日志和跨 Turn 持久化的职责收敛。
- `agent-observability-plan.md`：Trace、模型调用、Token 和费用。
- `retraction-capability.md`：消息撤回、Turn 中断、工具结果回退和主体版本补偿边界。

## 维护规则

- 一个具体待办只写在一个专题文件中。
- P0 表示当前直接推进；P1 表示 P0 稳定后推进；P2 必须由真实数据或场景触发。
- 完成并通过测试后删除待办，不在计划中积累实施日志。
- 不为了架构整齐增加没有独立用户价值的节点、字段或模型调用。
