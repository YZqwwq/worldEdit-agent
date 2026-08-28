# Agent 当前待办总览

更新时间：2026-08-28。

本目录只保留尚未完成或仍需真实验收的工作。完成记录和旧方案由 Git 历史保存。

## 当前判断

Agent 的运行图、工具循环、Turn Workspace、统一提交、Reasoning 与 Final Composition 已具备可用基座，不需要整体重构。最新静态审计发现多工具恢复位置、撤回范围和状态重复仍需先收口；完成这些最小修正后，再集中推进真实模型下的能力表现、应用控制和 Context 成本。

## 推进顺序

1. **状态流正确性收口**：先修复多工具调用恢复可能跳过剩余工具的问题，并明确撤回究竟覆盖消息还是完整 Turn；随后收敛重复 Lifecycle、模型步数和无消费者状态。方案见 `agent-state-flow-plan.md`。
2. **事实约束的主体剧本实测**：首版读写、Context、Reasoning、Final 与原子提交闭环已经完成；Reasoning 已从任务分析进一步改为基于真实事件的第一人称主体剧本。下一步用真实人物讨论、工具查询、失败、中断和恢复场景验证效果，并只修正实际暴露的问题。方案见 `HDSI-scripted-cognition.md`。
3. **人格与认知实测**：同时验证 Agent 是否真的会深入思考、形成自己的态度、自然表达，并正确使用思考指南、情绪表达方案和长期习惯。
4. **世界认知实测**：验证人物、国家、地区、势力的按需搜索、阅读、对象引用传递和认知保存。
5. **文档编辑反馈闭环**：统一全文与局部编辑的 Diff 卡片，并让定位失败对用户可见。
6. **Context 与费用可观测性**：先统计每轮 Context 去向、Token、缓存和费用，再决定压缩与限制。
7. **长期人格演化**：建立 Post-Turn Observer，让重要经历、关系和承诺以候选方式进入治理，而不是由主推理直接写入。
8. **可开关的回合间自主生活推进**：在主体生活状态和回合内剧本稳定后，让 Agent 按真实时间、动机与未完成事项自主阅读、探索和构想；默认关闭，具体方案见 `HDSI-scripted-cognition.md`。
9. **运行可靠性余项**：按真实故障价值推进中断目标绑定、提交后 Outbox 和生产级多 Effect 验收。

## 专题文件

- `thinking.md`：人格、Mood、Reasoning、表达和长期习惯。
- `HDSI-scripted-cognition.md`：Agent Habitat、主体生活状态、回合内剧本化认知与后续自主生活推进。
- `cognitive_world_domcment.md`：世界文档发现、世界认知与人物印象边界。
- `document-editor-plan.md`：文档版本、编辑工具和 Diff 交互。
- `agent-core-plan.md`：运行闭环、工具治理、Context 与长期状态治理。
- `agent-state-flow-plan.md`：Graph 状态、Turn Workspace、恢复日志和跨 Turn 持久化的职责收敛。
- `agent-observability-plan.md`：Trace、模型调用、Token 和费用。

## 维护规则

- 一个具体待办只写在一个专题文件中。
- P0 表示当前直接推进；P1 表示 P0 稳定后推进；P2 必须由真实数据或场景触发。
- 完成并通过测试后删除待办，不在计划中积累实施日志。
- 不为了架构整齐增加没有独立用户价值的节点、字段或模型调用。
