# AI 日志设计约束

这份文档只定义一件事：

**什么样的日志，才允许进入 Agent 思维链主时间线。**

它不是实现说明，不讨论 LangGraph 事件，不讨论 provider 原始回调。
它只约束我们自己的节点日志应该长什么样。

---

## 1. 总原则

主时间线只展示：

- 节点在做什么
- 节点做出了什么判断
- 节点产出了什么结果
- 节点为什么进入下一步

主时间线不展示：

- 原始 provider 事件
- 原始 prompt 全文
- 原始大 JSON
- 无语义的调试字段
- 节点内部过细的中间态

一句话：

**主时间线展示结论，不展示原料。**

---

## 2. 统一日志结构

所有进入主时间线的日志，必须统一为 `AgentTraceRecord`。

核心字段：

- `node`
  只能是我们自己的节点名，例如 `personaNode`、`contextNode`、`llmCall`
- `phase`
  只能表示节点语义阶段，不表示 provider 事件名
- `title`
  给 UI 直接展示的短标题
- `summary`
  给用户一眼看懂的摘要
- `data`
  详细结构化数据，只在展开时看

一句话：

**UI 看 title 和 summary，data 只做下钻。**

---

## 3. 允许的阶段

主时间线只允许这 6 类阶段：

- `enter`
- `state`
- `decision`
- `artifact`
- `exit`
- `error`

含义：

- `enter`
  节点开始执行
- `state`
  节点输入状态快照
- `decision`
  节点内部做出的判断
- `artifact`
  节点产出的可观察结果
- `exit`
  节点结束
- `error`
  节点失败

不允许再定义：

- `thought`
- `tool_start`
- `tool_end`
- `node_enter`
- `node_exit`

这些旧格式都不再作为主时间线语义。

---

## 4. 每个节点最多展示几条

每个节点在一次运行里，主时间线最多只应出现 `2~4` 条日志。

推荐上限：

- `enter`：0 或 1 条
- `state`：0 或 1 条
- `decision`：最多 1 条
- `artifact`：最多 1 条
- `exit`：0 或 1 条
- `error`：异常时 1 条

如果一个节点需要展示更多内容：

- 说明摘要设计不够收束
- 或者说明细节应该进入 `data`

一句话：

**一个节点不能刷屏。**

---

## 5. summary 规则

每条主时间线日志必须有 `summary`。

`summary` 的要求：

- 一句话
- 人能直接看懂
- 不依赖展开 JSON
- 优先说明“结论”而不是“过程”

好的 summary：

- `quick model 编译 mood=轻愉悦 intensity=0.42`
- `注入 6 个上下文段，短期窗口 4 条`
- `生成 1 个工具调用`
- `写入 user/ai 记忆并触发阶段归档`

差的 summary：

- `stage=persona_signal_inference`
- `source=quick_model`
- `modelResponse={...}`

一句话：

**没有清晰 summary 的日志，不应该进入主时间线。**

---

## 6. data 规则

`data` 只做展开详情，不承担主展示职责。

`data` 允许放：

- 结构化字段
- 精简后的输入摘要
- 精简后的输出摘要
- 关键计数
- 关键参数

`data` 不应该放：

- 全量 prompt 原文
- 大段模型原始返回
- 无筛选的大对象
- 临时调试垃圾字段

一句话：

**data 是证据，不是正文。**

---

## 7. 各节点日志职责

### `personaNode`

应该展示：

- 本轮读到了什么状态
- 识别到了哪些信号
- 编译出了什么阶段 mood
- 最终产出了什么 policy / 调制结果

不应该展示：

- observation 全文堆砌
- 全量 persona state dump

### `contextNode`

应该展示：

- 注入了哪些上下文段
- system / history 规模
- 本轮 prompt 的结构概览

不应该展示：

- 完整 system prompt 原文

### `llmCall`

应该展示：

- 模型与采样参数
- 消息规模
- 首 token 时间 / 总耗时
- 是否生成 tool call
- 响应摘要

不应该展示：

- provider 原始 event
- 嵌套 message 原始结构

### `toolNode`

应该展示：

- 调了哪个工具
- 是否被策略拦截
- 输入摘要
- 输出摘要

### `memoryNode`

应该展示：

- 写入了什么短期记忆
- 是否触发阶段归档
- 是否更新长期记忆

### `shouldContinue`

应该展示：

- 为什么去 `toolNode`
- 为什么去 `memoryNode`
- 为什么直接结束

---

## 8. 禁止事项

以下内容禁止重新回到主时间线：

- LangGraph / LangChain 原始事件名作为主节点名
- `ChatOpenAI` 作为主步骤标题
- 旧 `agent_log` 格式
- 旧 `thought` 格式
- 旧 `node_enter / node_exit` 格式
- provider 原始 payload 直接上屏
- “仅供调试”的大 JSON 默认展开

一句话：

**原始事件只能做附属调试数据，不能做主时间线。**

---

## 9. 边界说明

- 前端 `Agent 思维链` 面板只展示 `AgentTraceRecord` 这一套主 agent 节点日志。
- `TaskTrace` 属于任务 / 子 agent 执行记录，用于任务域追踪，不属于前端思维链日志，也不应混入主 agent 时间线。

---

## 9. 验收标准

一个节点的日志只有同时满足下面条件，才算合格：

1. 使用统一 `AgentTraceRecord`
2. 节点名是业务节点名，不是 provider 名
3. 主时间线条数控制在 `2~4`
4. 每条都有明确 `summary`
5. `data` 只做展开详情
6. 不依赖旧 `agent_log` 格式

---

## 10. 当前系统的执行约束

后续所有新节点接入日志时，必须遵守这份文档。

如果一个节点的日志做不到：

- 可读
- 收束
- 节点语义明确

那么应先删减日志内容，再考虑增加字段。

一句话：

**日志的目标不是“记录得更多”，而是“让人更快看懂”。**
