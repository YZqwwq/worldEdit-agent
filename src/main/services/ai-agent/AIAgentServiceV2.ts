/**
 * AI Agent服务 V2
 * 集成SessionManager框架的新版本AI Agent服务
 */

import {
  ISessionManager,
  ISessionEventListener,
  SessionEvent,
  SessionEventType,
  SessionCreateOptions,
  SessionFindOptions,
  SessionStats,
  SERVICE_TOKENS
} from '../../../shared/cache-types/session/session-manager.types'
import { SessionManager } from '../session/SessionManager'
import { MessageSyncService } from '../session/MessageSyncService'
import { EngineLifecycleManager } from '../session/EngineLifecycleManager'
import { SessionConfigLoader } from '../session/SessionConfigLoader'
import { serviceContainer } from '../session/ServiceContainer'
import { AIAgentEngine } from './AIAgentEngine'
import { ContextManager } from './ContextManager'
import { ModelAdapter } from './ModelAdapter'
import { MCPToolManager } from './MCPToolManager'
import { PromptPipeline } from '../prompt/PromptPipeline'
import { ToolPromptGenerator } from '../prompt/ToolPromptGenerator'
import { ModelConfigService } from '../ModelConfigService'
import { TypeORMService } from '../database/TypeORMService'

import { MessageRole, MessageType } from '../../../shared/entities'
import type {
  RuntimeAgentState,
  MCPServerConfig,
  MCPTool
} from '../../../shared/cache-types/agent/agent'
import type {
  AgentConfig,
  ChatMessage,
  ChatSession
} from '../../../shared/entities/agent'

// 服务层使用的 AgentConfig 接口
interface ServiceAgentConfig extends Partial<AgentConfig> {
  promptConfig?: any
  enableMCPTools?: boolean
}

/**
 * AI Agent服务 V2
 * 集成会话管理框架，提供完整的会话生命周期管理
 */
export class AIAgentServiceV2 implements ISessionEventListener {
  private sessionManager: ISessionManager // 会话管理器
  private contextManager: ContextManager // 内容管理器
  private modelAdapter: ModelAdapter // 模型适配器
  private toolManager: MCPToolManager // 工具管理器
  private promptPipeline: PromptPipeline | null = null // 提示管道
  private modelConfigService: ModelConfigService // 模型配置服务
  private isInitialized = false // 是否初始化
  private currentConfig: ServiceAgentConfig | null = null // 当前配置
  private typeormService!: TypeORMService // TypeORM服务

  constructor() {}

  /**
   * 初始化服务
   */
  async initializeService(
    typeormService: TypeORMService,
    mcpToolManager: MCPToolManager,
    modelAdapter: ModelAdapter
  ): Promise<void> {
    try {
      if (this.isInitialized) {
        console.warn('[AIAgentServiceV2] Service already initialized')
        return
      }

      this.typeormService = typeormService
      this.toolManager = mcpToolManager
      this.modelAdapter = modelAdapter
      this.contextManager = new ContextManager()
      this.modelConfigService = new ModelConfigService(typeormService)

      // 注册服务到容器
      await this.registerServices()

      // 获取会话管理器
      this.sessionManager = serviceContainer.get<ISessionManager>(SERVICE_TOKENS.SESSION_MANAGER)

      // 初始化会话管理器
      await this.sessionManager.initialize()

      // 注册为会话事件监听器
      this.sessionManager.addEventListener(this)

      this.isInitialized = true
      console.log('[AIAgentServiceV2] Service initialized successfully')
    } catch (error) {
      console.error('[AIAgentServiceV2] Failed to initialize service:', error)
      throw error
    }
  }

  /**
   * 注册服务到容器
   */
  private async registerServices(): Promise<void> {
    // 注册配置加载器
    const configLoader = new SessionConfigLoader(
      this.typeormService,
      {
        maxEngineInstances: 5, // 最大引擎实例数
        engineIdleTimeout: 30 * 60 * 1000, // 引擎空闲超时时间
        defaultSessionTitle: 'New Chat', // 默认会话标题
        autoCleanupInterval: 10 * 60 * 1000, // 自动清理间隔
        messageHistoryLimit: 1000, // 消息历史记录限制
        messageBatchSize: 50, // 消息批量大小
        configCacheSize: 100, // 配置缓存大小
        configCacheTTL: 5 * 60 * 1000, // 配置缓存TTL
        databasePath: './data/sessions.db', // 数据库路径
        enableWAL: true // 启用WAL模式
      }
    )

    // 注册配置加载器
    serviceContainer.registerInstance(SERVICE_TOKENS.SESSION_CONFIG_LOADER, configLoader)

    // 注册引擎生命周期管理器
    const engineLifecycleManager = new EngineLifecycleManager({
      maxEngineInstances: 5,
      engineIdleTimeout: 30 * 60 * 1000
    })
    serviceContainer.registerInstance(SERVICE_TOKENS.ENGINE_LIFECYCLE_MANAGER, engineLifecycleManager)

    // 注册消息同步服务
    const messageSyncService = new MessageSyncService(this.typeormService)
    serviceContainer.registerInstance(SERVICE_TOKENS.MESSAGE_SYNC_SERVICE, messageSyncService)

    // 注册会话管理器
    const sessionManager = new SessionManager(
      this.typeormService,
      {
        maxEngineInstances: 5,
        engineIdleTimeout: 30 * 60 * 1000,
        defaultSessionTitle: 'New Chat',
        autoCleanupInterval: 10 * 60 * 1000,
        messageHistoryLimit: 1000,
        messageBatchSize: 50,
        configCacheSize: 100,
        configCacheTTL: 5 * 60 * 1000,
        databasePath: './data/sessions.db',
        enableWAL: true
      }
    )


    serviceContainer.registerInstance(SERVICE_TOKENS.SESSION_MANAGER, sessionManager)
  }

  /**
   * 初始化服务（可选，用于全局配置）
   */
  async initialize(config?: ServiceAgentConfig): Promise<void> {
    try {
      this.currentConfig = config || {}
      
      // 初始化工具管理器
      if (config?.enableMCPTools) {
        await this.toolManager.initialize()
      }

      // 初始化提示管道
      if (config?.promptConfig) {
        this.promptPipeline = new PromptPipeline(config.promptConfig)
      }

      this.isInitialized = true
      console.log('[AIAgentServiceV2] Service initialized successfully')
    } catch (error) {
      console.error('[AIAgentServiceV2] Failed to initialize service:', error)
      throw error
    }
  }

  /**
   * 进入会话（核心方法）
   */
  async enterSession(sessionId?: string, options?: SessionCreateOptions): Promise<{
    session: ChatSession
    engine: AIAgentEngine
  }> {
    try {
      // 使用SessionManager进入会话
      const session = await this.sessionManager.enterSession(sessionId, options)
      
      // 获取当前会话的引擎实例
      const engine = await this.getSessionEngine(session.id)
      
      console.log('[AIAgentServiceV2] Entered session successfully:', {
        sessionId: session.id,
        title: session.title
      })
      
      return { session, engine }
    } catch (error) {
      console.error('[AIAgentServiceV2] Failed to enter session:', error)
      throw error
    }
  }

  /**
   * 发送消息
   */
  async sendMessage(
    message: string, 
    sessionId?: string,
    options?: {
      type?: MessageType
      metadata?: any
    }
  ): Promise<{
    response: string
    messageId: string
    sessionId: string
    session: ChatSession
  }> {
    try {
      // 确保有活跃会话
      let currentSession = this.sessionManager.getActiveSession()
      if (!currentSession || (sessionId && currentSession.id !== sessionId)) {
        const result = await this.enterSession(sessionId)
        currentSession = result.session
      }

      // 获取会话引擎
      const engine = await this.getSessionEngine(currentSession.id)
      
      // 创建用户消息
      const userMessage: Partial<ChatMessage> = {
        type: options?.type || MessageType.TEXT,
        role: MessageRole.USER,
        content: message,
        metadata: options?.metadata,
        createdAt: new Date()
      }

      // 同步用户消息
      await this.syncMessage(currentSession.id, userMessage as ChatMessage)
      
      // 发送消息到引擎并获取响应
      const response = await engine.sendMessage(message)
      
      // 创建助手消息
      const assistantMessage: Partial<ChatMessage> = {
        type: MessageType.TEXT,
        role: MessageRole.ASSISTANT,
        content: response,
        createdAt: new Date()
      }

      // 同步助手消息
      await this.syncMessage(currentSession.id, assistantMessage as ChatMessage)
      
      // 更新会话活跃时间
      await this.sessionManager.updateSessionActivity(currentSession.id)
      
      return {
        response,
        messageId: this.generateMessageId(),
        sessionId: currentSession.id,
        session: currentSession
      }
    } catch (error) {
      console.error('[AIAgentServiceV2] Failed to send message:', error)
      throw error
    }
  }

  /**
   * 创建新会话
   */
  async createSession(options?: SessionCreateOptions): Promise<ChatSession> {
    try {
      return await this.sessionManager.createSession(options)
    } catch (error) {
      console.error('[AIAgentServiceV2] Failed to create session:', error)
      throw error
    }
  }

  /**
   * 切换会话
   */
  async switchSession(sessionId: string): Promise<ChatSession> {
    try {
      return await this.sessionManager.switchSession(sessionId)
    } catch (error) {
      console.error('[AIAgentServiceV2] Failed to switch session:', error)
      throw error
    }
  }

  /**
   * 关闭会话
   */
  async closeSession(sessionId: string): Promise<void> {
    try {
      await this.sessionManager.closeSession(sessionId)
    } catch (error) {
      console.error('[AIAgentServiceV2] Failed to close session:', error)
      throw error
    }
  }

  /**
   * 获取会话列表
   */
  async getSessions(options?: SessionFindOptions): Promise<ChatSession[]> {
    try {
      return await this.sessionManager.findSessions(options)
    } catch (error) {
      console.error('[AIAgentServiceV2] Failed to get sessions:', error)
      return []
    }
  }

  /**
   * 获取当前活跃会话
   */
  getCurrentSession(): ChatSession | null {
    return this.sessionManager.getActiveSession()
  }

  /**
   * 获取会话统计信息
   */
  async getSessionStats(sessionId: string) {
    try {
      return await this.sessionManager.getSessionStats(sessionId)
    } catch (error) {
      console.error('[AIAgentServiceV2] Failed to get session stats:', error)
      return null
    }
  }

  /**
   * 归档会话
   */
  async archiveSession(sessionId: string): Promise<void> {
    try {
      await this.sessionManager.archiveSession(sessionId)
    } catch (error) {
      console.error('[AIAgentServiceV2] Failed to archive session:', error)
      throw error
    }
  }

  /**
   * 更新会话配置
   */
  async updateSessionConfig(sessionId: string, configId: string): Promise<void> {
    try {
      // 这里需要实现配置更新逻辑
      // 包括重新初始化引擎等
      console.log('[AIAgentServiceV2] Session config updated:', { sessionId, configId })
    } catch (error) {
      console.error('[AIAgentServiceV2] Failed to update session config:', error)
      throw error
    }
  }

  /**
   * 获取运行时状态
   */
  getState(): RuntimeAgentState {
    const currentSession = this.getCurrentSession()
    
    return {
      isInitialized: this.isInitialized,
      currentSessionId: currentSession?.id || null,
      sessionCount: 0, // 需要实现
      messageCount: 0, // 需要实现
      lastActivity: currentSession?.updatedAt || null,
      config: this.currentConfig
    }
  }

  /**
   * MCP工具相关方法
   */
  async registerMCPServer(config: MCPServerConfig): Promise<void> {
    try {
      await this.toolManager.registerServer(config)
    } catch (error) {
      console.error('[AIAgentServiceV2] Failed to register MCP server:', error)
      throw error
    }
  }

  getAvailableTools(): MCPTool[] {
    return this.toolManager.getAvailableTools()
  }

  /**
   * 模型配置相关方法（保持向后兼容）
   */
  async getModelConfig(id: string): Promise<Partial<AgentConfig> | null> {
    try {
      return await this.modelConfigService.getConfig(id)
    } catch (error) {
      console.error('[AIAgentServiceV2] Failed to get model config:', error)
      return null
    }
  }

  async getAllModelConfigs(): Promise<Partial<AgentConfig>[]> {
    try {
      return await this.modelConfigService.getAllConfigs()
    } catch (error) {
      console.error('[AIAgentServiceV2] Failed to get all model configs:', error)
      return []
    }
  }

  async createModelConfig(configData: Partial<AgentConfig>): Promise<Partial<AgentConfig>> {
    try {
      return await this.modelConfigService.createConfig(configData)
    } catch (error) {
      console.error('[AIAgentServiceV2] Failed to create model config:', error)
      throw error
    }
  }

  async updateModelConfig(id: string, configData: Partial<AgentConfig>): Promise<Partial<AgentConfig> | null> {
    try {
      return await this.modelConfigService.updateConfig(id, configData)
    } catch (error) {
      console.error('[AIAgentServiceV2] Failed to update model config:', error)
      return null
    }
  }

  async deleteModelConfig(id: string): Promise<boolean> {
    try {
      return await this.modelConfigService.deleteConfig(id)
    } catch (error) {
      console.error('[AIAgentServiceV2] Failed to delete model config:', error)
      return false
    }
  }

  /**
   * 工具方法
   */
  isReady(): boolean {
    return this.isInitialized
  }

  estimateTokens(text: string): number {
    return this.modelAdapter.estimateTokens(text)
  }

  getSupportedModels() {
    return this.modelAdapter.getSupportedModels()
  }

  /**
   * 清理资源
   */
  async destroy(): void {
    try {
      if (!this.isInitialized) {
        return
      }

      // 关闭所有活跃会话
      const currentSession = this.getCurrentSession()
      if (currentSession) {
        await this.closeSession(currentSession.id)
      }

      // 销毁会话管理器
      if (this.sessionManager) {
        await this.sessionManager.destroy()
      }

      // 清理工具管理器
      if (this.toolManager) {
        this.toolManager.destroy()
      }

      // 清理服务容器
      serviceContainer.clear()

      this.isInitialized = false
      console.log('[AIAgentServiceV2] Service destroyed successfully')
    } catch (error) {
      console.error('[AIAgentServiceV2] Failed to destroy service:', error)
    }
  }

  /**
   * 会话事件监听器实现
   */
  async onSessionEvent(event: SessionEvent): Promise<void> {
    try {
      console.log('[AIAgentServiceV2] Session event received:', event.type, event.sessionId)
      
      switch (event.type) {
        case SessionEventType.SESSION_CREATED:
          console.log('[AIAgentServiceV2] New session created:', event.data?.session?.title)
          break
          
        case SessionEventType.SESSION_ENTERED:
          console.log('[AIAgentServiceV2] Session entered:', event.data?.session?.title)
          break
          
        case SessionEventType.SESSION_SWITCHED:
          console.log('[AIAgentServiceV2] Session switched to:', event.data?.session?.title)
          break
          
        case SessionEventType.SESSION_CLOSED:
          console.log('[AIAgentServiceV2] Session closed:', event.sessionId)
          break
          
        case SessionEventType.SESSION_ARCHIVED:
          console.log('[AIAgentServiceV2] Session archived:', event.sessionId)
          break
          
        default:
          console.log('[AIAgentServiceV2] Unknown session event:', event.type)
      }
    } catch (error) {
      console.error('[AIAgentServiceV2] Failed to handle session event:', error)
    }
  }

  /**
   * 私有辅助方法
   */
  private async getSessionEngine(sessionId: string): Promise<AIAgentEngine> {
    // 这里需要通过EngineLifecycleManager获取引擎实例
    // 暂时返回一个新实例，实际应该从生命周期管理器获取
    return new AIAgentEngine()
  }

  private async syncMessage(sessionId: string, message: ChatMessage): Promise<void> {
    // 这里需要通过MessageSyncService同步消息
    // 暂时只记录日志，实际应该调用消息同步服务
    console.log('[AIAgentServiceV2] Message synced:', {
      sessionId,
      messageType: message.type,
      role: message.role
    })
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}