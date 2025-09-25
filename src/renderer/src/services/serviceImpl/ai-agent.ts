/**
 * AI Agent 服务
 * 提供渲染进程调用AI Agent功能的统一接口
 * 直接使用Entity类型进行数据交流
 */

import {
  AgentConfig,
  ChatMessage,
  ChatSession,
  AgentState,
  ToolCall,
  TokenUsage,
  AgentStatus,
  AgentMode,
  MessageRole,
  MessageType,
  SessionStatus,
  ToolCallStatus,
  ToolType,
  UsageType
} from '../../../../shared/entities/agent'
import { ModelConfig } from '../../../../shared/entities/model';

/**
 * IPC通道常量
 */
const AI_AGENT_CHANNELS = {
  // Agent配置管理
  CREATE_AGENT_CONFIG: 'ai-agent:create-agent-config',
  GET_AGENT_CONFIG: 'ai-agent:get-agent-config',
  UPDATE_AGENT_CONFIG: 'ai-agent:update-agent-config',
  DELETE_AGENT_CONFIG: 'ai-agent:delete-agent-config',
  GET_ALL_AGENT_CONFIGS: 'ai-agent:get-all-agent-configs',
  SET_DEFAULT_AGENT_CONFIG: 'ai-agent:set-default-agent-config',
  
  // 模型配置管理
  CREATE_MODEL_CONFIG: 'ai-agent:create-model-config',
  GET_MODEL_CONFIG: 'ai-agent:get-model-config',
  UPDATE_MODEL_CONFIG: 'ai-agent:update-model-config',
  DELETE_MODEL_CONFIG: 'ai-agent:delete-model-config',
  GET_ALL_MODEL_CONFIGS: 'ai-agent:get-all-model-configs',
  TEST_MODEL_CONFIG: 'ai-agent:test-model-config',
  
  // 聊天会话管理
  CREATE_CHAT_SESSION: 'ai-agent:create-chat-session',
  GET_CHAT_SESSION: 'ai-agent:get-chat-session',
  UPDATE_CHAT_SESSION: 'ai-agent:update-chat-session',
  DELETE_CHAT_SESSION: 'ai-agent:delete-chat-session',
  GET_ALL_CHAT_SESSIONS: 'ai-agent:get-all-chat-sessions',
  ARCHIVE_CHAT_SESSION: 'ai-agent:archive-chat-session',
  
  // 消息管理
  SEND_MESSAGE: 'ai-agent:send-message',
  GET_SESSION_MESSAGES: 'ai-agent:get-session-messages',
  DELETE_MESSAGE: 'ai-agent:delete-message',
  SEARCH_MESSAGES: 'ai-agent:search-messages',
  
  // Agent状态管理
  GET_AGENT_STATE: 'ai-agent:get-agent-state',
  UPDATE_AGENT_STATE: 'ai-agent:update-agent-state',
  START_AGENT: 'ai-agent:start-agent',
  STOP_AGENT: 'ai-agent:stop-agent',
  
  // 工具调用管理
  GET_TOOL_CALLS: 'ai-agent:get-tool-calls',
  EXECUTE_TOOL_CALL: 'ai-agent:execute-tool-call',
  CANCEL_TOOL_CALL: 'ai-agent:cancel-tool-call',
  
  // Token使用统计
  GET_TOKEN_USAGE: 'ai-agent:get-token-usage',
  GET_SESSION_TOKEN_USAGE: 'ai-agent:get-session-token-usage',
  GET_USAGE_STATS: 'ai-agent:get-usage-stats',
  
  // 系统管理
  INITIALIZE: 'ai-agent:initialize',
  HEALTH_CHECK: 'ai-agent:health-check',
  SHUTDOWN: 'ai-agent:shutdown'
} as const

/**
 * 连接状态接口
 */
interface ConnectionStatus {
  connected: boolean
  error?: string
  lastCheck: number
}

/**
 * 使用统计接口
 */
interface UsageStats {
  totalSessions: number
  totalMessages: number
  totalTokens: number
  totalCost: number
  averageResponseTime: number
  period: string
}

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
 * AI Agent 服务类
 */
export class AIAgentService {
  private static instance: AIAgentService | null = null
  private eventListeners: Map<string, Set<Function>> = new Map()
  private initialized = false

  private constructor() {
    this.setupEventListeners()
  }

  /**
   * 获取单例实例
   */
  static getInstance(): AIAgentService {
    if (!AIAgentService.instance) {
      AIAgentService.instance = new AIAgentService()
    }
    return AIAgentService.instance
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 监听来自主进程的事件
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.on('ai-agent:message-received', (data) => {
        this.emitEvent('message-received', data)
      })
      
      window.electron.ipcRenderer.on('ai-agent:session-updated', (data) => {
        this.emitEvent('session-updated', data)
      })
      
      window.electron.ipcRenderer.on('ai-agent:agent-state-changed', (data) => {
        this.emitEvent('agent-state-changed', data)
      })
      
      window.electron.ipcRenderer.on('ai-agent:tool-call-completed', (data) => {
        this.emitEvent('tool-call-completed', data)
      })
    }
  }

  /**
   * 调用IPC方法
   */
  private async invoke<T>(channel: string, ...args: any[]): Promise<T> {
    if (!window.electron?.ipcRenderer) {
      throw new Error('Electron IPC not available')
    }
    return window.electron.ipcRenderer.invoke(channel, ...args)
  }

  // ==================== 初始化和系统管理 ====================

  /**
   * 初始化AI Agent服务
   */
  async initialize(): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.invoke<{ success: boolean; error?: string }>(
        AI_AGENT_CHANNELS.INITIALIZE
      )
      this.initialized = result.success
      return result
    } catch (error) {
      console.error('初始化AI Agent服务失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<ConnectionStatus> {
    try {
      const result = await this.invoke<{ healthy: boolean; message?: string }>(
        AI_AGENT_CHANNELS.HEALTH_CHECK
      )
      return {
        connected: result.healthy,
        error: result.message,
        lastCheck: Date.now()
      }
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: Date.now()
      }
    }
  }

  /**
   * 关闭服务
   */
  async shutdown(): Promise<{ success: boolean }> {
    try {
      await this.invoke(AI_AGENT_CHANNELS.SHUTDOWN)
      this.initialized = false
      return { success: true }
    } catch (error) {
      console.error('关闭AI Agent服务失败:', error)
      return { success: false }
    }
  }

  // ==================== Agent配置管理 ====================

  /**
   * 创建Agent配置
   */
  async createAgentConfig(config: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<AgentConfig> {
    return this.invoke<AgentConfig>(AI_AGENT_CHANNELS.CREATE_AGENT_CONFIG, config)
  }

  /**
   * 获取Agent配置
   */
  async getAgentConfig(id: string): Promise<AgentConfig | null> {
    return this.invoke<AgentConfig | null>(AI_AGENT_CHANNELS.GET_AGENT_CONFIG, id)
  }

  /**
   * 更新Agent配置
   */
  async updateAgentConfig(id: string, updates: Partial<AgentConfig>): Promise<AgentConfig> {
    return this.invoke<AgentConfig>(AI_AGENT_CHANNELS.UPDATE_AGENT_CONFIG, id, updates)
  }

  /**
   * 删除Agent配置
   */
  async deleteAgentConfig(id: string): Promise<boolean> {
    return this.invoke<boolean>(AI_AGENT_CHANNELS.DELETE_AGENT_CONFIG, id)
  }

  /**
   * 获取所有Agent配置
   */
  async getAllAgentConfigs(): Promise<AgentConfig[]> {
    return this.invoke<AgentConfig[]>(AI_AGENT_CHANNELS.GET_ALL_AGENT_CONFIGS)
  }

  /**
   * 设置默认Agent配置
   */
  async setDefaultAgentConfig(id: string): Promise<boolean> {
    return this.invoke<boolean>(AI_AGENT_CHANNELS.SET_DEFAULT_AGENT_CONFIG, id)
  }

  // ==================== 模型配置管理 ====================

  /**
   * 创建模型配置
   */
  async createModelConfig(config: Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<ModelConfig> {
    return this.invoke<ModelConfig>(AI_AGENT_CHANNELS.CREATE_MODEL_CONFIG, config)
  }

  /**
   * 获取模型配置
   */
  async getModelConfig(id: string): Promise<ModelConfig | null> {
    return this.invoke<ModelConfig | null>(AI_AGENT_CHANNELS.GET_MODEL_CONFIG, id)
  }

  /**
   * 更新模型配置
   */
  async updateModelConfig(id: string, updates: Partial<ModelConfig>): Promise<ModelConfig> {
    return this.invoke<ModelConfig>(AI_AGENT_CHANNELS.UPDATE_MODEL_CONFIG, id, updates)
  }

  /**
   * 删除模型配置
   */
  async deleteModelConfig(id: string): Promise<boolean> {
    return this.invoke<boolean>(AI_AGENT_CHANNELS.DELETE_MODEL_CONFIG, id)
  }

  /**
   * 获取所有模型配置
   */
  async getAllModelConfigs(): Promise<ModelConfig[]> {
    return this.invoke<ModelConfig[]>(AI_AGENT_CHANNELS.GET_ALL_MODEL_CONFIGS)
  }

  /**
   * 测试模型配置
   */
  async testModelConfig(config: ModelConfig): Promise<{ success: boolean; error?: string; latency?: number }> {
    return this.invoke<{ success: boolean; error?: string; latency?: number }>(
      AI_AGENT_CHANNELS.TEST_MODEL_CONFIG, 
      config
    )
  }

  // ==================== 聊天会话管理 ====================

  /**
   * 创建聊天会话
   */
  async createChatSession(session: Omit<ChatSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<ChatSession> {
    return this.invoke<ChatSession>(AI_AGENT_CHANNELS.CREATE_CHAT_SESSION, session)
  }

  /**
   * 获取聊天会话
   */
  async getChatSession(id: string): Promise<ChatSession | null> {
    return this.invoke<ChatSession | null>(AI_AGENT_CHANNELS.GET_CHAT_SESSION, id)
  }

  /**
   * 更新聊天会话
   */
  async updateChatSession(id: string, updates: Partial<ChatSession>): Promise<ChatSession> {
    return this.invoke<ChatSession>(AI_AGENT_CHANNELS.UPDATE_CHAT_SESSION, id, updates)
  }

  /**
   * 删除聊天会话
   */
  async deleteChatSession(id: string): Promise<boolean> {
    return this.invoke<boolean>(AI_AGENT_CHANNELS.DELETE_CHAT_SESSION, id)
  }

  /**
   * 获取所有聊天会话
   */
  async getAllChatSessions(params?: PaginationParams): Promise<PaginatedResult<ChatSession>> {
    return this.invoke<PaginatedResult<ChatSession>>(AI_AGENT_CHANNELS.GET_ALL_CHAT_SESSIONS, params)
  }

  /**
   * 归档聊天会话
   */
  async archiveChatSession(id: string): Promise<boolean> {
    return this.invoke<boolean>(AI_AGENT_CHANNELS.ARCHIVE_CHAT_SESSION, id)
  }

  // ==================== 消息管理 ====================

  /**
   * 发送消息
   */
  async sendMessage(
    sessionId: string,
    content: string,
    role: MessageRole = MessageRole.USER,
    type: MessageType = MessageType.TEXT
  ): Promise<{ success: boolean; message?: ChatMessage; error?: string }> {
    try {
      const message = await this.invoke<ChatMessage>(
        AI_AGENT_CHANNELS.SEND_MESSAGE,
        {
          sessionId,
          content,
          role,
          type
        }
      )
      return { success: true, message }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * 获取会话消息
   */
  async getSessionMessages(sessionId: string, params?: PaginationParams): Promise<PaginatedResult<ChatMessage>> {
    return this.invoke<PaginatedResult<ChatMessage>>(AI_AGENT_CHANNELS.GET_SESSION_MESSAGES, sessionId, params)
  }

  /**
   * 删除消息
   */
  async deleteMessage(id: string): Promise<boolean> {
    return this.invoke<boolean>(AI_AGENT_CHANNELS.DELETE_MESSAGE, id)
  }

  /**
   * 搜索消息
   */
  async searchMessages(query: string, sessionId?: string, params?: PaginationParams): Promise<PaginatedResult<ChatMessage>> {
    return this.invoke<PaginatedResult<ChatMessage>>(AI_AGENT_CHANNELS.SEARCH_MESSAGES, query, sessionId, params)
  }

  // ==================== Agent状态管理 ====================

  /**
   * 获取Agent状态
   */
  async getAgentState(agentConfigId: string): Promise<AgentState | null> {
    return this.invoke<AgentState | null>(AI_AGENT_CHANNELS.GET_AGENT_STATE, agentConfigId)
  }

  /**
   * 更新Agent状态
   */
  async updateAgentState(agentConfigId: string, updates: Partial<AgentState>): Promise<AgentState> {
    return this.invoke<AgentState>(AI_AGENT_CHANNELS.UPDATE_AGENT_STATE, agentConfigId, updates)
  }

  /**
   * 启动Agent
   */
  async startAgent(agentConfigId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.invoke(AI_AGENT_CHANNELS.START_AGENT, agentConfigId)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * 停止Agent
   */
  async stopAgent(agentConfigId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.invoke(AI_AGENT_CHANNELS.STOP_AGENT, agentConfigId)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // ==================== 工具调用管理 ====================

  /**
   * 获取工具调用记录
   */
  async getToolCalls(sessionId?: string, params?: PaginationParams): Promise<PaginatedResult<ToolCall>> {
    return this.invoke<PaginatedResult<ToolCall>>(AI_AGENT_CHANNELS.GET_TOOL_CALLS, sessionId, params)
  }

  /**
   * 执行工具调用
   */
  async executeToolCall(toolCall: Omit<ToolCall, 'id' | 'createdAt' | 'updatedAt'>): Promise<ToolCall> {
    return this.invoke<ToolCall>(AI_AGENT_CHANNELS.EXECUTE_TOOL_CALL, toolCall)
  }

  /**
   * 取消工具调用
   */
  async cancelToolCall(id: string): Promise<boolean> {
    return this.invoke<boolean>(AI_AGENT_CHANNELS.CANCEL_TOOL_CALL, id)
  }

  // ==================== Token使用统计 ====================

  /**
   * 获取Token使用记录
   */
  async getTokenUsage(sessionId?: string, params?: PaginationParams): Promise<PaginatedResult<TokenUsage>> {
    return this.invoke<PaginatedResult<TokenUsage>>(AI_AGENT_CHANNELS.GET_TOKEN_USAGE, sessionId, params)
  }

  /**
   * 获取会话Token使用统计
   */
  async getSessionTokenUsage(sessionId: string): Promise<TokenUsage[]> {
    return this.invoke<TokenUsage[]>(AI_AGENT_CHANNELS.GET_SESSION_TOKEN_USAGE, sessionId)
  }

  /**
   * 获取使用统计
   */
  async getUsageStats(period?: string): Promise<UsageStats> {
    return this.invoke<UsageStats>(AI_AGENT_CHANNELS.GET_USAGE_STATS, period)
  }

  /**
   * 获取今日使用统计
   */
  async getTodayUsageStats(): Promise<UsageStats> {
    return this.getUsageStats('today')
  }

  // ==================== 事件管理 ====================

  /**
   * 添加事件监听器
   */
  addEventListener(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(callback)
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.delete(callback)
      if (listeners.size === 0) {
        this.eventListeners.delete(event)
      }
    }
  }

  /**
   * 移除所有事件监听器
   */
  removeAllEventListeners(event?: string): void {
    if (event) {
      this.eventListeners.delete(event)
    } else {
      this.eventListeners.clear()
    }
  }

  /**
   * 触发事件
   */
  private emitEvent(event: string, data: any): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`事件监听器执行失败 [${event}]:`, error)
        }
      })
    }
  }

  // ==================== 实用方法 ====================

  /**
   * 检查服务是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * 销毁服务实例
   */
  static destroy(): void {
    if (AIAgentService.instance) {
      AIAgentService.instance.removeAllEventListeners()
      AIAgentService.instance = null
    }
  }
}

/**
 * 默认服务实例
 */
export const aiAgentService = AIAgentService.getInstance()

/**
 * 导出便捷方法
 */
export const {
  initialize,
  healthCheck,
  shutdown,
  createAgentConfig,
  getAgentConfig,
  updateAgentConfig,
  deleteAgentConfig,
  getAllAgentConfigs,
  setDefaultAgentConfig,
  createModelConfig,
  getModelConfig,
  updateModelConfig,
  deleteModelConfig,
  getAllModelConfigs,
  testModelConfig,
  createChatSession,
  getChatSession,
  updateChatSession,
  deleteChatSession,
  getAllChatSessions,
  archiveChatSession,
  sendMessage,
  getSessionMessages,
  deleteMessage,
  searchMessages,
  getAgentState,
  updateAgentState,
  startAgent,
  stopAgent,
  getToolCalls,
  executeToolCall,
  cancelToolCall,
  getTokenUsage,
  getSessionTokenUsage,
  getUsageStats,
  getTodayUsageStats,
  addEventListener,
  removeEventListener,
  removeAllEventListeners
} = aiAgentService

/**
 * 默认导出
 */
export default aiAgentService