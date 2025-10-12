/**
 * AI Agent相关类型定义
 */

// 导入Entity中的枚举
import { MessageType } from './chatMessageTypeEnum'
import { PromptPriority } from './promptEnum'
import { ModelProvider } from './modelEnum';
import { AgentStatus } from './agentStatusEnum';

/**
 * 连接状态枚举
 */
export enum ConnectionStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  ERROR = 'error'
}

// 服务层使用的 AgentConfig 接口，扩展实体类型
export interface ServiceAgentConfig {
  id?: string
  name: string
  description?: string
  systemPrompt: string
  // 模型配置字段 (现在直接包含在AgentConfig中)
  provider: ModelProvider
  modelName: string
  apiKey: string
  baseURL?: string
  temperature?: number
  maxTokens?: number
  maxRetries?: number
  timeout?: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  stream?: boolean
  retries?: number
  stop?: string[]
  isDefault?: boolean
  tools?: string[]
  mcpServers?: string[]
  enableMCPTools?: boolean
  contextWindowSize?: number
  promptConfig?: any
}

/**
 * 聊天消息接口
 */
export interface ChatMessage {
  id: string
  sessionId: string
  type: MessageType
  content: string
  metadata?: Record<string, any>
  timestamp: Date
}

/**
 * 聊天会话接口
 */
export interface ChatSession {
  id: string
  agentId: string
  title: string
  messages: ChatMessage[]
  createdAt: Date
  updatedAt: Date
}

/**
 * 运行时Agent状态接口
 * 用于内存中的临时状态管理，与数据库实体AgentState区分
 */
export interface RuntimeAgentState {
  status: AgentStatus
  currentSessionId?: string
  tokenUsage?: number 
  lastActivity?: Date 
}


/**
 * 工具调用接口
 */
export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, any>
  result?: any
  error?: string
  timestamp: Date
}

/**
 * MCP服务器配置接口
 */
export interface MCPServerConfig {
  id: string
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * MCP工具接口
 */
export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, any>
  serverId: string
}

/**
 * 提示词管道配置接口
 */
export interface PromptPipelineConfig {
  id: string
  name: string
  description?: string
  stages: PromptStage[]
  priority: PromptPriority
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * 提示词阶段接口
 */
export interface PromptStage {
  id: string
  name: string
  template: string
  variables?: Record<string, any>
  order: number
}

/**
 * 默认Agent配置
 */
export const DEFAULT_AGENT_CONFIG: Partial<ServiceAgentConfig> = {
  name: 'Default Agent',
  description: 'Default AI Agent configuration',
  temperature: 0.7,
  maxTokens: 2048,
  systemPrompt: 'You are a helpful AI assistant.',
  tools: []
}