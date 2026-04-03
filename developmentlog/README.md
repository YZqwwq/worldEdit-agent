# Developmentlog 文档目录

> 状态说明（2026-04-03）
>
> 本文件用于说明 `developmentlog/` 下当前实际存在的文档、它们各自的用途，以及推荐阅读顺序。

## 阅读顺序

如果第一次接手这个仓库，建议按下面顺序阅读：

1. [AIagent-design/README.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/README.md)
2. [AIagent-design/README.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/README.md)
3. [AIagent-design/AIagent-system-design/overall-system-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/AIagent-system-design/overall-system-design.md)
4. [AIagent-design/AIagent-system-design/main-agent-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/AIagent-system-design/main-agent-design.md)
5. [AIagent-design/AIagent-system-design/message-queue-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/AIagent-system-design/message-queue-design.md)
6. [AIagent-design/task/task-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/task/task-design.md)
7. [missiontodo.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/missiontodo.md)

原因：

- `AIagent-design/README.md` 解释 AI agent 文档目录怎么读
- `AIagent-design/AIagent-system-design/` 解释当前系统级真相
- `AIagent-design/task/task-design.md` 解释子 agent execution queue 的专题设计
- `missiontodo.md` 记录项目级待办，但不等于当前实现

## 文档分层

### 1. 当前系统设计真相

这类文档解释“现在系统已经如何工作”：

- [AIagent-design/README.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/README.md)
- [AIagent-design/AIagent-system-design/overall-system-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/AIagent-system-design/overall-system-design.md)
- [AIagent-design/AIagent-system-design/main-agent-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/AIagent-system-design/main-agent-design.md)
- [AIagent-design/AIagent-system-design/message-queue-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/AIagent-system-design/message-queue-design.md)
- [AIagent-design/task/task-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/task/task-design.md)

### 2. 待办与路线

这类文档解释“接下来还想做什么”：

- [missiontodo.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/missiontodo.md)

### 3. 专题设计说明

这类文档解释某个子系统或专题的设计背景：

- [AIlogSystem/AI_Log_System_Manual.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIlogSystem/AI_Log_System_Manual.md)
- [AIagent-design/persona/personsa_state.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/persona/personsa_state.md)
- [AIagent-design/tool/howtousetool.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/tool/howtousetool.md)
- [AIagent-design/prompt/characterPrompt/character.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/prompt/characterPrompt/character.md)
- [AIagent-design/prompt/characterPrompt/mood.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/prompt/characterPrompt/mood.md)
- [AIagent-design/prompt/characterPrompt/expression.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/prompt/characterPrompt/expression.md)
- [worldDesign/character-ai-edit-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/worldDesign/character-ai-edit-design.md)
- [worldDesign/data-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/worldDesign/data-design.md)
- [font-design/file-stash.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/font-design/file-stash.md)

### 4. 迁移入口

这个文件现在只保留迁移说明：

- [AIagent-design/AIagent-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/AIagent-design.md)

它的作用是告诉读者：原来的单体系统设计文档已经拆分到 `AIagent-design/AIagent-system-design/`。

## 目录说明

### `developmentlog/AIagent-design/README.md`

作用：

- `AIagent-design/` 目录导航
- 说明系统设计、任务设计、persona、prompt、tool 这些文档应该按什么顺序读

### `developmentlog/AIagent-design/AIagent-system-design/`

作用：

- AI agent 系统的解释性架构目录
- 拆成“整体设计思想 / 主 agent 设计 / 消息队列设计”三份当前真相文档

什么时候读：

- 想理解当前系统主链怎么跑
- 想区分主图、控制面、队列、子 agent 的边界

### `developmentlog/AIagent-design/task/task-design.md`

作用：

- 子 agent execution queue 专题设计
- 说明 execution 如何入队、出队、等待补参、回流到主队列

什么时候读：

- 想理解子任务执行链
- 想修改 `subAgentExecutionQueueService`、`subAgentDispatcherService`、continuation 设计

### `developmentlog/missiontodo.md`

作用：

- 项目级 backlog
- 记录系统后续还想继续推进的方向

什么时候读：

- 想知道未来还准备做什么
- 想做任务排期

注意：

- 它不是当前实现真相

### `developmentlog/AIlogSystem/AI_Log_System_Manual.md`

作用：

- AI 日志系统设计说明
- 解释 graphlog、节点日志、流式日志和前端消费方式

### `developmentlog/AIagent-design/persona/` 与 `developmentlog/AIagent-design/prompt/`

作用：

- 解释 persona、角色身份、mood、expression 等 prompt 分层设计

### `developmentlog/AIagent-design/tool/howtousetool.md`

作用：

- 工具体系与工具使用规则设计

### `developmentlog/worldDesign/`

作用：

- 世界观、人物编辑、数据结构等领域设计说明

### `developmentlog/font-design/file-stash.md`

作用：

- 运行时文件与静态资源目录设计说明

## AI 阅读规则

如果你是 AI，在处理这个仓库时请遵守下面规则：

1. 先读 `AIagent-design/README.md`
2. 再读三份系统设计正文
3. 如果任务涉及子 agent execution queue，再读 `AIagent-design/task/task-design.md`
4. 如果要判断“后面还想做什么”，再读 `missiontodo.md`
5. 阅读文档后，必须回到代码核对关键链路
6. 如果文档和代码不一致：
   - 先以代码为运行真相
   - 再修正文档

## 一句话总结

`AIagent-design/README.md` 解释 AI agent 文档目录怎么读  
`AIagent-design/AIagent-system-design/` 解释当前系统怎么跑  
`AIagent-design/task/task-design.md` 解释子 agent 队列专题  
`missiontodo.md` 解释后续还想做什么  
`专题文档` 解释某个子系统为什么这么设计
