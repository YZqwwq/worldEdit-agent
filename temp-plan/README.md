# Agent 后续计划

本目录只记录尚未完成的工作。已完成事项、实施日志和旧方案由 Git 历史保存，不再进入 AI 的前置上下文。

## 阅读顺序

1. `agent-core-plan.md`：运行闭环、工具、Context 与长期记忆。
2. `document-editor-plan.md`：文档版本、撤销和 TipTap 局部编辑。
3. `agent-document-reading-plan.md`：自由文档边界、Agent 文档发现与认知缓存。
4. `mood-system.md`：当前情绪架构及剩余一致性问题。
5. `agent-observability-plan.md`：Agent Trace、AI 按需诊断、费用统计与日志保留。

只阅读与当前任务有关的专题。发生跨模块修改时，再补读 `agent-core-plan.md`。

## 当前优先级

1. 在下一台开发设备上用真实模型验证移除 Scene/WorldFocus 后的自主工具选择、对象引用传递和首轮延迟。
2. 用真实人物、国家、地区和势力请求验证“主 Agent 按需搜索/阅读—Tool Evidence 保留对象引用—必要时显式保存认知”。
3. 完成 Turn 恢复、EffectReceipt 和提交后动作的真实进程验收。
4. 治理 Quick Access、工具目录和 Context 预算。
5. 将长期记忆升级为可追溯的重要事件。
6. 完成 Agent Trace 的跨平台验收，并补齐模型调用与费用汇总。

## 维护规则

- 一个待办只存在于一个专题文件。
- 只写用户影响、实现边界和验收条件，不复制字段清单或当前源码。
- 完成并通过测试后直接删除待办，不保留完成日志。
- 新问题先归入现有专题；只有形成独立长期能力时才新增文件。
