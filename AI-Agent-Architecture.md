# WorldEdit Agent - AI Agent 架构文档

## 📋 概述

WorldEdit Agent 的 AI Agent 模块是一个功能完整的智能助手系统，采用 Electron + Vue 3 架构，支持多模型对话、智能创作、工具集成等核心功能。本文档详细说明了系统的架构设计、文件关系和功能能力。

## 🏗️ 整体架构

### 架构层次
```
┌─────────────────────────────────────────────────────────────┐
│                    前端渲染进程 (Renderer)                    │
├─────────────────────────────────────────────────────────────┤
│  Vue 组件层    │  AIAgent.vue, AIChat.vue, ModelConfig.vue │
│  服务层        │  ai-agent-api.ts, ai-agent.ts             │
│  状态管理层    │  useAIAgent.ts, useSmartWriting.ts        │
│  工具函数层    │  utils/ai-agent.ts                        │
│  类型定义层    │  types/agent.ts                           │
│  路由配置层    │  router/ai-agent.ts                       │
│  插件系统层    │  plugins/ai-agent.ts                      │
└─────────────────────────────────────────────────────────────┘
                              ↕ IPC 通信
┌─────────────────────────────────────────────────────────────┐
│                     主进程 (Main Process)                    │
├─────────────────────────────────────────────────────────────┤
│  IPC 处理层    │  ipc/ai-agent.ts                          │
│  服务统一层    │  services/ai-agent/index.ts               │
│  核心引擎层    │  AIAgentEngine.ts                         │
│  上下文管理层  │  ContextManager.ts                        │
│  模型适配层    │  ModelAdapter.ts                          │
│  工具管理层    │  MCPToolManager.ts                        │
└─────────────────────────────────────────────────────────────┘
                              ↕ API 调用
┌─────────────────────────────────────────────────────────────┐
│                      外部服务层                              │
├─────────────────────────────────────────────────────────────┤
│  AI 模型服务   │  OpenAI, Claude, DeepSeek                 │
│  MCP 工具生态  │  Model Context Protocol Tools             │
│  LangChain     │  Agent Framework & Tools                  │
└─────────────────────────────────────────────────────────────┘
```

## 📁 文件关系详解

### 主进程 (Main Process) 文件

#### 1. `/src/main/services/ai-agent/index.ts`
**角色**: AI Agent 服务统一入口
**职责**:
- 统一管理所有 AI Agent 相关服务
- 协调各个管理器之间的交互
- 提供对外的统一服务接口

**关键代码结构**:
```typescript
export class AIAgentService {
  private engine: AIAgentEngine           // 核心AI引擎
  private contextManager: ContextManager  // 上下文管理
  private modelAdapter: ModelAdapter      // 模型适配
  private toolManager: MCPToolManager     // 工具管理
}
```

#### 2. `/src/main/services/ai-agent/AIAgentEngine.ts`
**角色**: AI 对话引擎核心
**职责**:
- AI 模型的初始化和配置
- 消息处理和响应生成
- 工具调用管理
- 对话历史维护

**支持的模型提供商**:
- OpenAI (GPT-3.5, GPT-4 系列)
- Claude (Anthropic)
- DeepSeek (兼容 OpenAI API)

#### 3. `/src/main/services/ai-agent/ContextManager.ts`
**角色**: 对话上下文管理器
**职责**:
- 会话生命周期管理
- 消息历史存储和检索
- 上下文窗口控制
- 会话统计和分析

#### 4. `/src/main/services/ai-agent/ModelAdapter.ts`
**角色**: 模型适配器
**职责**:
- 统一不同AI模型的接口
- 处理流式和非流式响应
- 模型参数标准化
- 错误处理和重试机制

#### 5. `/src/main/services/ai-agent/MCPToolManager.ts`
**角色**: MCP 工具管理器
**职责**:
- MCP 工具的注册和管理
- 工具调用的执行和结果处理
- 工具生命周期管理
- 与 LangChain Agent 的集成

#### 6. `/src/main/ipc/ai-agent.ts`
**角色**: IPC 通信处理器
**职责**:
- 处理渲染进程的 IPC 请求
- 调用对应的服务方法
- 错误处理和响应格式化
- 事件通知机制

**IPC 通道定义**:
```typescript
export const AI_AGENT_CHANNELS = {
  // 服务管理
  INITIALIZE: 'ai-agent:initialize',
  GET_STATE: 'ai-agent:get-state',
  
  // 对话管理
  SEND_MESSAGE: 'ai-agent:send-message',
  CREATE_SESSION: 'ai-agent:create-session',
  
  // 模型管理
  VALIDATE_MODEL_CONFIG: 'ai-agent:validate-model-config',
  
  // 工具管理
  REGISTER_MCP_SERVER: 'ai-agent:register-mcp-server',
  
  // 数据管理
  SEARCH_MESSAGES: 'ai-agent:search-messages'
}
```

### 渲染进程 (Renderer) 文件

#### 1. `/src/renderer/src/views/AIAgent.vue`
**角色**: AI Agent 主界面组件
**职责**:
- 提供完整的 AI 对话界面
- 消息显示和交互
- 模型配置界面
- 历史记录管理

**主要功能区域**:
- 顶部导航栏 (模型配置、历史记录、清空对话)
- 模型状态栏 (显示当前模型和连接状态)
- 消息对话区域 (支持用户和AI消息显示)
- 输入区域 (支持文本输入、文件附加、快捷发送)
- 历史记录侧边栏 (会话管理和搜索)

#### 2. `/src/renderer/src/services/ai-agent-api.ts`
**角色**: AI Agent API 客户端
**职责**:
- 提供完整的 HTTP API 客户端
- 请求拦截和响应处理
- 缓存管理
- 错误处理和重试机制

**核心功能**:
```typescript
class AIAgentAPIService {
  // 连接管理
  async testConnection(): Promise<ConnectionStatus>
  
  // 会话管理
  async createSession(config?: AgentConfig): Promise<ChatSession>
  async sendMessage(sessionId: string, message: ChatMessage): Promise<ChatMessage>
  
  // 模型管理
  async getModelConfigs(): Promise<ModelConfig[]>
  async validateModelConfig(config: ModelConfig): Promise<boolean>
  
  // 工具管理
  async getAvailableTools(): Promise<MCPTool[]>
}
```

#### 3. `/src/renderer/src/services/ai-agent.ts`
**角色**: 渲染进程 AI Agent 服务
**职责**:
- 通过 IPC 与主进程通信
- 事件监听和处理
- 本地状态管理

#### 4. `/src/renderer/src/composables/useAIAgent.ts`
**角色**: AI Agent 组合式 API
**职责**:
- Vue 3 响应式状态管理
- 业务逻辑封装
- 生命周期管理

**提供的状态和方法**:
```typescript
export function useAIAgent() {
  // 状态
  const isConnected = ref(false)
  const currentModel = ref('')
  const sessions = ref<ChatSession[]>([])
  const tools = ref<MCPTool[]>([])
  
  // 方法
  const connect = async () => {}
  const sendMessage = async (content: string) => {}
  const createSession = async () => {}
  const callTool = async (toolName: string, params: any) => {}
  
  return {
    // 状态
    isConnected, currentModel, sessions, tools,
    // 方法
    connect, sendMessage, createSession, callTool
  }
}
```

#### 5. `/src/renderer/src/ai-agent/index.ts`
**角色**: AI Agent 模块统一导出
**职责**:
- 统一导出所有组件、类型、服务
- 提供模块的公共 API
- 版本管理和兼容性

#### 6. `/src/renderer/src/plugins/ai-agent.ts`
**角色**: AI Agent Vue 插件
**职责**:
- Vue 应用插件注册
- 全局组件注册
- 路由配置
- 快捷键管理

**插件配置选项**:
```typescript
export interface AIAgentPluginOptions {
  enableShortcuts?: boolean      // 启用快捷键
  enableAutoSave?: boolean       // 启用自动保存
  autoSaveInterval?: number      // 自动保存间隔
  debug?: boolean               // 调试模式
  customTheme?: Record<string, any>  // 自定义主题
  apiConfig?: {                 // API配置
    baseUrl?: string
    timeout?: number
    retries?: number
  }
}
```

#### 7. `/src/renderer/src/types/agent.ts`
**角色**: 类型定义文件
**职责**:
- 定义所有 AI Agent 相关的 TypeScript 类型
- 确保类型安全
- 提供智能提示

**核心类型定义**:
```typescript
// 模型提供商
export enum ModelProvider {
  OPENAI = 'openai',
  CLAUDE = 'claude', 
  DEEPSEEK = 'deepseek'
}

// 模型配置
export interface ModelConfig {
  provider: ModelProvider
  apiKey: string
  modelName: string
  temperature: number
  maxTokens: number
  // ...
}

// 消息类型
export enum MessageType {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
  TOOL = 'tool'
}

// 聊天消息
export interface ChatMessage {
  id: string
  type: MessageType
  content: string
  timestamp: number
  metadata?: {
    toolCalls?: ToolCall[]
    tokenUsage?: TokenUsage
  }
}
```

#### 8. `/src/renderer/src/utils/ai-agent.ts`
**角色**: 工具函数库
**职责**:
- 提供通用工具函数
- 格式化和验证函数
- 事件总线和存储管理

## 🚀 AI Agent 功能能力

### 核心对话能力

#### 1. 多模型支持
- **OpenAI**: GPT-3.5-turbo, GPT-4, GPT-4-turbo
- **Claude**: Claude-3-haiku, Claude-3-sonnet, Claude-3-opus
- **DeepSeek**: DeepSeek-chat, DeepSeek-coder

#### 2. 对话管理
- ✅ 多会话管理
- ✅ 会话历史持久化
- ✅ 上下文窗口控制
- ✅ 消息搜索和过滤
- ✅ 会话导出和导入

#### 3. 实时交互
- ✅ 流式响应支持
- ✅ 打字指示器
- ✅ 消息状态跟踪
- ✅ 错误处理和重试

### 智能创作能力

#### 1. 快速工具
- 📝 文本总结
- 🔄 内容改写
- 🌍 多语言翻译
- 📊 数据分析
- 💡 创意生成
- 🔍 关键词提取
- 📋 大纲生成
- ✅ 语法检查

#### 2. 模板系统
- 📄 商业计划书
- 📝 技术文档
- 📧 邮件模板
- 📋 会议纪要
- 📊 报告模板
- 🎯 营销文案

### 工具集成能力

#### 1. MCP (Model Context Protocol) 支持
- 🔧 工具注册和管理
- 🔄 动态工具加载
- 📊 工具调用统计
- 🛡️ 安全沙箱执行

#### 2. LangChain 集成
- 🤖 Agent 框架支持
- 🔗 工具链组合
- 📚 知识库集成
- 🧠 记忆管理

### 配置管理能力

#### 1. 模型配置
- ⚙️ 多模型切换
- 🎛️ 参数调节 (温度、最大令牌等)
- 🔑 API 密钥管理
- 🌐 自定义端点支持

#### 2. 系统配置
- 🎨 主题切换 (亮色/暗色/自动)
- ⌨️ 快捷键自定义
- 💾 自动保存配置
- 🌍 多语言支持

### 数据管理能力

#### 1. 存储管理
- 💾 本地数据持久化
- 🔄 数据同步机制
- 📤 批量导出功能
- 📥 数据导入恢复

#### 2. 统计分析
- 📊 使用统计
- 💰 Token 消耗分析
- ⏱️ 响应时间监控
- 📈 趋势分析

### 用户体验能力

#### 1. 界面交互
- 🎨 现代化 UI 设计
- 📱 响应式布局
- ⚡ 流畅动画效果
- 🔍 智能搜索

#### 2. 性能优化
- 🚀 虚拟滚动
- 💾 智能缓存
- 🔄 懒加载
- ⚡ 防抖节流

## 🔄 数据流向

### 消息发送流程
```
用户输入消息 (AIAgent.vue)
       ↓
调用 sendMessage (useAIAgent.ts)
       ↓
通过 IPC 发送到主进程 (ai-agent.ts)
       ↓
IPC 处理器接收 (ipc/ai-agent.ts)
       ↓
调用 AIAgentService.sendMessage (index.ts)
       ↓
引擎处理消息 (AIAgentEngine.ts)
       ↓
模型适配器调用 AI API (ModelAdapter.ts)
       ↓
上下文管理器保存消息 (ContextManager.ts)
       ↓
返回响应到渲染进程
       ↓
更新 UI 显示 (AIAgent.vue)
```

### 工具调用流程
```
AI 决定调用工具
       ↓
MCPToolManager 执行工具
       ↓
返回工具执行结果
       ↓
AI 基于结果生成最终回复
```

## 🛡️ 安全机制

### 1. API 密钥安全
- 🔐 本地加密存储
- 🚫 不在日志中记录
- 🔄 定期密钥轮换提醒

### 2. 工具执行安全
- 🛡️ 沙箱环境执行
- ⏱️ 执行超时控制
- 📋 权限白名单机制

### 3. 数据隐私
- 💾 本地数据存储
- 🔒 敏感信息脱敏
- 🗑️ 数据清理机制

## 📈 性能特性

### 1. 响应性能
- ⚡ 流式响应 < 100ms 首字节
- 🔄 并发请求支持
- 📊 智能负载均衡

### 2. 内存管理
- 💾 消息历史分页加载
- 🔄 自动垃圾回收
- 📈 内存使用监控

### 3. 网络优化
- 🔄 请求重试机制
- 💾 响应缓存
- 📊 网络状态监控

## 🔮 扩展能力

### 1. 插件系统
- 🔌 模块化架构
- 📦 动态插件加载
- 🔧 自定义工具开发

### 2. 主题系统
- 🎨 CSS 变量支持
- 🌓 动态主题切换
- 🎯 自定义主题开发

### 3. 国际化
- 🌍 多语言支持
- 🔄 动态语言切换
- 📝 本地化内容管理

## 📋 总结

WorldEdit Agent 的 AI Agent 模块是一个功能完整、架构清晰的智能助手系统。通过合理的分层设计和模块化架构，实现了:

- **高可维护性**: 清晰的文件职责分工和模块化设计
- **高可扩展性**: 插件化架构和标准化接口
- **高性能**: 优化的数据流和缓存机制
- **高安全性**: 完善的安全防护和隐私保护
- **优秀的用户体验**: 现代化界面和流畅交互

该系统为用户提供了强大的 AI 对话、智能创作、工具集成等能力，是一个生产级别的 AI Agent 解决方案。