/**
 * AI Agent 相关类型定义 - 重新导出模块
 */

// 重新导出枚举
export * from './Enum'

// 重新导出VO类型
export * from './vo'

// 重新导出Mapper层
export * from './mappers'

// 重新导出已有的实体类型（保持向后兼容）
export type {
  ConnectionStatus,
  SessionStatus
} from './Enum'

export type {
  TokenUsageVO as TokenUsage,
  ServiceAgentConfigVO as ServiceAgentConfig,
  RuntimeAgentStateVO as RuntimeAgentState,
  ToolCallVO as ToolCall,
  MCPServerConfigVO as MCPServerConfig,
  MCPToolVO as MCPTool,
  PromptPipelineConfigVO as PromptPipelineConfig,
  PromptStageVO as PromptStage,
  ChatMessageVO as ChatMessage,
  ChatSessionVO as ChatSession
} from './vo'

// 默认代理配置
export const DEFAULT_AGENT_CONFIG = {
  temperature: 0.7,
  maxTokens: 4000,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  stream: true,
  timeout: 30000,
  maxRetries: 3,
  isActive: true
} as const