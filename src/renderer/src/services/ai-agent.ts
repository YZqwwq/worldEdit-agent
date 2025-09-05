/**
 * AI Agent API服务
 * 提供渲染进程调用AI Agent功能的统一接口
 */

import type {
  AgentConfig,
  ChatMessage,
  ChatSession,
  AgentState,
  ModelConfig,
  MCPServerConfig,
  MCPTool,
  ConnectionStatus,
  UsageStats
} from '../../../shared/types/agent'

/**
 * AI Agent API服务类
 */
export class AIAgentAPIService {
  private static instance: AIAgentAPIService | null = null
  private eventListeners: Map<string, Set<Function>> = new Map()

  private constructor() {
    this.setupEventListeners()
  }

  /**
   * 获取单例实例
   */
  static getInstance(): AIAgentAPIService {
    if (!AIAgentAPIService.instance) {
      AIAgentAPIService.instance = new AIAgentAPIService()
    }
    return AIAgentAPIService.instance
  }

  // ==================== 服务管理 ====================

  /**
   * 初始化AI Agent服务
   */
  async initialize(config: AgentConfig): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await window.electron.ipcRenderer.invoke('ai-agent:initialize', config)
      return result
    } catch (error) {
      console.error('初始化AI Agent服务失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '初始化失败'
      }
    }
  }

  /**
   * 获取当前状态
   */
  async getState(): Promise<AgentState | null> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:get-state')
    } catch (error) {
      console.error('获取状态失败:', error)
      return null
    }
  }

  /**
   * 更新配置
   */
  async updateConfig(newConfig: Partial<AgentConfig>): Promise<{ success: boolean; error?: string }> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:update-config', newConfig)
    } catch (error) {
      console.error('更新配置失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '更新配置失败'
      }
    }
  }

  /**
   * 销毁服务
   */
  async destroy(): Promise<{ success: boolean }> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:destroy')
    } catch (error) {
      console.error('销毁服务失败:', error)
      return { success: false }
    }
  }

  // ==================== 对话管理 ====================

  /**
   * 发送消息
   */
  async sendMessage(
    message: string,
    sessionId?: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:send-message', message, sessionId)
    } catch (error) {
      console.error('发送消息失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '发送消息失败'
      }
    }
  }

  /**
   * 创建会话
   */
  async createSession(title?: string): Promise<ChatSession | null> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:create-session', title)
    } catch (error) {
      console.error('创建会话失败:', error)
      return null
    }
  }

  /**
   * 获取所有会话
   */
  async getAllSessions(): Promise<ChatSession[]> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:get-all-sessions')
    } catch (error) {
      console.error('获取会话列表失败:', error)
      return []
    }
  }

  /**
   * 获取会话消息
   */
  async getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:get-session-messages', sessionId)
    } catch (error) {
      console.error('获取会话消息失败:', error)
      return []
    }
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:delete-session', sessionId)
    } catch (error) {
      console.error('删除会话失败:', error)
      return false
    }
  }

  /**
   * 更新会话标题
   */
  async updateSessionTitle(sessionId: string, title: string): Promise<boolean> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:update-session-title', sessionId, title)
    } catch (error) {
      console.error('更新会话标题失败:', error)
      return false
    }
  }

  /**
   * 清空所有会话
   */
  async clearAllSessions(): Promise<boolean> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:clear-all-sessions')
    } catch (error) {
      console.error('清空会话失败:', error)
      return false
    }
  }

  // ==================== 模型管理 ====================

  /**
   * 验证模型配置
   */
  async validateModelConfig(config: ModelConfig): Promise<boolean> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:validate-model-config', config)
    } catch (error) {
      console.error('验证模型配置失败:', error)
      return false
    }
  }

  /**
   * 获取模型信息
   */
  async getModelInfo() {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:get-model-info')
    } catch (error) {
      console.error('获取模型信息失败:', error)
      return null
    }
  }

  /**
   * 获取支持的模型列表
   */
  async getSupportedModels() {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:get-supported-models')
    } catch (error) {
      console.error('获取支持的模型列表失败:', error)
      return {}
    }
  }

  /**
   * 估算令牌数量
   */
  async estimateTokens(text: string): Promise<number> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:estimate-tokens', text)
    } catch (error) {
      console.error('估算令牌数量失败:', error)
      return 0
    }
  }

  /**
   * 获取连接状态
   */
  async getConnectionStatus(): Promise<ConnectionStatus> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:get-connection-status')
    } catch (error) {
      console.error('获取连接状态失败:', error)
      return {
        connected: false,
        error: error instanceof Error ? error.message : '获取连接状态失败'
      }
    }
  }

  /**
   * 更新模型配置
   */
  async updateModelConfig(id: string, config: Partial<ModelConfig>): Promise<ModelConfig> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:update-model-config', id, config)
    } catch (error) {
      console.error('更新模型配置失败:', error)
      throw error
    }
  }

  /**
   * 获取今日使用统计
   */
  async getTodayUsageStats(): Promise<UsageStats> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:get-today-usage-stats')
    } catch (error) {
      console.error('获取今日使用统计失败:', error)
      return {
        messages: 0,
        totalMessages: 0,
        tokens: 0,
        totalTokens: 0,
        sessions: 0,
        totalSessions: 0,
        todaySessions: 0,
        weekSessions: 0,
        monthSessions: 0,
        averageMessagesPerSession: 0,
        averageTokensPerSession: 0
      }
    }
  }

  /**
   * 获取模型配置
   */
  async getModelConfig(id: string): Promise<ModelConfig> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:get-model-config', id)
    } catch (error) {
      console.error('获取模型配置失败:', error)
      throw error
    }
  }

  /**
   * 获取所有模型配置
   */
  async getAllModelConfigs(): Promise<ModelConfig[]> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:get-all-model-configs')
    } catch (error) {
      console.error('获取所有模型配置失败:', error)
      return []
    }
  }

  /**
   * 创建模型配置
   */
  async createModelConfig(configData: Partial<ModelConfig>): Promise<ModelConfig | null> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:create-model-config', configData)
    } catch (error) {
      console.error('创建模型配置失败:', error)
      throw error
    }
  }

  /**
   * 删除模型配置
   */
  async deleteModelConfig(id: string): Promise<boolean> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:delete-model-config', id)
    } catch (error) {
      console.error('删除模型配置失败:', error)
      return false
    }
  }

  /**
   * 设置默认模型配置
   */
  async setDefaultModelConfig(id: string): Promise<boolean> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:set-default-model-config', id)
    } catch (error) {
      console.error('设置默认模型配置失败:', error)
      return false
    }
  }

  // ==================== 工具管理 ====================

  /**
   * 注册MCP服务器
   */
  async registerMCPServer(config: MCPServerConfig): Promise<{ success: boolean; error?: string }> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:register-mcp-server', config)
    } catch (error) {
      console.error('注册MCP服务器失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '注册MCP服务器失败'
      }
    }
  }

  /**
   * 获取可用工具列表
   */
  async getAvailableTools(): Promise<MCPTool[]> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:get-available-tools')
    } catch (error) {
      console.error('获取可用工具列表失败:', error)
      return []
    }
  }

  // ==================== 数据管理 ====================

  /**
   * 搜索消息
   */
  async searchMessages(query: string, sessionId?: string): Promise<ChatMessage[]> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:search-messages', query, sessionId)
    } catch (error) {
      console.error('搜索消息失败:', error)
      return []
    }
  }

  /**
   * 获取会话统计
   */
  async getSessionStats(sessionId?: string) {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:get-session-stats', sessionId)
    } catch (error) {
      console.error('获取会话统计失败:', error)
      return null
    }
  }

  /**
   * 获取全局统计
   */
  async getGlobalStats() {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:get-global-stats')
    } catch (error) {
      console.error('获取全局统计失败:', error)
      return null
    }
  }

  /**
   * 导出会话
   */
  async exportSession(sessionId: string): Promise<ChatSession | null> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:export-session', sessionId)
    } catch (error) {
      console.error('导出会话失败:', error)
      return null
    }
  }

  /**
   * 导入会话
   */
  async importSession(sessionData: ChatSession): Promise<boolean> {
    try {
      return await window.electron.ipcRenderer.invoke('ai-agent:import-session', sessionData)
    } catch (error) {
      console.error('导入会话失败:', error)
      return false
    }
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
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 状态变化事件
    window.electron.ipcRenderer.on('ai-agent:state-changed', (event, state: AgentState) => {
      this.emitEvent('state-changed', state)
    })

    // 消息接收事件
    window.electron.ipcRenderer.on('ai-agent:message-received', (event, data: any) => {
      this.emitEvent('message-received', data)
    })

    // 错误事件
    window.electron.ipcRenderer.on('ai-agent:error-occurred', (event, error: string) => {
      this.emitEvent('error-occurred', error)
    })
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

  /**
   * 销毁API服务
   */
  static destroy(): void {
    if (AIAgentAPIService.instance) {
      AIAgentAPIService.instance.removeAllEventListeners()
      AIAgentAPIService.instance = null
    }
  }
}

// 导出单例实例
export const aiAgentAPI = AIAgentAPIService.getInstance()

// 导出便捷方法
export const {
  initialize,
  getState,
  updateConfig,
  destroy,
  sendMessage,
  createSession,
  getAllSessions,
  getSessionMessages,
  deleteSession,
  updateSessionTitle,
  clearAllSessions,
  validateModelConfig,
  getModelInfo,
  getSupportedModels,
  estimateTokens,
  getConnectionStatus,
  updateModelConfig,
  getTodayUsageStats,
  getModelConfig,
  getAllModelConfigs,
  createModelConfig,
  deleteModelConfig,
  setDefaultModelConfig,
  registerMCPServer,
  getAvailableTools,
  searchMessages,
  getSessionStats,
  getGlobalStats,
  exportSession,
  importSession,
  addEventListener,
  removeEventListener,
  removeAllEventListeners
} = aiAgentAPI