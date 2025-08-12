/**
 * AI Agent配置和类型定义
 * 用于AI Agent功能的类型安全和配置管理
 */

/**
 * 支持的AI模型提供商
 */
export enum ModelProvider {
  OPENAI = 'openai',
  CLAUDE = 'claude',
  DEEPSEEK = 'deepseek'
}

/**
 * AI模型配置参数
 */
export interface ModelConfig {
  /** 模型提供商 */
  provider: ModelProvider
  /** API密钥 */
  apiKey: string
  /** 模型名称 */
  modelName: string
  /** 模型显示名称 */
  displayName?: string
  /** API基础URL（可选，用于自定义端点） */
  baseURL?: string
  /** 温度参数，控制输出随机性 (0-1) */
  temperature: number
  /** 最大令牌数 */
  maxTokens: number
  /** 最大重试次数 */
  maxRetries: number
  /** 请求超时时间（毫秒） */
  timeout: number
}

/**
 * AI Agent完整配置
 */
export interface AgentConfig {
  /** 当前使用的模型配置 */
  currentModel: ModelConfig
  /** 所有可用的模型配置 */
  availableModels: Record<string, ModelConfig>
  /** 系统提示词 */
  systemPrompt: string
  /** 上下文窗口大小（消息数量） */
  contextWindowSize: number
  /** 是否启用对话历史持久化 */
  enablePersistence: boolean
  /** 是否启用MCP工具 */
  enableMCPTools: boolean
  /** 启用的MCP工具列表 */
  enabledTools: string[]
}

/**
 * 聊天消息类型
 */
export enum MessageType {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
  TOOL = 'tool'
}

/**
 * 聊天消息
 */
export interface ChatMessage {
  /** 消息唯一ID */
  id: string
  /** 消息类型 */
  type: MessageType
  /** 消息内容 */
  content: string
  /** 消息时间戳 */
  timestamp: number
  /** 消息元数据 */
  metadata?: {
    /** 工具调用信息 */
    toolCalls?: ToolCall[]
    /** 错误信息 */
    error?: string
    /** 令牌使用统计 */
    tokenUsage?: TokenUsage
  }
}

/**
 * 工具调用信息
 */
export interface ToolCall {
  /** 工具调用ID */
  id: string
  /** 工具名称 */
  name: string
  /** 工具参数 */
  arguments: Record<string, any>
  /** 工具调用结果 */
  result?: any
  /** 调用状态 */
  status: 'pending' | 'success' | 'error'
  /** 错误信息 */
  error?: string
}

/**
 * 令牌使用统计
 */
export interface TokenUsage {
  /** 提示令牌数 */
  promptTokens: number
  /** 完成令牌数 */
  completionTokens: number
  /** 总令牌数 */
  totalTokens: number
}

/**
 * 对话会话
 */
export interface ChatSession {
  /** 会话ID */
  id: string
  /** 会话标题 */
  title: string
  /** 会话消息列表 */
  messages: ChatMessage[]
  /** 会话创建时间 */
  createdAt: number
  /** 会话最后更新时间 */
  updatedAt: number
  /** 会话配置 */
  config: AgentConfig
  /** 会话元数据 */
  metadata?: {
    /** 关联的世界观ID */
    worldId?: string
    /** 会话标签 */
    tags?: string[]
    /** 消息数量 */
    messageCount?: number
    /** 令牌使用统计 */
    tokenUsage?: TokenUsage
  }
}

/**
 * AI Agent状态
 */
export enum AgentStatus {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  PROCESSING = 'processing',
  ERROR = 'error'
}

/**
 * AI Agent状态信息
 */
export interface AgentState {
  /** 当前状态 */
  status: AgentStatus
  /** 状态描述 */
  message?: string
  /** 当前会话ID */
  currentSessionId?: string
  /** 是否已初始化 */
  isInitialized: boolean
  /** 错误信息 */
  error?: string
}

/**
 * 世界观分析类型
 */
export enum AnalysisType {
  CHARACTER = 'character',
  LOCATION = 'location',
  TIMELINE = 'timeline',
  RELATIONSHIP = 'relationship',
  CONSISTENCY = 'consistency'
}

/**
 * 世界观分析请求
 */
export interface WorldAnalysisRequest {
  /** 世界观ID */
  worldId: string
  /** 分析类型 */
  analysisType: AnalysisType
  /** 分析参数 */
  parameters?: Record<string, any>
}

/**
 * 世界观分析结果
 */
export interface WorldAnalysisResult {
  /** 分析类型 */
  analysisType: AnalysisType
  /** 分析结果 */
  result: any
  /** 分析摘要 */
  summary: string
  /** 建议列表 */
  suggestions: string[]
  /** 发现的问题 */
  issues: AnalysisIssue[]
  /** 分析时间戳 */
  timestamp: number
}

/**
 * 分析发现的问题
 */
export interface AnalysisIssue {
  /** 问题类型 */
  type: 'warning' | 'error' | 'suggestion'
  /** 问题描述 */
  description: string
  /** 问题位置/上下文 */
  context?: string
  /** 修复建议 */
  fixSuggestion?: string
}

/**
 * MCP工具信息
 */
export interface MCPTool {
  /** 工具名称 */
  name: string
  /** 工具描述 */
  description: string
  /** 工具参数模式 */
  inputSchema: Record<string, any>
  /** 工具服务器名称 */
  serverName: string
  /** 是否启用 */
  enabled: boolean
}

/**
 * MCP服务器配置
 */
export interface MCPServerConfig {
  /** 服务器名称 */
  name: string
  /** 服务器命令 */
  command: string
  /** 命令参数 */
  args: string[]
  /** 环境变量 */
  env?: Record<string, string>
  /** 是否启用 */
  enabled: boolean
}

/**
 * 默认配置常量
 */
export const DEFAULT_MODEL_CONFIGS: Record<ModelProvider, Partial<ModelConfig>> = {
  [ModelProvider.OPENAI]: {
    provider: ModelProvider.OPENAI,
    modelName: 'gpt-4',
    temperature: 0.7,
    maxTokens: 4000,
    maxRetries: 3,
    timeout: 30000
  },
  [ModelProvider.CLAUDE]: {
    provider: ModelProvider.CLAUDE,
    modelName: 'claude-3-sonnet-20240229',
    temperature: 0.7,
    maxTokens: 4000,
    maxRetries: 3,
    timeout: 30000
  },
  [ModelProvider.DEEPSEEK]: {
    provider: ModelProvider.DEEPSEEK,
    modelName: 'deepseek-chat',
    baseURL: 'https://api.deepseek.com',
    temperature: 0.7,
    maxTokens: 4000,
    maxRetries: 3,
    timeout: 30000
  }
}

/**
 * 智能创作相关类型
 */
export interface WritingTemplate {
  id: string
  name: string
  description: string
  category: string
  prompt: string
  variables?: {
    name: string
    description: string
    type: 'text' | 'number' | 'select'
    options?: string[]
    required?: boolean
  }[]
  tags?: string[]
}

export interface WritingTask {
  id: string
  type: 'improve' | 'translate' | 'summarize' | 'expand' | 'grammar' | 'tone' | 'creative' | 'template'
  input: string
  output?: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  timestamp: number
  metadata?: {
    template?: string
    language?: string
    tone?: string
    length?: string
    error?: string
    [key: string]: any
  }
}

/**
 * 优化建议类型
 */
export interface OptimizationSuggestion {
  type: 'grammar' | 'style' | 'clarity' | 'structure' | 'tone'
  severity: 'low' | 'medium' | 'high'
  message: string
  suggestion: string
  position?: {
    start: number
    end: number
  }
}

/**
 * 连接状态
 */
export interface ConnectionStatus {
  connected: boolean
  model?: string
  provider?: string
  lastCheck?: number
  error?: string
}

/**
 * 使用统计
 */
export interface UsageStats {
  messages: number
  tokens: number
  sessions: number
  cost?: number
  date?: string
}

/**
 * API响应类型
 */
export interface APIResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

/**
 * 分页参数
 */
export interface PaginationParams {
  page: number
  pageSize: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  search?: string
  filters?: Record<string, any>
}

/**
 * 分页结果
 */
export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * 导出选项
 */
export interface ExportOptions {
  format: 'json' | 'markdown' | 'txt' | 'csv'
  includeMetadata?: boolean
  dateRange?: {
    start: number
    end: number
  }
  sessionIds?: string[]
}

/**
 * 配置预设
 */
export interface ConfigPreset {
  id: string
  name: string
  description: string
  config: Partial<ModelConfig>
  isDefault?: boolean
  createdAt: number
  updatedAt: number
}

/**
 * 通知类型
 */
export interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
  actions?: {
    label: string
    action: () => void
  }[]
  persistent?: boolean
  timestamp: number
}

/**
 * 批量操作
 */
export interface BatchOperation {
  id: string
  type: 'delete' | 'export' | 'tag' | 'move'
  items: string[]
  status: 'pending' | 'processing' | 'completed' | 'error'
  progress: number
  result?: any
  error?: string
  createdAt: number
  completedAt?: number
}

/**
 * 搜索结果
 */
export interface SearchResult<T> {
  items: T[]
  total: number
  query: string
  filters: Record<string, any>
  facets?: Record<string, { value: string; count: number }[]>
  suggestions?: string[]
}

/**
 * 默认Agent配置
 */
export const DEFAULT_AGENT_CONFIG: Partial<AgentConfig> = {
  systemPrompt: '你是一个专业的世界观构建助手，能够帮助创作者分析和完善他们的虚构世界。你可以分析人物关系、地理设定、时间线一致性，并提供创作建议。',
  contextWindowSize: 20,
  enablePersistence: true,
  enableMCPTools: true,
  enabledTools: []
}