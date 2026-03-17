# AI Agent 日志系统开发手册

本文档旨在为开发者提供关于 WorldEdit-Agent 中 AI 日志系统的架构说明、使用指南及后续开发方向。

## 1. 系统概述

AI 日志系统旨在提供全链路的可观测性，覆盖从 Agent 决策循环（Graph）到 LLM 生成过程（Stream）的各个环节。它服务于两个主要目的：
1.  **调试与排查**：通过本地持久化日志，回溯 Agent 的状态变化与决策逻辑。
2.  **用户反馈**：通过实时流式日志，向用户展示 AI 的思考过程（Thinking Process）和工具调用状态。

## 2. 日志架构

日志系统采用双层架构，分别处理**节点状态**和**实时事件**。

### 2.1 核心模块

*   **`src/main/services/log/graphlog.ts`**: 日志系统的核心实现，包含：
    *   **上下文管理**：使用 `AsyncLocalStorage` 追踪当前请求的 `runId`。
    *   **节点装饰器**：`withGraphLog` 高阶函数，自动记录 LangGraph 节点的输入（Enter）和输出（Exit）到调试日志。
    *   **事件转换器**：`handleGraphLogEvent` 将 LangChain 的底层事件转换为前端可消费的 `StreamChunk`。
    *   **调试日志**：关键节点状态写入 `src/main/services/log/logs/debug.log`。

*   **`src/main/services/aiservice/agentrsystem/agentReactSystem.ts`**:
    *   集成 `withGraphLog` 装饰器，构建带监控的 StateGraph。

*   **`src/main/services/aiservice/aiService.ts`**:
    *   负责启动日志上下文 (`runWithGraphLogContext`)。
    *   消费 `streamEvents` 流，分发日志 Chunk 到前端。

### 2.2 数据流向图

```mermaid
graph TD
    A[用户请求] --> B(aiService.sendStreamMessage)
    B --> C{runWithGraphLogContext}
    C --> D[agent.streamEvents]
    
    subgraph "Graph Execution (Node Level)"
        D --> E[ContextNode]
        E -- withGraphLog --> F[debug.log]
        D --> G[LLMNode]
        G -- withGraphLog --> F
        D --> H[ToolNode]
        H -- withGraphLog --> F
    end
    
    subgraph "Stream Events (Event Level)"
        D -- on_chat_model_start --> I[handleGraphLogEvent]
        D -- on_chat_model_stream --> J[前端文本流]
        D -- on_tool_start --> I
        I --> K[StreamChunk (agent_log)]
        K --> L[前端渲染进程]
    end
```

## 3. 日志层级与结构

### 3.1 节点级日志 (Node Level)

用于记录 LangGraph 中每个节点的执行状态。
*   **触发方式**：通过 `withGraphLog` 装饰器自动触发。
*   **存储位置**：`src/main/services/log/logs/debug.log`
*   **结构示例**：
    ```text
    [2023-11-15T10:00:00.000Z] logNodeEnter: contextNode
    [2023-11-15T10:00:01.000Z] logNodeExit: contextNode
    ```
    *(注：为节省空间，已移除详细的 JSONL 快照存储，仅保留轻量级调试追踪)*

### 3.2 事件级日志 (Event Level)

用于实时捕获 LLM 的细粒度行为，直接推送到前端。
*   **触发方式**：监听 `streamEvents` 中的 `on_chat_model_start`, `on_chat_model_end`, `on_tool_start`, `on_tool_end`。
*   **数据结构** (`StreamChunk`):
    ```typescript
    {
      type: 'agent_log',
      subType: 'node_enter' | 'node_exit' | 'tool_start' | 'tool_end',
      nodeName: string,
      data: any, // 包含 prompt, result, tool_calls 等
      timestamp: number
    }
    ```

## 4. 使用案例

### 4.1 为新节点添加日志监控

当你向 Graph 中添加新节点时，只需使用 `withGraphLog` 包裹节点函数即可自动获得日志能力。

**修改前：**
```typescript
.addNode('myNewNode', myNewNodeFunction)
```

**修改后：**
```typescript
import { withGraphLog } from '../../log/graphlog'

.addNode('myNewNode', withGraphLog('myNewNode', myNewNodeFunction))
```

### 4.2 查看调试日志

*   **实时日志**：在开发环境控制台查看 `debug.log` 或终端输出。
*   **完整回溯**：找到 `src/main/services/log/logs/` 目录下对应 `runId` 的 `.jsonl` 文件。每行是一个 JSON 对象，按时间顺序记录了所有节点的状态变更。

### 4.3 前端消费日志

前端通过监听 `onStreamChunk` 接口接收日志：

```typescript
window.api.onStreamChunk((chunk) => {
  if (chunk.type === 'agent_log') {
    console.log(`[${chunk.subType}] ${chunk.nodeName}`, chunk.data)
    // 更新 UI 显示 AI 思考状态
  }
})
```

## 5. 后续可开发方向

为了进一步提升日志系统的价值，建议从以下方向进行迭代：

1.  **日志可视化面板 (Log Viewer)**
    *   **目标**：开发一个内置的开发者工具页面，用于加载 `.jsonl` 文件并可视化展示 Graph 的执行路径和状态变化。
    *   **实现**：读取本地日志目录 -> 解析 JSONL -> 使用类似 Mermaid 或 React Flow 的库渲染节点执行流程图。

2.  **性能分析 (Profiling)**
    *   **目标**：统计每个节点的耗时和 Token 消耗。
    *   **实现**：在 `withGraphLog` 中记录 `startTime` 和 `endTime`，计算 `duration` 并写入日志。集成 Token 计算库统计输入输出 Token。

3.  **日志轮转与清理**
    *   **目标**：防止本地日志文件无限增长占用磁盘。
    *   **实现**：在应用启动时或定时任务中，清理超过一定时间（如 7 天）的旧日志文件。

4.  **结构化思维链展示**
    *   **目标**：在前端更优雅地展示 "Thought Process"。
    *   **实现**：解析 `agent_log` 中的 `tool_calls` 和 `tool_outputs`，在聊天气泡下方生成折叠式的“思考过程”组件，而非简单的文本追加。

## 6. 维护注意事项

*   **敏感信息**：日志中可能包含用户输入的敏感信息，请确保在生产环境构建中配置适当的脱敏策略或关闭详细日志记录。
*   **序列化安全**：`snapshotMessage` 函数已处理循环引用和非序列化对象，但在引入新的复杂状态对象时仍需留意 `JSON.stringify` 的兼容性。
