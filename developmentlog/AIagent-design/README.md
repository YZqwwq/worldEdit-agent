# AIagent-design 文档目录

## 文档定位

这个目录用于集中放置 AI agent 相关设计文档。

这里的文档不是同一种类型，而是分成三类：

- 系统级架构真相
- AI agent 专题设计
- 任务与子 agent 专题

所以阅读时不要把整个目录当成“一份大文档”，而应该按问题进入对应子目录。

## 推荐阅读顺序

如果你第一次进入这个目录，建议按下面顺序阅读：

1. [AIagent-system-design/overall-system-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/AIagent-system-design/overall-system-design.md)
2. [AIagent-system-design/main-agent-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/AIagent-system-design/main-agent-design.md)
3. [AIagent-system-design/message-queue-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/AIagent-system-design/message-queue-design.md)
4. [task/task-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/task/task-design.md)
5. 再按需要进入 `persona / prompt / tool`

这样读的原因是：

- 先理解系统级主链
- 再理解主 agent 和消息队列的边界
- 再理解子 agent execution queue
- 最后再进入人格、prompt、工具这些专题设计

## 目录结构

### `AIagent-system-design/`

这是当前 AI agent 系统的主架构文档目录，描述“现在系统已经如何工作”。

包含三份文档：

- [overall-system-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/AIagent-system-design/overall-system-design.md)
  解释整体设计思想，重点是“主 agent 控制 + 消息队列调度 + 子 agent 后台执行”
- [main-agent-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/AIagent-system-design/main-agent-design.md)
  解释主 agent、主图、turn、lifecycle、prompt 与控制面的边界
- [message-queue-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/AIagent-system-design/message-queue-design.md)
  解释主 event queue、owner/commit、notification 回流、恢复链，以及与子 agent execution queue 的衔接

什么时候优先读这个目录：

- 想理解当前系统到底怎么跑
- 想判断某个能力属于主图还是属于 runtime 控制面
- 想理解主 agent 与消息队列的关系

### `task/`

这个目录当前主要承载子 agent 任务系统的专题设计。

- [task-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/task/task-design.md)
  解释子 agent execution queue 如何入队、出队、等待补参、回到主队列

什么时候优先读这个目录：

- 想理解 `Task / Execution / Notification` 这条链
- 想修改 `subAgentExecutionQueueService`、`subAgentDispatcherService`、continuation 相关逻辑

### `persona/`

- [personsa_state.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/persona/personsa_state.md)

这个目录解释人格状态与行为策略设计。

什么时候读：

- 想理解 persona state
- 想修改行为风格、主动性或策略层

### `prompt/characterPrompt/`

这里是 prompt 分层设计文档，当前分为：

- [character.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/prompt/characterPrompt/character.md)
- [mood.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/prompt/characterPrompt/mood.md)
- [expression.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/prompt/characterPrompt/expression.md)

三份文档分别回答：

- `character`
  主 agent 是谁
- `mood`
  主 agent 当前以什么行为状态与用户协作
- `expression`
  主 agent 最终怎么说、哪些不能说

什么时候读：

- 想改 prompt 架构
- 想区分身份层、状态层、表达层

### `tool/`

- [howtousetool.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/tool/howtousetool.md)
- [unified-tool-registry-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/tool/unified-tool-registry-design.md)

这个目录解释工具系统设计，包括：

- [howtousetool.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/tool/howtousetool.md)
  说明当前工具系统怎么接入、怎么使用、怎么维护，包括工具能力层级、拓展工具发现、历史常用拓展工具和工具结果上下文重装
- [unified-tool-registry-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/tool/unified-tool-registry-design.md)
  说明当前主 agent / 子 agent 注册真源、动态可见性、拓展工具按需激活和 runner 边界

什么时候读：

- 想新增工具、调整工具规范或接入路径
- 想理解主 agent / 子 agent 的工具来源与装配边界

## 按问题找文档

如果你关心的是不同问题，可以直接这样进入：

- 想知道“为什么不是一张大图”：
  先读 [overall-system-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/AIagent-system-design/overall-system-design.md)
- 想知道“主 agent 到底负责什么”：
  先读 [main-agent-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/AIagent-system-design/main-agent-design.md)
- 想知道“主队列和 notification 怎么工作”：
  先读 [message-queue-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/AIagent-system-design/message-queue-design.md)
- 想知道“子 agent execution 怎么排队和续跑”：
  先读 [task-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/task/task-design.md)
- 想知道“人格和 prompt 为什么这么分层”：
  进入 `persona/` 和 `prompt/characterPrompt/`
- 想知道“工具系统怎么接入和维护”：
  先读 [howtousetool.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/tool/howtousetool.md)
- 想知道“统一注册器当前长什么样”：
  先读 [unified-tool-registry-design.md](/Users/admin/Documents/trae_projects/worldEdit-agent/developmentlog/AIagent-design/tool/unified-tool-registry-design.md)

## 当前维护原则

这个目录下的文档建议按下面原则维护：

- `AIagent-system-design/`
  持续维护为当前实现真相
- `task/`
  维护为任务/子 agent 专题设计真相
- `persona / prompt / tool`
  维护为专题设计说明

如果文档与代码冲突：

1. 先以代码为当前运行真相
2. 再回头修正文档
