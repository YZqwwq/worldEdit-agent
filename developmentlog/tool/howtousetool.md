# 工具系统设计记录

## 背景

当前 AI agent 系统已经具备 LangGraph 主流程与工具调用能力，但早期工具层存在明显不足：

1. 工具只是函数，没有完整契约
2. 只有入参 schema，没有统一的出参保证
3. 没有明确的“何时该用工具、何时不该用工具”的说明
4. 主 agent 上下文中没有“工具优先”的系统提示
5. 工具注册位置过于贴近单个 agent，不利于未来子 agent / 并行 agent 复用

因此，工具系统需要从“能调用”升级到“可复用、可约束、可扩展、可被模型理解”。

---

## 当前目标

当前阶段的工具设计目标不是追求工具数量，而是先建立一套稳定的工具基础设施：

1. 工具定义要原子化
2. 工具契约要明确
3. 工具返回值要统一
4. 工具使用说明要进入主 agent 上下文
5. 工具定义与 agent 可用工具集要分离

一句话总结：

`工具是能力，toolkit 是装配，agent 只消费自己允许使用的工具集`

---

## 当前问题复盘

早期实现中，工具系统存在以下问题：

### 1. 工具注册层与工具定义层混在一起

原本主 agent 直接从：

- `src/main/services/aiservice/agentrsystem/modelwithtool/tool.ts`

导出工具对象。

这样做的问题是：

1. 工具天然看起来“属于某个 agent”
2. 未来子 agent 无法自然复用
3. 不同 agent 的能力边界不清晰

### 2. 工具返回值无统一格式

早期 `toolNode` 只是执行工具，再把结果做 `String(result)` 后塞回模型。

这会带来两个问题：

1. 工具返回对象时，模型可能只看到 `[object Object]`
2. 失败信息和成功信息没有统一的结构化形态

### 3. 主 agent 不知道“应该先找工具”

如果系统 prompt 或 context 中没有明确强调：

- 遇到真实状态问题要优先查工具
- 不要猜测数据库状态
- 写入前先查对象是否存在

那么模型通常会更倾向于直接回答，而不是主动调用工具。

---

## 当前架构原则

当前工具系统采用“两层设计”：

### 第一层：原子工具定义层

放在：

- `src/main/services/aiservice/ai-utils/tools/`

这一层只负责定义单个工具本身，不关心哪个 agent 使用它。

例如未来可以放：

- `world/listWorlds.ts`
- `world/listEntities.ts`
- `world/getEntityDetail.ts`
- `file/editFile.ts`
- `task/delegateCodeWorker.ts`

### 第二层：工具集装配层

放在：

- `src/main/services/aiservice/ai-utils/toolkits/`

这一层负责把多个原子工具组合成某个 agent 可以使用的工具集合。

例如：

- `mainAgentToolkit.ts`
- `worldbuildingToolkit.ts`
- `codeWorkerToolkit.ts`

这样做的意义是：

1. 同一个工具可以被多个 agent 复用
2. 每个 agent 仍然有自己的权限边界
3. 工具定义与 agent 能力配置彻底分离

---

## 当前基础设施

### 1. defineAgentTool

当前已新增工具契约层：

- `src/main/services/aiservice/ai-utils/core/agentTool.ts`

它负责统一描述工具：

1. 名称
2. 描述
3. 输入 schema
4. 输出 schema
5. 使用说明
6. 风险等级
7. 只读属性
8. 幂等属性

工具定义不再只是一个 `tool(async () => ...)`，而是一个完整契约。

### 2. 统一结果包

当前工具执行后的返回格式统一为：

```json
{
  "ok": true,
  "data": {},
  "error": null,
  "message": "简短说明",
  "nextSuggestions": [],
  "meta": {
    "toolName": "list_worlds",
    "timestamp": "2026-03-20T00:00:00.000Z",
    "riskLevel": "low",
    "readOnly": true,
    "idempotent": true
  }
}
```

当工具失败时：

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "INPUT_VALIDATION_FAILED",
    "message": "..."
  },
  "message": "list_worlds failed.",
  "nextSuggestions": [],
  "meta": {
    "toolName": "list_worlds",
    "timestamp": "2026-03-20T00:00:00.000Z",
    "riskLevel": "low",
    "readOnly": true,
    "idempotent": true
  }
}
```

这个结构的价值：

1. 模型能稳定区分成功和失败
2. 工具失败时不会误导模型
3. 后续子 agent 也能用同一套约定

### 3. 工具使用 prompt

当前已新增：

- `src/main/services/aiservice/ai-utils/core/toolUsagePrompt.ts`

该模块会根据当前注册工具自动生成系统提示，注入到 `contextNode`。

它的目的不是重复工具 description，而是明确告诉主 agent：

1. 遇到真实状态问题优先用工具确认
2. 写入前先查
3. 工具失败时不能伪造结果
4. 没有工具时再明确说明能力边界

---

## 当前工具设计规范

后续新增工具时，必须遵循以下规范。

### 1. 工具命名规范

建议采用：

- `list_xxx`
- `get_xxx`
- `create_xxx`
- `update_xxx`
- `delete_xxx`
- `delegate_xxx`

命名要求：

1. 动词清晰
2. 目标对象明确
3. 不使用模糊名字

例如：

- 好：`list_worlds`
- 好：`get_entity_detail`
- 差：`world_tool`
- 差：`do_something`

### 2. 工具描述规范

每个工具至少需要说明：

1. 它做什么
2. 何时使用
3. 何时不要使用
4. 输入是什么
5. 输出是什么

模型不是代码阅读器，不能假设它会自动从 schema 中理解工具语义。

### 3. 输入规范

所有工具输入都必须用 Zod schema 明确校验。

即便是无参数工具，也应显式写：

```ts
z.object({})
```

不要允许“随便传点什么也行”的工具存在。

### 4. 输出规范

所有工具执行结果都必须经过输出 schema 校验。

原因：

1. 保证工具自身稳定
2. 避免未来重构时 silently break
3. 让模型看到的结果始终是可预期的

### 5. 风险等级规范

当前推荐的风险等级：

- `low`
- `medium`
- `high`

其中：

- `low`：只读查询、纯计算
- `medium`：有写入但可逆或影响较小
- `high`：删除、覆盖、执行外部动作、潜在不可逆行为

### 6. readOnly / idempotent 规范

每个工具都应显式标记：

- 是否只读
- 是否幂等

这样未来可以支持：

1. 按风险策略过滤工具
2. 按 agent 类型装配能力
3. 更细粒度地做工具使用限制

---

## 当前已落成的工具示例

### 1. list_worlds

当前第一个公共工具为：

- `src/main/services/aiservice/ai-utils/tools/world/listWorlds.ts`

用途：

1. 查询当前数据库中已有的世界观项目
2. 为后续实体查询和写入提供 worldId 上下文

这是一个很适合作为第一批工具的能力，因为它：

1. 是只读工具
2. 风险低
3. 上下文价值高
4. 非常适合作为“先查再做”的起点

### 2. add

当前保留了 `add` 作为简单示例工具，用于验证基础设施本身可工作。

它不是业务核心工具，但适合作为最小样例。

---

## 当前工具集装配方式

当前主 agent 工具集定义在：

- `src/main/services/aiservice/ai-utils/toolkits/mainAgentToolkit.ts`

主 agent 的工具注册入口仍然通过：

- `src/main/services/aiservice/agentrsystem/modelwithtool/tool.ts`

统一导出。

这样做的好处是：

1. 不破坏现有调用链
2. 未来可以很容易替换为不同 agent 的 toolkit
3. 子 agent 只需要切换装配层，而不需要重复写工具本体

---

## 与任务系统的关系

任务系统中已经存在对子 agent 能力工具的预留，例如：

- `delegate_general_task`
- `delegate_code_worker`
- `delegate_tool_builder`

但这些当前还没有真正落地。

因此当前工具系统要明确区分两类工具：

### 1. 直接业务工具

例如：

- 查询世界观列表
- 查询实体详情
- 写入组件数据

这类工具是主 agent 或子 agent 都可能直接使用的基础能力。

### 2. 委派类工具

例如：

- 委托代码子 agent
- 委托文档子 agent
- 委托架构分析 agent

这类工具不是直接回答业务问题，而是触发任务执行路径。

---

## 工具设计的核心原则

当前阶段必须坚持以下原则：

### 原则 1：先把基础设施做对，再扩工具数量

工具系统最危险的不是工具少，而是：

1. 每个工具风格不同
2. 返回值不统一
3. 模型不知道怎么用
4. 工具越多越混乱

所以先统一规范，再持续加工具。

### 原则 2：查询工具优先于写入工具

因为主 agent 目前最缺的是：

`面对真实系统状态时，知道先查而不是先猜`

所以第一批工具应优先落地：

1. `list_worlds`
2. `get_world_schema_catalog`
3. `list_entities`
4. `get_entity_detail`

等只读能力成熟后，再补写入工具。

### 原则 3：一个工具只做一件事

不要设计这种工具：

- “既查询又写入”
- “既创建又更新又删除”
- “根据情况自动推断并修改很多对象”

模型调用工具时，越原子越稳定。

### 原则 4：写入前先查询

后续所有写入工具在设计时都要默认遵守：

1. 写入前确认目标对象存在
2. 写入前确认 schema 允许该字段
3. 写入失败时明确报告失败原因

### 原则 5：工具失败时不能编造结果

只要工具返回：

- `ok=false`

模型就必须：

1. 明确说明失败
2. 说明失败原因
3. 提供下一步建议

不能因为“想给用户一个答案”就伪造数据库状态。

---

## 后续建议路线

推荐的后续工具落地顺序：

### 第一批：只读世界观工具

1. `list_worlds`
2. `get_world_schema_catalog`
3. `list_entities`
4. `get_entity_detail`
5. `list_relation_definitions`

### 第二批：结构化写入工具

1. `create_world`
2. `create_world_entity`
3. `upsert_world_entity_component`
4. `create_world_entity_relation`
5. `update_world_entity`

### 第三批：任务 / 子 agent 工具

1. `delegate_general_task`
2. `delegate_code_worker`
3. `delegate_doc_worker`
4. `delegate_tool_builder`
5. `delegate_architecture_analyst`

---

## 当前结论

当前工具系统已经从“临时函数集合”开始转向“可复用的能力系统”。

当前认定的正确方向是：

1. 工具定义原子化
2. 工具注册按 toolkit 装配
3. 工具输入输出严格校验
4. 工具结果统一 envelope
5. 工具使用规则进入主 agent 上下文
6. 先做查询工具，再做写入工具，再做委派工具

这一套设计的根本目的不是“让 agent 有很多工具”，而是：

`让 agent 在需要面对真实系统状态时，学会优先使用工具，而不是依赖猜测。`
