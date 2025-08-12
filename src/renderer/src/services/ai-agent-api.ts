/**
 * AI Agent API 服务
 * 处理与AI Agent相关的所有API调用和数据管理
 */

import type {
  ModelConfig,
  AgentConfig,
  ChatMessage,
  ChatSession,
  ToolCall,
  TokenUsage,
  AgentStatus,
  MCPTool,
  MCPServerConfig,
  WritingTemplate,
  WritingTask,
  OptimizationSuggestion,
  ConnectionStatus,
  UsageStats,
  APIResponse,
  PaginatedResult,
  PaginationParams,
  ExportOptions,
  ConfigPreset,
  Notification,
  BatchOperation,
  SearchResult
} from '../types/agent'

import { eventBus, storage, debounce, throttle, generateId, retry } from '../utils/ai-agent'

/**
 * API配置
 */
interface APIConfig {
  baseUrl: string
  timeout: number
  retries: number
  headers?: Record<string, string>
}

/**
 * 默认API配置
 */
const DEFAULT_API_CONFIG: APIConfig = {
  baseUrl: 'http://localhost:3000/api',
  timeout: 30000,
  retries: 3,
  headers: {
    'Content-Type': 'application/json'
  }
}

/**
 * HTTP请求方法
 */
type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

/**
 * 请求选项
 */
interface RequestOptions {
  method?: HTTPMethod
  headers?: Record<string, string>
  body?: any
  timeout?: number
  retries?: number
  signal?: AbortSignal
}

/**
 * 响应拦截器
 */
type ResponseInterceptor = (response: Response) => Promise<Response>

/**
 * 请求拦截器
 */
type RequestInterceptor = (url: string, options: RequestOptions) => Promise<{ url: string; options: RequestOptions }>

/**
 * AI Agent API 客户端
 */
class AIAgentAPIClient {
  private config: APIConfig
  private requestInterceptors: RequestInterceptor[] = []
  private responseInterceptors: ResponseInterceptor[] = []
  private abortControllers: Map<string, AbortController> = new Map()

  constructor(config: Partial<APIConfig> = {}) {
    this.config = { ...DEFAULT_API_CONFIG, ...config }
    this.setupDefaultInterceptors()
  }

  /**
   * 设置默认拦截器
   */
  private setupDefaultInterceptors(): void {
    // 请求拦截器：添加认证头
    this.addRequestInterceptor(async (url, options) => {
      const token = storage.get<string>('ai-agent-token')
      if (token) {
        options.headers = {
          ...options.headers,
          'Authorization': `Bearer ${token}`
        }
      }
      return { url, options }
    })

    // 响应拦截器：处理错误
    this.addResponseInterceptor(async (response) => {
      if (!response.ok) {
        const error = await this.parseError(response)
        throw error
      }
      return response
    })
  }

  /**
   * 添加请求拦截器
   */
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor)
  }

  /**
   * 添加响应拦截器
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor)
  }

  /**
   * 解析错误
   */
  private async parseError(response: Response): Promise<Error> {
    try {
      const errorData = await response.json()
      return new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`)
    } catch {
      return new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  }

  /**
   * 发送HTTP请求
   */
  async request<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const requestId = generateId()
    let url = `${this.config.baseUrl}${endpoint}`
    let requestOptions: RequestOptions = {
      method: 'GET',
      headers: { ...this.config.headers },
      timeout: this.config.timeout,
      retries: this.config.retries,
      ...options
    }

    // 应用请求拦截器
    for (const interceptor of this.requestInterceptors) {
      const result = await interceptor(url, requestOptions)
      url = result.url
      requestOptions = result.options
    }

    // 创建AbortController
    const controller = new AbortController()
    this.abortControllers.set(requestId, controller)
    requestOptions.signal = controller.signal

    try {
      const response = await retry(async () => {
        const fetchOptions: RequestInit = {
          method: requestOptions.method,
          headers: requestOptions.headers,
          signal: requestOptions.signal
        }

        if (requestOptions.body) {
          fetchOptions.body = typeof requestOptions.body === 'string' 
            ? requestOptions.body 
            : JSON.stringify(requestOptions.body)
        }

        // 设置超时
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), requestOptions.timeout)
        })

        const fetchPromise = fetch(url, fetchOptions)
        return Promise.race([fetchPromise, timeoutPromise])
      }, { 
        maxAttempts: requestOptions.retries || 1,
        delay: 1000,
        backoff: true
      })

      // 应用响应拦截器
      let processedResponse = response
      for (const interceptor of this.responseInterceptors) {
        processedResponse = await interceptor(processedResponse)
      }

      const data = await processedResponse.json()
      return data
    } finally {
      this.abortControllers.delete(requestId)
    }
  }

  /**
   * GET请求
   */
  async get<T = any>(endpoint: string, params?: Record<string, any>): Promise<T> {
    let url = endpoint
    if (params) {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value))
        }
      })
      url += `?${searchParams.toString()}`
    }
    return this.request<T>(url, { method: 'GET' })
  }

  /**
   * POST请求
   */
  async post<T = any>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data
    })
  }

  /**
   * PUT请求
   */
  async put<T = any>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data
    })
  }

  /**
   * DELETE请求
   */
  async delete<T = any>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' })
  }

  /**
   * PATCH请求
   */
  async patch<T = any>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data
    })
  }

  /**
   * 取消所有请求
   */
  cancelAllRequests(): void {
    for (const controller of this.abortControllers.values()) {
      controller.abort()
    }
    this.abortControllers.clear()
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<APIConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

/**
 * AI Agent API 服务
 */
class AIAgentAPIService {
  private client: AIAgentAPIClient
  private cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map()
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5分钟

  constructor(config?: Partial<APIConfig>) {
    this.client = new AIAgentAPIClient(config)
    this.setupEventListeners()
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 监听网络状态变化
    window.addEventListener('online', () => {
      eventBus.emit('network-status-changed', { online: true })
    })

    window.addEventListener('offline', () => {
      eventBus.emit('network-status-changed', { online: false })
    })
  }

  /**
   * 缓存数据
   */
  private setCache(key: string, data: any, ttl: number = this.CACHE_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    })
  }

  /**
   * 获取缓存数据
   */
  private getCache<T = any>(key: string): T | null {
    const cached = this.cache.get(key)
    if (!cached) return null

    const now = Date.now()
    if (now - cached.timestamp > cached.ttl) {
      this.cache.delete(key)
      return null
    }

    return cached.data
  }

  /**
   * 清除缓存
   */
  private clearCache(pattern?: string): void {
    if (pattern) {
      const regex = new RegExp(pattern)
      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          this.cache.delete(key)
        }
      }
    } else {
      this.cache.clear()
    }
  }

  // ==================== 连接管理 ====================

  /**
   * 测试连接
   */
  async testConnection(): Promise<ConnectionStatus> {
    try {
      const response = await this.client.get<{ status: string; version: string }>('/health')
      return {
        connected: true,
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
   * 获取连接状态
   */
  async getConnectionStatus(): Promise<ConnectionStatus> {
    const cacheKey = 'connection-status'
    const cached = this.getCache<ConnectionStatus>(cacheKey)
    if (cached) return cached

    const status = await this.testConnection()
    this.setCache(cacheKey, status, 30000) // 30秒缓存
    return status
  }

  // ==================== 模型配置 ====================

  /**
   * 获取模型配置列表
   */
  async getModelConfigs(): Promise<ModelConfig[]> {
    const cacheKey = 'model-configs'
    const cached = this.getCache<ModelConfig[]>(cacheKey)
    if (cached) return cached

    const configs = await this.client.get<ModelConfig[]>('/models')
    this.setCache(cacheKey, configs)
    return configs
  }

  /**
   * 获取单个模型配置
   */
  async getModelConfig(id: string): Promise<ModelConfig> {
    return this.client.get<ModelConfig>(`/models/${id}`)
  }

  /**
   * 创建模型配置
   */
  async createModelConfig(config: Omit<ModelConfig, 'id'>): Promise<ModelConfig> {
    const result = await this.client.post<ModelConfig>('/models', config)
    this.clearCache('model-configs')
    eventBus.emit('model-config-created', result)
    return result
  }

  /**
   * 更新模型配置
   */
  async updateModelConfig(id: string, config: Partial<ModelConfig>): Promise<ModelConfig> {
    const result = await this.client.put<ModelConfig>(`/models/${id}`, config)
    this.clearCache('model-configs')
    eventBus.emit('model-config-updated', result)
    return result
  }

  /**
   * 删除模型配置
   */
  async deleteModelConfig(id: string): Promise<void> {
    await this.client.delete(`/models/${id}`)
    this.clearCache('model-configs')
    eventBus.emit('model-config-deleted', { id })
  }

  /**
   * 测试模型配置
   */
  async testModelConfig(config: ModelConfig): Promise<{ success: boolean; error?: string; latency?: number }> {
    const startTime = Date.now()
    try {
      await this.client.post('/models/test', config)
      return {
        success: true,
        latency: Date.now() - startTime
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // ==================== 聊天会话 ====================

  /**
   * 获取聊天会话列表
   */
  async getChatSessions(params?: PaginationParams): Promise<PaginatedResult<ChatSession>> {
    return this.client.get<PaginatedResult<ChatSession>>('/chat/sessions', params)
  }

  /**
   * 获取单个聊天会话
   */
  async getChatSession(id: string): Promise<ChatSession> {
    return this.client.get<ChatSession>(`/chat/sessions/${id}`)
  }

  /**
   * 创建聊天会话
   */
  async createChatSession(session: Omit<ChatSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<ChatSession> {
    const result = await this.client.post<ChatSession>('/chat/sessions', session)
    eventBus.emit('chat-session-created', result)
    return result
  }

  /**
   * 更新聊天会话
   */
  async updateChatSession(id: string, session: Partial<ChatSession>): Promise<ChatSession> {
    const result = await this.client.put<ChatSession>(`/chat/sessions/${id}`, session)
    eventBus.emit('chat-session-updated', result)
    return result
  }

  /**
   * 删除聊天会话
   */
  async deleteChatSession(id: string): Promise<void> {
    await this.client.delete(`/chat/sessions/${id}`)
    eventBus.emit('chat-session-deleted', { id })
  }

  /**
   * 发送消息
   */
  async sendMessage(sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<ChatMessage> {
    const result = await this.client.post<ChatMessage>(`/chat/sessions/${sessionId}/messages`, message)
    eventBus.emit('message-sent', result)
    return result
  }

  /**
   * 获取会话消息
   */
  async getSessionMessages(sessionId: string, params?: PaginationParams): Promise<PaginatedResult<ChatMessage>> {
    return this.client.get<PaginatedResult<ChatMessage>>(`/chat/sessions/${sessionId}/messages`, params)
  }

  /**
   * 搜索聊天记录
   */
  async searchChatHistory(query: string, params?: PaginationParams): Promise<SearchResult<ChatMessage>> {
    return this.client.get<SearchResult<ChatMessage>>('/chat/search', { query, ...params })
  }

  /**
   * 导出聊天记录
   */
  async exportChatHistory(sessionIds: string[], options: ExportOptions): Promise<Blob> {
    const response = await this.client.post('/chat/export', {
      sessionIds,
      options
    }, {
      headers: {
        'Accept': 'application/octet-stream'
      }
    })
    return new Blob([response])
  }

  // ==================== 工具管理 ====================

  /**
   * 获取可用工具列表
   */
  async getAvailableTools(): Promise<MCPTool[]> {
    const cacheKey = 'available-tools'
    const cached = this.getCache<MCPTool[]>(cacheKey)
    if (cached) return cached

    const tools = await this.client.get<MCPTool[]>('/tools')
    this.setCache(cacheKey, tools)
    return tools
  }

  /**
   * 调用工具
   */
  async callTool(toolName: string, args: Record<string, any>): Promise<any> {
    const result = await this.client.post(`/tools/${toolName}/call`, { args })
    eventBus.emit('tool-called', { toolName, args, result })
    return result
  }

  /**
   * 获取MCP服务器配置
   */
  async getMCPServerConfigs(): Promise<MCPServerConfig[]> {
    return this.client.get<MCPServerConfig[]>('/mcp/servers')
  }

  /**
   * 更新MCP服务器配置
   */
  async updateMCPServerConfig(serverId: string, config: Partial<MCPServerConfig>): Promise<MCPServerConfig> {
    const result = await this.client.put<MCPServerConfig>(`/mcp/servers/${serverId}`, config)
    this.clearCache('available-tools')
    eventBus.emit('mcp-server-updated', result)
    return result
  }

  // ==================== 智能创作 ====================

  /**
   * 获取写作模板
   */
  async getWritingTemplates(): Promise<WritingTemplate[]> {
    const cacheKey = 'writing-templates'
    const cached = this.getCache<WritingTemplate[]>(cacheKey)
    if (cached) return cached

    const templates = await this.client.get<WritingTemplate[]>('/writing/templates')
    this.setCache(cacheKey, templates)
    return templates
  }

  /**
   * 创建写作模板
   */
  async createWritingTemplate(template: Omit<WritingTemplate, 'id'>): Promise<WritingTemplate> {
    const result = await this.client.post<WritingTemplate>('/writing/templates', template)
    this.clearCache('writing-templates')
    eventBus.emit('writing-template-created', result)
    return result
  }

  /**
   * 处理写作任务
   */
  async processWritingTask(task: WritingTask): Promise<{ result: string; suggestions: OptimizationSuggestion[] }> {
    const result = await this.client.post<{ result: string; suggestions: OptimizationSuggestion[] }>('/writing/process', task)
    eventBus.emit('writing-task-processed', { task, result })
    return result
  }

  /**
   * 获取优化建议
   */
  async getOptimizationSuggestions(text: string, type: string): Promise<OptimizationSuggestion[]> {
    return this.client.post<OptimizationSuggestion[]>('/writing/optimize', { text, type })
  }

  // ==================== 统计信息 ====================

  /**
   * 获取使用统计
   */
  async getUsageStats(period?: string): Promise<UsageStats> {
    const cacheKey = `usage-stats-${period || 'default'}`
    const cached = this.getCache<UsageStats>(cacheKey)
    if (cached) return cached

    const stats = await this.client.get<UsageStats>('/stats/usage', { period })
    this.setCache(cacheKey, stats, 60000) // 1分钟缓存
    return stats
  }

  /**
   * 记录使用情况
   */
  async recordUsage(event: string, data?: any): Promise<void> {
    await this.client.post('/stats/record', { event, data, timestamp: Date.now() })
  }

  // ==================== 配置预设 ====================

  /**
   * 获取配置预设
   */
  async getConfigPresets(): Promise<ConfigPreset[]> {
    const cacheKey = 'config-presets'
    const cached = this.getCache<ConfigPreset[]>(cacheKey)
    if (cached) return cached

    const presets = await this.client.get<ConfigPreset[]>('/config/presets')
    this.setCache(cacheKey, presets)
    return presets
  }

  /**
   * 创建配置预设
   */
  async createConfigPreset(preset: Omit<ConfigPreset, 'id'>): Promise<ConfigPreset> {
    const result = await this.client.post<ConfigPreset>('/config/presets', preset)
    this.clearCache('config-presets')
    eventBus.emit('config-preset-created', result)
    return result
  }

  /**
   * 应用配置预设
   */
  async applyConfigPreset(presetId: string): Promise<void> {
    await this.client.post(`/config/presets/${presetId}/apply`)
    eventBus.emit('config-preset-applied', { presetId })
  }

  // ==================== 批量操作 ====================

  /**
   * 执行批量操作
   */
  async executeBatchOperation(operation: BatchOperation): Promise<{ success: number; failed: number; errors: any[] }> {
    const result = await this.client.post<{ success: number; failed: number; errors: any[] }>('/batch', operation)
    eventBus.emit('batch-operation-completed', { operation, result })
    return result
  }

  // ==================== 通知管理 ====================

  /**
   * 获取通知列表
   */
  async getNotifications(params?: PaginationParams): Promise<PaginatedResult<Notification>> {
    return this.client.get<PaginatedResult<Notification>>('/notifications', params)
  }

  /**
   * 标记通知为已读
   */
  async markNotificationAsRead(id: string): Promise<void> {
    await this.client.patch(`/notifications/${id}`, { read: true })
    eventBus.emit('notification-read', { id })
  }

  /**
   * 清除所有通知
   */
  async clearAllNotifications(): Promise<void> {
    await this.client.delete('/notifications')
    eventBus.emit('notifications-cleared')
  }

  // ==================== 实用方法 ====================

  /**
   * 更新API配置
   */
  updateConfig(config: Partial<APIConfig>): void {
    this.client.updateConfig(config)
  }

  /**
   * 取消所有请求
   */
  cancelAllRequests(): void {
    this.client.cancelAllRequests()
  }

  /**
   * 清除所有缓存
   */
  clearAllCache(): void {
    this.cache.clear()
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }
}

/**
 * 创建API服务实例
 */
export function createAIAgentAPIService(config?: Partial<APIConfig>): AIAgentAPIService {
  return new AIAgentAPIService(config)
}

/**
 * 默认API服务实例
 */
export const aiAgentAPI = createAIAgentAPIService()

/**
 * 导出相关类型和类
 */
export {
  AIAgentAPIService,
  AIAgentAPIClient,
  type APIConfig,
  type RequestOptions,
  type ResponseInterceptor,
  type RequestInterceptor
}

/**
 * 默认导出
 */
export default aiAgentAPI