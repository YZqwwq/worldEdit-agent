# Agent 日志、Context 与费用待办

## 当前基线

- 用户可见活动流与开发诊断 Trace 已分离。
- Trace 按 Run、Turn 和 sequence 记录，正文大字段通过 Artifact 按需读取。
- 查询具有条数和字符预算，日志和 Artifact 具有轮转与容量上限。
- Electron 写入 `userData/diagnostics/agent-traces`，敏感字段写入前脱敏。

## P0：模型调用与费用摘要

每个 Turn 确定性汇总：

- Provider、模型和实际 Reasoning 协议。
- 主推理、Mood Appraisal、工具内部模型调用和 Final Composition 的调用次数与耗时。
- 输入、输出、Reasoning、缓存读取和缓存写入 Token。
- Provider 提供的实际费用；没有费用接口时使用带版本价格表估算，并明确标记为估算。
- Context 各来源的字符数和估算 Token，与 Provider 实际输入 Token 对照。

不调用额外模型生成统计，也不把费用信息放入人格 Prompt。

用户影响：能够判断一轮对话为什么慢、为什么贵，以及成本主要来自哪里。

## P0：打包环境验收

- 在 macOS 与 Windows 打包应用各运行普通对话、工具调用和失败 Turn。
- 验证日志目录、8MB 轮转、64MB Artifact 清理以及不可写/损坏时的降级。
- 日志故障不能阻断聊天、工具执行和最终提交。

## P1：AI 查询入口

- 保留 `trace:inspect list|run|artifact`，增加按 Turn、时间、工具和失败原因筛选。
- 默认只返回少量 Run；读取详情必须指定 Run，并返回 cursor、截断状态和剩余数量。
- 增加“最近失败”和“当前 Turn 对比上一个成功 Turn”入口。
- 未来应用内 Agent 自查日志时，使用独立按需工具集，不进入普通对话 Context。

## P1：因果链完整性

- 模型调用统一记录开始、完成、失败、模型步骤和耗时。
- 用稳定引用连接 Reasoning、工具调用、Observation、Receipt、ChangeSet 和最终提交，不复制正文。
- Turn Summary 记录最终提交状态、副作用数量和未解决事项。
- 区分系统异常、空响应、协议拒绝、用户中断和恢复执行。
- 所有新工具必须进入统一 Trace，禁止私有无限增长日志。

## P2：保留策略

- 根据真实使用量复核当前日志和 Artifact 上限。
- 只有失败样本确实过早淘汰时，才延长失败 Run 保留或考虑日志数据库。
- 正式发布前决定默认关闭 Trace、仅保留错误 Trace或提供诊断模式。
