/**
 * AI Agent 数据库服务
 * 提供与AI Agent相关的数据库操作接口
 * 直接使用Entity类型进行数据交流
 */

import {
  AgentConfig,
  ChatMessage,
  ChatSession,
  AgentState,
  ToolCall,
  TokenUsage,
} from '../../../../shared/entities/agent'
import { ModelConfig } from '../../../../shared/entities/model';
/**
 * AI Agent数据库IPC通道常量
 */
const AI_AGENT_DB_CHANNELS = {
  // Agent配置操作
  SAVE_AGENT_CONFIG: 'ai-agent-db:save-agent-config',
  GET_AGENT_CONFIG: 'ai-agent-db:get-agent-config',
  GET_ALL_AGENT_CONFIGS: 'ai-agent-db:get-all-agent-configs',
  DELETE_AGENT_CONFIG: 'ai-agent-db:delete-agent-config',
  
  // 模型配置操作
  SAVE_MODEL_CONFIG: 'ai-agent-db:save-model-config',
  GET_MODEL_CONFIG: 'ai-agent-db:get-model-config',
  GET_ALL_MODEL_CONFIGS: 'ai-agent-db:get-all-model-configs',
  DELETE_MODEL_CONFIG: 'ai-agent-db:delete-model-config',
  
  // 聊天会话操作
  SAVE_CHAT_SESSION: 'ai-agent-db:save-chat-session',
  GET_CHAT_SESSION: 'ai-agent-db:get-chat-session',
  GET_ALL_CHAT_SESSIONS: 'ai-agent-db:get-all-chat-sessions',
  DELETE_CHAT_SESSION: 'ai-agent-db:delete-chat-session',
  ARCHIVE_CHAT_SESSION: 'ai-agent-db:archive-chat-session',
  
  // 消息操作
  SAVE_CHAT_MESSAGE: 'ai-agent-db:save-chat-message',
  GET_SESSION_MESSAGES: 'ai-agent-db:get-session-messages',
  DELETE_CHAT_MESSAGE: 'ai-agent-db:delete-chat-message',
  SEARCH_MESSAGES: 'ai-agent-db:search-messages',
  
  // Agent状态操作
  SAVE_AGENT_STATE: 'ai-agent-db:save-agent-state',
  GET_AGENT_STATE: 'ai-agent-db:get-agent-state',
  DELETE_AGENT_STATE: 'ai-agent-db:delete-agent-state',
  
  // 工具调用操作
  SAVE_TOOL_CALL: 'ai-agent-db:save-tool-call',
  GET_TOOL_CALLS: 'ai-agent-db:get-tool-calls',
  GET_SESSION_TOOL_CALLS: 'ai-agent-db:get-session-tool-calls',
  DELETE_TOOL_CALL: 'ai-agent-db:delete-tool-call',
  
  // Token使用统计操作
  SAVE_TOKEN_USAGE: 'ai-agent-db:save-token-usage',
  GET_TOKEN_USAGE: 'ai-agent-db:get-token-usage',
  GET_SESSION_TOKEN_USAGE: 'ai-agent-db:get-session-token-usage',
  GET_USAGE_STATS: 'ai-agent-db:get-usage-stats',
  
  // 系统操作
  HEALTH_CHECK: 'ai-agent-db:health-check',
  CLEAR_ALL_DATA: 'ai-agent-db:clear-all-data',
  EXPORT_DATA: 'ai-agent-db:export-data',
  IMPORT_DATA: 'ai-agent-db:import-data'
} as const

/**
 * 分页参数接口
 */
interface PaginationParams {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'ASC' | 'DESC'
}

/**
 * 分页结果接口
 */
interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

/**
 * 搜索参数接口
 */
interface SearchParams extends PaginationParams {
  query: string
  sessionId?: string
  startDate?: Date
  endDate?: Date
}

/**
 * AI Agent数据库客户端
 */
export class AIAgentDatabaseClient {
  private initialized = false

  /**
   * 初始化数据库客户端
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }
    
    try {
      await this.healthCheck()
      this.initialized = true
      console.log('AI Agent数据库客户端已初始化')
    } catch (error) {
      console.error('AI Agent数据库客户端初始化失败:', error)
      throw error
    }
  }

  /**
   * 检查是否为Electron环境
   */
  private isElectronEnvironment(): boolean {
    return typeof window !== 'undefined' && !!window.electron && !!window.electron.ipcRenderer
  }

  /**
   * 调用IPC方法
   */
  private async invoke<T>(channel: string, ...args: any[]): Promise<T> {
    if (!this.isElectronEnvironment()) {
      throw new Error('Not in Electron environment')
    }
    
    try {
      return await window.electron.ipcRenderer.invoke(channel, ...args)
    } catch (error) {
      console.error(`IPC调用失败 [${channel}]:`, error)
      throw error
    }
  }

  // ==================== Agent配置操作 ====================

  /**
   * 保存Agent配置
   */
  async saveAgentConfig(config: AgentConfig): Promise<AgentConfig> {
    return this.invoke<AgentConfig>(AI_AGENT_DB_CHANNELS.SAVE_AGENT_CONFIG, config)
  }

  /**
   * 获取Agent配置
   */
  async getAgentConfig(id: string): Promise<AgentConfig | null> {
    return this.invoke<AgentConfig | null>(AI_AGENT_DB_CHANNELS.GET_AGENT_CONFIG, id)
  }

  /**
   * 获取所有Agent配置
   */
  async getAllAgentConfigs(): Promise<AgentConfig[]> {
    return this.invoke<AgentConfig[]>(AI_AGENT_DB_CHANNELS.GET_ALL_AGENT_CONFIGS)
  }

  /**
   * 删除Agent配置
   */
  async deleteAgentConfig(id: string): Promise<void> {
    return this.invoke<void>(AI_AGENT_DB_CHANNELS.DELETE_AGENT_CONFIG, id)
  }

  // ==================== 模型配置操作 ====================

  /**
   * 保存模型配置
   */
  async saveModelConfig(config: ModelConfig): Promise<ModelConfig> {
    return this.invoke<ModelConfig>(AI_AGENT_DB_CHANNELS.SAVE_MODEL_CONFIG, config)
  }

  /**
   * 获取模型配置
   */
  async getModelConfig(id: string): Promise<ModelConfig | null> {
    return this.invoke<ModelConfig | null>(AI_AGENT_DB_CHANNELS.GET_MODEL_CONFIG, id)
  }

  /**
   * 获取所有模型配置
   */
  async getAllModelConfigs(): Promise<ModelConfig[]> {
    return this.invoke<ModelConfig[]>(AI_AGENT_DB_CHANNELS.GET_ALL_MODEL_CONFIGS)
  }

  /**
   * 删除模型配置
   */
  async deleteModelConfig(id: string): Promise<void> {
    return this.invoke<void>(AI_AGENT_DB_CHANNELS.DELETE_MODEL_CONFIG, id)
  }

  // ==================== 聊天会话操作 ====================

  /**
   * 保存聊天会话
   */
  async saveChatSession(session: ChatSession): Promise<ChatSession> {
    return this.invoke<ChatSession>(AI_AGENT_DB_CHANNELS.SAVE_CHAT_SESSION, session)
  }

  /**
   * 获取聊天会话
   */
  async getChatSession(id: string): Promise<ChatSession | null> {
    return this.invoke<ChatSession | null>(AI_AGENT_DB_CHANNELS.GET_CHAT_SESSION, id)
  }

  /**
   * 获取所有聊天会话
   */
  async getAllChatSessions(params?: PaginationParams): Promise<PaginatedResult<ChatSession>> {
    return this.invoke<PaginatedResult<ChatSession>>(AI_AGENT_DB_CHANNELS.GET_ALL_CHAT_SESSIONS, params)
  }

  /**
   * 删除聊天会话
   */
  async deleteChatSession(id: string): Promise<void> {
    return this.invoke<void>(AI_AGENT_DB_CHANNELS.DELETE_CHAT_SESSION, id)
  }

  /**
   * 归档聊天会话
   */
  async archiveChatSession(id: string): Promise<void> {
    return this.invoke<void>(AI_AGENT_DB_CHANNELS.ARCHIVE_CHAT_SESSION, id)
  }

  // ==================== 消息操作 ====================

  /**
   * 保存聊天消息
   */
  async saveChatMessage(message: ChatMessage): Promise<ChatMessage> {
    return this.invoke<ChatMessage>(AI_AGENT_DB_CHANNELS.SAVE_CHAT_MESSAGE, message)
  }

  /**
   * 获取会话消息
   */
  async getSessionMessages(sessionId: string, params?: PaginationParams): Promise<PaginatedResult<ChatMessage>> {
    return this.invoke<PaginatedResult<ChatMessage>>(AI_AGENT_DB_CHANNELS.GET_SESSION_MESSAGES, sessionId, params)
  }

  /**
   * 删除聊天消息
   */
  async deleteChatMessage(id: string): Promise<void> {
    return this.invoke<void>(AI_AGENT_DB_CHANNELS.DELETE_CHAT_MESSAGE, id)
  }

  /**
   * 搜索消息
   */
  async searchMessages(params: SearchParams): Promise<PaginatedResult<ChatMessage>> {
    return this.invoke<PaginatedResult<ChatMessage>>(AI_AGENT_DB_CHANNELS.SEARCH_MESSAGES, params)
  }

  // ==================== Agent状态操作 ====================

  /**
   * 保存Agent状态
   */
  async saveAgentState(state: AgentState): Promise<AgentState> {
    return this.invoke<AgentState>(AI_AGENT_DB_CHANNELS.SAVE_AGENT_STATE, state)
  }

  /**
   * 获取Agent状态
   */
  async getAgentState(agentConfigId: string): Promise<AgentState | null> {
    return this.invoke<AgentState | null>(AI_AGENT_DB_CHANNELS.GET_AGENT_STATE, agentConfigId)
  }

  /**
   * 删除Agent状态
   */
  async deleteAgentState(agentConfigId: string): Promise<void> {
    return this.invoke<void>(AI_AGENT_DB_CHANNELS.DELETE_AGENT_STATE, agentConfigId)
  }

  // ==================== 工具调用操作 ====================

  /**
   * 保存工具调用
   */
  async saveToolCall(toolCall: ToolCall): Promise<ToolCall> {
    return this.invoke<ToolCall>(AI_AGENT_DB_CHANNELS.SAVE_TOOL_CALL, toolCall)
  }

  /**
   * 获取工具调用记录
   */
  async getToolCalls(params?: PaginationParams): Promise<PaginatedResult<ToolCall>> {
    return this.invoke<PaginatedResult<ToolCall>>(AI_AGENT_DB_CHANNELS.GET_TOOL_CALLS, params)
  }

  /**
   * 获取会话工具调用记录
   */
  async getSessionToolCalls(sessionId: string, params?: PaginationParams): Promise<PaginatedResult<ToolCall>> {
    return this.invoke<PaginatedResult<ToolCall>>(AI_AGENT_DB_CHANNELS.GET_SESSION_TOOL_CALLS, sessionId, params)
  }

  /**
   * 删除工具调用
   */
  async deleteToolCall(id: string): Promise<void> {
    return this.invoke<void>(AI_AGENT_DB_CHANNELS.DELETE_TOOL_CALL, id)
  }

  // ==================== Token使用统计操作 ====================

  /**
   * 保存Token使用记录
   */
  async saveTokenUsage(usage: TokenUsage): Promise<TokenUsage> {
    return this.invoke<TokenUsage>(AI_AGENT_DB_CHANNELS.SAVE_TOKEN_USAGE, usage)
  }

  /**
   * 获取Token使用记录
   */
  async getTokenUsage(params?: PaginationParams): Promise<PaginatedResult<TokenUsage>> {
    return this.invoke<PaginatedResult<TokenUsage>>(AI_AGENT_DB_CHANNELS.GET_TOKEN_USAGE, params)
  }

  /**
   * 获取会话Token使用记录
   */
  async getSessionTokenUsage(sessionId: string): Promise<TokenUsage[]> {
    return this.invoke<TokenUsage[]>(AI_AGENT_DB_CHANNELS.GET_SESSION_TOKEN_USAGE, sessionId)
  }

  /**
   * 获取使用统计
   */
  async getUsageStats(period?: string): Promise<{
    totalSessions: number
    totalMessages: number
    totalTokens: number
    totalCost: number
    averageResponseTime: number
    period: string
  }> {
    return this.invoke(AI_AGENT_DB_CHANNELS.GET_USAGE_STATS, period)
  }

  // ==================== 系统操作 ====================

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    return this.invoke<boolean>(AI_AGENT_DB_CHANNELS.HEALTH_CHECK)
  }

  /**
   * 清除所有数据
   */
  async clearAllData(): Promise<void> {
    return this.invoke<void>(AI_AGENT_DB_CHANNELS.CLEAR_ALL_DATA)
  }

  /**
   * 导出数据
   */
  async exportData(): Promise<any> {
    return this.invoke<any>(AI_AGENT_DB_CHANNELS.EXPORT_DATA)
  }

  /**
   * 导入数据
   */
  async importData(data: any): Promise<void> {
    return this.invoke<void>(AI_AGENT_DB_CHANNELS.IMPORT_DATA, data)
  }
}

/**
 * AI Agent数据库服务
 */
export class AIAgentDatabaseService {
  private client: AIAgentDatabaseClient
  private initialized = false

  constructor() {
    this.client = new AIAgentDatabaseClient()
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }
    
    try {
      await this.client.initialize()
      this.initialized = true
      console.log('AI Agent数据库服务已初始化')
    } catch (error) {
      console.error('AI Agent数据库服务初始化失败:', error)
      throw error
    }
  }

  /**
   * 确保服务已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  // ==================== Agent配置管理 ====================

  /**
   * 创建或更新Agent配置
   */
  async saveAgentConfig(config: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'> | AgentConfig): Promise<AgentConfig> {
    await this.ensureInitialized()
    return this.client.saveAgentConfig(config as AgentConfig)
  }

  /**
   * 获取Agent配置
   */
  async getAgentConfig(id: string): Promise<AgentConfig | null> {
    await this.ensureInitialized()
    return this.client.getAgentConfig(id)
  }

  /**
   * 获取所有Agent配置
   */
  async getAllAgentConfigs(): Promise<AgentConfig[]> {
    await this.ensureInitialized()
    return this.client.getAllAgentConfigs()
  }

  /**
   * 删除Agent配置
   */
  async deleteAgentConfig(id: string): Promise<void> {
    await this.ensureInitialized()
    return this.client.deleteAgentConfig(id)
  }

  // ==================== 模型配置管理 ====================

  /**
   * 创建或更新模型配置
   */
  async saveModelConfig(config: Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'> | ModelConfig): Promise<ModelConfig> {
    await this.ensureInitialized()
    return this.client.saveModelConfig(config as ModelConfig)
  }

  /**
   * 获取模型配置
   */
  async getModelConfig(id: string): Promise<ModelConfig | null> {
    await this.ensureInitialized()
    return this.client.getModelConfig(id)
  }

  /**
   * 获取所有模型配置
   */
  async getAllModelConfigs(): Promise<ModelConfig[]> {
    await this.ensureInitialized()
    return this.client.getAllModelConfigs()
  }

  /**
   * 删除模型配置
   */
  async deleteModelConfig(id: string): Promise<void> {
    await this.ensureInitialized()
    return this.client.deleteModelConfig(id)
  }

  // ==================== 聊天会话管理 ====================

  /**
   * 创建或更新聊天会话
   */
  async saveChatSession(session: Omit<ChatSession, 'id' | 'createdAt' | 'updatedAt'> | ChatSession): Promise<ChatSession> {
    await this.ensureInitialized()
    return this.client.saveChatSession(session as ChatSession)
  }

  /**
   * 获取聊天会话
   */
  async getChatSession(id: string): Promise<ChatSession | null> {
    await this.ensureInitialized()
    return this.client.getChatSession(id)
  }

  /**
   * 获取所有聊天会话
   */
  async getAllChatSessions(params?: PaginationParams): Promise<PaginatedResult<ChatSession>> {
    await this.ensureInitialized()
    return this.client.getAllChatSessions(params)
  }

  /**
   * 删除聊天会话
   */
  async deleteChatSession(id: string): Promise<void> {
    await this.ensureInitialized()
    return this.client.deleteChatSession(id)
  }

  /**
   * 归档聊天会话
   */
  async archiveChatSession(id: string): Promise<void> {
    await this.ensureInitialized()
    return this.client.archiveChatSession(id)
  }

  // ==================== 消息管理 ====================

  /**
   * 保存聊天消息
   */
  async saveChatMessage(message: Omit<ChatMessage, 'id' | 'createdAt'> | ChatMessage): Promise<ChatMessage> {
    await this.ensureInitialized()
    return this.client.saveChatMessage(message as ChatMessage)
  }

  /**
   * 获取会话消息
   */
  async getSessionMessages(sessionId: string, params?: PaginationParams): Promise<PaginatedResult<ChatMessage>> {
    await this.ensureInitialized()
    return this.client.getSessionMessages(sessionId, params)
  }

  /**
   * 删除聊天消息
   */
  async deleteChatMessage(id: string): Promise<void> {
    await this.ensureInitialized()
    return this.client.deleteChatMessage(id)
  }

  /**
   * 搜索消息
   */
  async searchMessages(params: SearchParams): Promise<PaginatedResult<ChatMessage>> {
    await this.ensureInitialized()
    return this.client.searchMessages(params)
  }

  // ==================== Agent状态管理 ====================

  /**
   * 保存Agent状态
   */
  async saveAgentState(state: Omit<AgentState, 'id' | 'createdAt' | 'updatedAt'> | AgentState): Promise<AgentState> {
    await this.ensureInitialized()
    return this.client.saveAgentState(state as AgentState)
  }

  /**
   * 获取Agent状态
   */
  async getAgentState(agentConfigId: string): Promise<AgentState | null> {
    await this.ensureInitialized()
    return this.client.getAgentState(agentConfigId)
  }

  /**
   * 删除Agent状态
   */
  async deleteAgentState(agentConfigId: string): Promise<void> {
    await this.ensureInitialized()
    return this.client.deleteAgentState(agentConfigId)
  }

  // ==================== 工具调用管理 ====================

  /**
   * 保存工具调用
   */
  async saveToolCall(toolCall: Omit<ToolCall, 'id' | 'createdAt' | 'updatedAt'> | ToolCall): Promise<ToolCall> {
    await this.ensureInitialized()
    return this.client.saveToolCall(toolCall as ToolCall)
  }

  /**
   * 获取工具调用记录
   */
  async getToolCalls(params?: PaginationParams): Promise<PaginatedResult<ToolCall>> {
    await this.ensureInitialized()
    return this.client.getToolCalls(params)
  }

  /**
   * 获取会话工具调用记录
   */
  async getSessionToolCalls(sessionId: string, params?: PaginationParams): Promise<PaginatedResult<ToolCall>> {
    await this.ensureInitialized()
    return this.client.getSessionToolCalls(sessionId, params)
  }

  /**
   * 删除工具调用
   */
  async deleteToolCall(id: string): Promise<void> {
    await this.ensureInitialized()
    return this.client.deleteToolCall(id)
  }

  // ==================== Token使用统计 ====================

  /**
   * 保存Token使用记录
   */
  async saveTokenUsage(usage: Omit<TokenUsage, 'id' | 'createdAt'> | TokenUsage): Promise<TokenUsage> {
    await this.ensureInitialized()
    return this.client.saveTokenUsage(usage as TokenUsage)
  }

  /**
   * 获取Token使用记录
   */
  async getTokenUsage(params?: PaginationParams): Promise<PaginatedResult<TokenUsage>> {
    await this.ensureInitialized()
    return this.client.getTokenUsage(params)
  }

  /**
   * 获取会话Token使用记录
   */
  async getSessionTokenUsage(sessionId: string): Promise<TokenUsage[]> {
    await this.ensureInitialized()
    return this.client.getSessionTokenUsage(sessionId)
  }

  /**
   * 获取使用统计
   */
  async getUsageStats(period?: string): Promise<{
    totalSessions: number
    totalMessages: number
    totalTokens: number
    totalCost: number
    averageResponseTime: number
    period: string
  }> {
    await this.ensureInitialized()
    return this.client.getUsageStats(period)
  }

  // ==================== 系统管理 ====================

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    await this.ensureInitialized()
    return this.client.healthCheck()
  }

  /**
   * 清除所有数据
   */
  async clearAllData(): Promise<void> {
    await this.ensureInitialized()
    return this.client.clearAllData()
  }

  /**
   * 导出数据
   */
  async exportData(): Promise<any> {
    await this.ensureInitialized()
    return this.client.exportData()
  }

  /**
   * 导入数据
   */
  async importData(data: any): Promise<void> {
    await this.ensureInitialized()
    return this.client.importData(data)
  }

  /**
   * 关闭服务
   */
  async close(): Promise<void> {
    this.initialized = false
  }
}

/**
 * 默认AI Agent数据库服务实例
 */
export const aiAgentDatabaseService = new AIAgentDatabaseService()

/**
 * 默认导出
 */
export default aiAgentDatabaseService