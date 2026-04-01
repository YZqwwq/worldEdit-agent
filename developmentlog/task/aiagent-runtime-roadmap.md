# AI Agent Runtime 下一阶段任务表

> 状态说明（2026-04-01）
>
> 本文件记录 AI runtime 的下一阶段收敛任务、执行顺序与当前进展。
> 它描述的是“接下来怎么做”，不是当前已落地架构真相；当前真相仍以 `developmentlog/AIagent-design.md` 为准。

## 目标

当前 AI runtime 的下一阶段目标不是继续扩 executor 数量，而是把现有控制平面收敛成更稳定的内核：

- 状态推进有单一真源
- 生命周期判断更稳定
- task / subagent 协议更强约束
- 扩展点统一注册

一句话：

`先把 runtime 内核打稳，再扩更多 agent 能力`

---

## 优先级总表

### P0

- [ ] 收敛 `lifecycle / notification / turn` 的状态推进规则，形成单一 orchestration 真源
- [ ] 将任务意图识别改为“规则优先，模型兜底”
- [ ] 让 active task context 可见 `processing notification`

### P1

- [ ] 收紧 subagent protocol 的 `details` 结构，减少 executor-specific 松散字段
- [ ] 明确 `completed / needs_input / failed / cancelled` 的 typed payload 约束

### P2

- [ ] 建立工具与子 agent 注册器
- [ ] 将 capability / delegate tool / dispatcher handler / timeout policy 收敛到统一 registry

---

## 当前执行顺序

1. `单一 orchestration 规则`
2. `规则优先，模型兜底`
3. `active task context 可见 processing notification`
4. `收紧 protocol details`
5. `工具与子 agent 注册器`

当前正在执行：

- `单一 orchestration 规则`

---

## 任务拆解

### 1. 单一 orchestration 规则

目标：

- 把 `event / turn / notification` 的状态推进、owner、提交点、恢复策略显式化
- 减少 service 内部直接写状态字面量
- 让后续恢复、调试、扩 executor 时都能对照同一份规则

拆分任务：

- [x] 在设计文档中正式定义恢复链的“三层模型”
- [x] 新增共享 orchestration 规则文件，集中描述：
  - flow owner
  - 开始处理点
  - 真正提交点
  - 允许的状态迁移
  - 恢复策略
- [x] 让 `MainAgentEventLogService` 使用共享 event transition helper
- [x] 让 `MainAgentTurnService` 使用共享 turn transition helper
- [x] 让 `TaskNotificationService` 使用共享 notification transition helper
- [x] 将主入口切换为基于显式 orchestration 表执行
- [ ] 评估是否继续把 effect 生成与 owner 提交规则进一步收拢成统一 reducer / orchestration service

当前判断：

- 这一步先做“规则真源化”，不急着一次性大重构
- 先把状态推进从散点字面量收敛到共享 helper，再继续推进更大层次的 orchestration 收口

### 2. 规则优先，模型兜底

目标：

- 用轻量 LLM 统一承担生命周期分类
- 分类失败时保守回退为普通聊天
- 避免在分类层同时维护字符规则与模型规则

拆分任务：

- [ ] 明确高频规则分类：
- [x] 将生命周期分类收敛为轻量 LLM 单一路径
- [x] 删除分类层的硬字符 rule table，避免双轨理解成本
- [x] 将 fallback 收敛为保守 `none`
- [x] 保留执行层状态约束，不让分类层承担状态机职责

### 3. active task context 可见 processing notification

目标：

- 不只看 `pending notification`
- 也能看到“已被主 agent 接手、但尚未 consumed”的 `processing notification`

拆分任务：

- [x] 将 `getActiveTaskContext` 的 notification 视角从 `pending` 扩大到 `pending | processing`
- [x] 增加 `mainAgentEventId` / active notification 信息
- [x] 调整工具输出文案
- [ ] 评估是否需要把相同语义继续同步到调试面板

### 4. 收紧 protocol details

目标：

- 让 subagent 回包从“半结构化”变成“主控可稳定消费的结构化协议”

拆分任务：

- [x] 为 `completed.details` 明确完成类 details 结构
- [x] 为 `needs_input.details` 明确 `phase / missingFields / suggestedPrompt`
- [x] 为 `failed.details` 明确错误类型与是否可重试
- [x] 在 dispatcher / protocol parser / inspection mapper 中使用归一化后的 typed details
- [x] 继续减少主 agent 依赖自由文本 `message / summary` 猜含义
- [x] 将 typed details 下沉到 child-agent handler output schema
- [ ] 评估是否还有其他 executor / child-agent 输出未遵守统一协议

### 5. 工具与子 agent 注册器

目标：

- 让工具、能力、delegate、dispatcher 绑定关系统一管理

拆分任务：

- [ ] 建立 executor registry
- [x] 建立主 agent 工具注册清单
- [x] 建立 child-agent 工具注册清单
- [x] 建立 executor -> delegate tool 的统一注册清单
- [ ] 收拢 capability 规则
- [ ] 收拢 delegate tool 与 dispatcher handler 映射
- [ ] 收拢 timeout / retry / protocol parser 等 executor 元数据

---

## 本轮进展

### 2026-04-01

- [x] 将恢复链简洁模型写入 `AIagent-design.md`
- [x] 开始把 `event / turn / notification` 的状态推进抽成共享 orchestration 规则
- [x] 建立 event 级显式 orchestration 表，并让主入口按 `prepare / consume / apply / commit` 执行
- [x] 将 lifecycle 分类调整为“轻量 LLM 主分类 + 保守 fallback”
- [x] 将 active task context 升级为 latest active notification 视图
- [x] 将 subagent protocol details 收紧为 outcome-aware typed details
- [x] 让 child-agent 原生产出 typed details，并让主 agent 通知消费优先读取 details
- [x] 建立主 agent / child-agent / subagent 的第一阶段 registry 骨架
