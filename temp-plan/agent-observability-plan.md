# Agent 日志与诊断待办

> 2026-08-24 边界补充：开发审计 Trace 与用户可见的本轮活动流已经分离。Trace 继续记录节点、状态、决策、工具参数与错误，用于开发诊断；用户活动流只接收模型已经形成的自然语言思考、可理解的工具阶段和最终整理阶段，不从 Trace 反向筛选内容。前端只缓存当前或最近完成的一轮活动，不写入聊天历史。

## 当前边界

- 面向用户的 `agent_stage` 与诊断用 `agent_trace` 保持不同职责；开发阶段允许在界面查看完整 Trace，正式发布时再移除或隐藏该面板。
- Trace 已按 `runId / turnId / sequence` 记录，AI 查询必须先选择 Run，再按节点、阶段或等级分页读取。
- 单次查询有条数和字符预算；大型字段保存为 Artifact，必须显式二次读取。
- Trace 保留当前与上一轮转文件，单文件阈值为 8MB；Artifact 总量上限为 64MB。
- Electron 运行时将日志写入 `userData/diagnostics/agent-traces`；源码目录仅作为非 Electron 工具的默认路径。
- 官方联网搜索诊断已经并入统一 Trace，不再维护独立、无限增长的搜索日志。
- API Key、Authorization、Token、密码和 Secret 等字段在写入 Trace 或 Artifact 前脱敏。

## P0：跨平台真实环境验收

- 在 macOS 与 Windows 打包环境分别运行一次普通对话、工具调用和失败 Turn。
- 确认日志实际写入各平台的 `userData/diagnostics/agent-traces`，应用升级和工作目录变化不会改变位置。
- 验证当前日志达到 8MB 后只在下一轮开始前轮转，不会拆开正在执行的 Turn。
- 验证 Artifact 达到容量上限后只淘汰旧诊断内容，不影响 Agent 主流程。
- 验证日志目录不可写、文件损坏或 Artifact 已被淘汰时，Agent 仍能正常完成 Turn，查询端返回可理解错误。

用户影响：日志故障不能阻断聊天、工具执行和最终提交。

## P0：补齐费用与模型调用摘要

在每个 Turn Summary 中确定性汇总：

- 实际 Provider 与模型标识。
- 主推理和 Final Composition 的调用次数。
- 输入 Token、输出 Token、缓存读取与缓存写入 Token。
- Provider 能直接返回时记录实际费用；不能返回时根据带版本的价格表给出估算并明确标记为估算。
- 区分主推理、瞬时感知、工具内模型调用和 Final Composition 的消耗。

不要调用额外 LLM 生成摘要，也不要把费用统计放入人格或 Prompt 层。

用户影响：可以知道一轮对话为什么昂贵，以及费用花在感知、思考、工具还是最终表达上。

## P1：完善 AI 查询入口

- 保留当前命令：`trace:inspect list|run|artifact`。
- 增加按 `turnId`、时间范围、工具名和失败原因筛选。
- `list` 默认只返回最近 10 个 Run；`run` 必须明确提供 `runId`。
- 返回截断状态、下一页 cursor 和尚未读取数量，禁止无上限读取。
- 增加“最近失败 Run”和“当前 Turn 与上一个成功 Turn 对比”的便捷查询，但底层仍复用同一查询服务。
- 如未来让应用内 Agent 自查日志，应将诊断工具放入独立、按需启用的工具集，不能自动注入普通对话 Context。

用户影响：诊断 AI 从摘要开始，只在发现问题时读取相关节点，避免历史日志挤占当前分析上下文。

## P1：Trace 内容完整性

- 为模型调用补充统一的开始、完成、失败记录，关联模型步骤与耗时。
- 将工具调用、Observation、Receipt、ChangeSet 和最终提交通过稳定引用关联起来，不复制完整正文。
- Turn Summary 增加最终提交状态、持久化副作用数量和未解决事项数量。
- 明确区分系统异常、模型空响应、工具协议拒绝、用户中断和恢复执行。
- 检查所有新工具是否进入统一 Trace，禁止再次创建工具私有的无限增长日志。

开发维护影响：出现“数据库已修改但 Agent 认为失败”等问题时，可以沿同一个 Run 还原因果链。

## P2：保留策略复核

- 用真实使用量观察 8MB 双段 Trace 和 64MB Artifact 是否足够。
- 如果失败样本被淘汰得过快，再让失败 Run 延长保留；在数据证明需要前不引入日志数据库。
- 清理 Artifact 后同步清理空目录，并让查询结果明确标记 Artifact 已过期。
- 正式发布前决定是否默认关闭 Trace、仅保留错误 Trace，或提供用户主动开启的诊断模式。

## 验收命令

```bash
npm run typecheck:node
npm run test:agent-trace
npm run test:tool-result
npm run trace:inspect -- list --limit=10
npm run trace:inspect -- run --run <runId> --level=error --limit=20 --chars=8000
```
