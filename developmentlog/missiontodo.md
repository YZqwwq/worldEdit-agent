middle:
文件：aiService.ts
任务：完善富文本流式传输方式改为 fullcontent


hight：
加入短期记忆

加入中长期记忆

hight：
加入人格指标
人格化


midde：
静态文件的加入缓存系统，快速读写


high：
文件：mainAgentDispatchService.ts / mainAgentEntryService.ts / AIagent-design.md
任务：重构主 agent 消息队列消费模型
说明：当前主队列仍是“出队即处理”的内存串行执行器，后续要评估并推进为显式事件状态机模型。

拆分任务：
1. 梳理当前主 agent 队列真实工作流
2. 设计 event 状态流转：`queued -> processing -> handled / failed`
3. 评估是否需要加入 `acknowledged / archived / retryable` 扩展状态
4. 明确“主 agent 取消息”与“消息真正出队”的分离时机
5. 明确用户消息与 task notification 的统一事件状态表达
6. 设计 UI 所需的队列可视状态映射
7. 设计崩溃恢复、重复消费、幂等处理策略
8. 决定是否先做内存状态机，再升级为持久化事件队列

当前判断：
- 现状优点：实现轻、单进程串行简单、适合快速跑通
- 现状缺点：缺少事件级 processing/handled 状态，不利于恢复、重试、审计和精确 UI 展示
- 目标方向：让消息队列只服务主 agent，但每条 event 都有明确生命周期，而不是依赖隐式“取出即消费完成”
