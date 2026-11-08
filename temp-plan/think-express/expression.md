# 简短表达、卡牌与分段对话

更新时间：2026-09-12。状态：方案，尚未实现多气泡协议。

## 目标

聊天承担重点和交流，卡牌承担需要独立阅读的正文；同轮消息可以分段，跨轮按用户反馈继续。不是缩短所有知识内容，也不是把长文拆成大量气泡。

## 已有基础与缺口

| 环节 | 当前实现 | 距离目标的缺口 |
| --- | --- | --- |
| 表达生成 | finalComposition.ts 要求单个 reply 字符串 | 无独立消息单元和明确的内容分配策略 |
| 候选选择 | 已要求先交付主线，再选延伸 | 缺少是否倾倒全部候选的验收 |
| 卡牌发布 | publish_agent_artifact 属于 expression；registry 标记 always，每轮上限 2 | 有能力不等于按场景稳定使用 |
| 卡牌存储 | Markdown 正文先写 draft，Turn 提交时变为 committed | 工具返回不等于用户已收到卡牌 |
| 卡牌引用 | committer 自动添加 artifact_ref，前端读取展示 | 正文重复、失败假引用需测试 |
| 最终输出 | finalAnswerNode 构造一个 AIMessage，committer 保存单个 AI 消息记录 | 不是同轮多个独立消息单元 |
| 文本恢复 | aiClientService 将多个 text part 用换行合并 | 即使有多个 text part，刷新后仍合为一段 |

## 内容分配

- 简单结论、当前态度或一个问题：直接聊天，不为少量内容创建卡牌。
- 详细分析、方案、创作或对照材料：通过现有 publish_agent_artifact 写完整正文，聊天只给重点及必要承接，引用由运行时提供。
- 用户要求全文直接发在聊天中或精确输出：遵从本轮要求，不为了分段或卡牌改写要求。
- 失败或材料不足：说明真实状态，交付已完成部分；不假称文档已整理，不默认重复发布。

不按固定字数机械截断或自动转卡牌。正文长度可作为诊断指标，但独立阅读价值和用户意图才是内容分配依据。

## 消息分段方案

建议第一阶段采用“一次 Turn、一次原子提交、多个可独立呈现的有序消息单元”。保持既有 Turn 的提交和撤回所有权，不必立刻增加多个独立 Message 数据库记录。

拟议契约：表达输出有序文本段；解析器校验类型、非空、顺序与资源上限。contentJson 保存段落边界，content 保留检索和历史回放所需的文本投影。卡牌引用只关联实际提交的 artifact，不由模型编造 ID。

这不是前端 split 换行：生成、FinalContentCandidate、Output Guard、提交、序列化、IPC 和 UI 都要保留同一边界。历史恢复后仍应为相同顺序的独立气泡。

第一阶段可在完整结果提交后呈现多个气泡，不能称为逐条独立送达。第二阶段再评估社交式逐条出现：需要未展示队列、幂等段 ID、新消息到来时停止旧队列，以及区分已提交/已展示/未展示内容。不能把未展示段落当作用户已读的共同历史。

需要用户反馈才能决定的方向，在当前轮结束，不预写下一轮回复。不要通过后台连续发送全部候选模拟多轮对话。

## 代码入口

- [finalComposition.ts](../../src/main/services/aiservice/agentrsystem/node/finalanswernode/finalComposition.ts)
- [finalCompositionEnvelope.ts](../../src/main/services/aiservice/agentrsystem/node/finalanswernode/finalCompositionEnvelope.ts)
- [finalAnswerNode.ts](../../src/main/services/aiservice/agentrsystem/node/finalanswernode/finalAnswerNode.ts)
- [agentArtifactTools.ts](../../src/main/services/aiservice/ai-utils/tools/artifact/agentArtifactTools.ts)
- [agentArtifactService.ts](../../src/main/services/aiservice/artifacts/agentArtifactService.ts)
- [mainAgentTurnCommitter.ts](../../src/main/services/aiservice/runtime/orchestration/mainAgentTurnCommitter.ts)
- [mainAgentMessageContent.ts](../../src/share/cache/AItype/states/mainAgentMessageContent.ts)
- [aiClientService.ts](../../src/renderer/src/services/aiClientService.ts)

## 实施时确认

消息单元是扩展现有 text part 还是增加明确 segment 类型，需要与渲染组件及撤回服务一起定稿。仅修改 reply 为数组不能完成目标。逐条出现的间隔与默认气泡数量属于后续体验参数，当前不设硬性数值。
