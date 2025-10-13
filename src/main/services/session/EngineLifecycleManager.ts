import { ChatSession } from '../../../shared/entities/agent/ChatSession.entity'
import { AgentConfig } from '../../../shared/entities/agent/AgentConfig.entity'
import { AIAgentEngine } from '../ai-agent/AIAgentEngine'
import {
  IEngineLifecycleManager,
  ISessionConfigLoader,
  ISessionManager,
  EngineInstance,
  SessionCreateOptions,
  SERVICE_TOKENS
} from '../../../shared/cache-types/session/session-manager.types'
import { EngineLifecycleConfig, DEFAULT_CONFIGS, ConfigUtils } from '../../../shared/cache-types/session/service-configs.types'
import { Injectable, serviceContainer } from './ServiceContainer'

@Injectable(SERVICE_TOKENS.ENGINE_LIFECYCLE_MANAGER)
export class EngineLifecycleManager implements IEngineLifecycleManager {
  private engineInstances: Map<string, EngineInstance> = new Map()
  private config: EngineLifecycleConfig
  private configLoader!: ISessionConfigLoader
  private sessionManager!: ISessionManager

  constructor(config?: Partial<EngineLifecycleConfig>) {
    // 使用专门的EngineLifecycleConfig，只包含引擎生命周期相关的配置
    this.config = ConfigUtils.mergeWithDefaults(
      config || {},
      DEFAULT_CONFIGS.engineLifecycle
    )
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    try {
      // 从服务容器获取依赖
      this.configLoader = serviceContainer.get<ISessionConfigLoader>(SERVICE_TOKENS.SESSION_CONFIG_LOADER)
      this.sessionManager = serviceContainer.get<ISessionManager>(SERVICE_TOKENS.SESSION_MANAGER)
      
      // 初始化依赖服务
      await this.configLoader.initialize()
      
      console.log('[EngineLifecycleManager] Initialized successfully')
    } catch (error) {
      console.error('[EngineLifecycleManager] Failed to initialize:', error)
      throw error
    }
  }

  /**
   * 销毁服务
   */
  async destroy(): Promise<void> {
    try {
      // 销毁所有引擎实例
      const destroyPromises = Array.from(this.engineInstances.keys()).map(sessionId => 
        this.destroyForSession(sessionId)
      )
      await Promise.all(destroyPromises)
      
      // 清理引擎映射
      this.engineInstances.clear()
      
      console.log('[EngineLifecycleManager] Destroyed successfully')
    } catch (error) {
      console.error('[EngineLifecycleManager] Failed to destroy:', error)
      throw error
    }
  }

  /**
   * 统一的会话进入和引擎初始化方法
   * 这是新的核心方法，确保会话获取和引擎初始化的正确顺序
   */
  async enterSessionWithEngine(sessionId?: string, options?: SessionCreateOptions): Promise<{
    session: ChatSession
    engine: AIAgentEngine
  }> {
    try {
      // 1. 首先通过SessionManager进入会话
      const session = await this.sessionManager.enterSession(sessionId, options)
      
      // 2. 然后为该会话初始化或获取引擎
      const engine = await this.initializeForSession(session)
      
      console.log('[EngineLifecycleManager] Session entered with engine initialized:', {
        sessionId: session.id,
        title: session.title,
        totalEngines: this.engineInstances.size
      })
      
      return { session, engine }
    } catch (error) {
      console.error('[EngineLifecycleManager] Failed to enter session with engine:', error)
      throw error
    }
  }

  /**
   * 为会话初始化引擎
   */
  async initializeForSession(session: ChatSession): Promise<AIAgentEngine> {
    try {
      // 检查是否已存在引擎实例
      const existingInstance = this.engineInstances.get(session.id)
      if (existingInstance && existingInstance.isActive) {
        existingInstance.lastActivity = new Date()
        return existingInstance.engine
      }

      // 如果不存在引擎实例或实例不活跃，创建新的引擎实例
      console.log('[EngineLifecycleManager] Creating new engine for session:', session.id)
      
      // 加载会话配置
      const agentConfig = await this.configLoader.loadSessionConfig(session.id)
      
      // 创建新的引擎实例
      const engine = new AIAgentEngine()
      
      // 初始化引擎配置
      await this.initializeEngineConfig(engine, agentConfig)
      
      // 创建引擎实例记录
      const engineInstance: EngineInstance = {
        sessionId: session.id,
        engine,
        lastActivity: new Date(),
        isActive: true,
        config: agentConfig
      }

      // 检查引擎数量限制
      await this.enforceEngineLimit()
      
      // 存储引擎实例
      this.engineInstances.set(session.id, engineInstance)
      
      console.log('[EngineLifecycleManager] Engine initialized for session:', {
        sessionId: session.id,
        totalEngines: this.engineInstances.size
      })
      
      return engine
    } catch (error) {
      console.error('[EngineLifecycleManager] Failed to initialize engine for session:', error)
      throw error
    }
  }

  /**
   * 从会话恢复引擎状态
   */
  async restoreFromSession(session: ChatSession): Promise<AIAgentEngine> {
    try {
      const engine = await this.getOrCreateEngine(session.id)
      
      // 重新加载配置
      const agentConfig = await this.configLoader.loadSessionConfig(session.id)
      await this.initializeEngineConfig(engine, agentConfig)
      
      // 更新访问时间
      const instance = this.engineInstances.get(session.id)
      if (instance) {
        instance.lastActivity = new Date()
        instance.isActive = true
      }
      
      console.log('[EngineLifecycleManager] Engine restored from session:', {
        sessionId: session.id
      })
      
      return engine
    } catch (error) {
      console.error('[EngineLifecycleManager] Failed to restore engine from session:', error)
      throw error
    }
  }

  /**
   * 将引擎状态同步到会话
   */
  async syncToSession(sessionId: string): Promise<void> {
    try {
      const instance = this.engineInstances.get(sessionId)
      if (!instance || !instance.isActive) {
        return
      }

      // 这里可以实现引擎状态到数据库的同步
      // 例如：保存当前的对话状态、模型参数等
      
      console.log('[EngineLifecycleManager] Engine state synced to session:', {
        sessionId
      })
    } catch (error) {
      console.error('[EngineLifecycleManager] Failed to sync engine to session:', error)
      throw error
    }
  }

  /**
   * 销毁会话的引擎实例
   */
  async destroyForSession(sessionId: string): Promise<void> {
    try {
      const instance = this.engineInstances.get(sessionId)
      if (!instance) {
        return
      }

      // 先同步状态
      await this.syncToSession(sessionId)
      
      // 标记为非活跃
      instance.isActive = false
      
      // 清理引擎资源
      await this.cleanupEngine(instance.engine)
      
      // 从映射中移除
      this.engineInstances.delete(sessionId)
      
      console.log('[EngineLifecycleManager] Engine destroyed for session:', {
        sessionId,
        remainingEngines: this.engineInstances.size
      })
    } catch (error) {
      console.error('[EngineLifecycleManager] Failed to destroy engine for session:', error)
      throw error
    }
  }

  /**
   * 获取或创建引擎实例
   */
  async getOrCreateEngine(sessionId: string): Promise<AIAgentEngine> {
    try {
      const existingInstance = this.engineInstances.get(sessionId)
      if (existingInstance && existingInstance.isActive) {
        existingInstance.lastActivity = new Date()
        return existingInstance.engine
      }

      // 需要会话信息来创建引擎，这里简化处理
      // 实际使用时应该传入完整的会话对象
      const engine = new AIAgentEngine()
      
      // 使用默认配置初始化
      const defaultConfig = await this.configLoader.loadSystemDefaultConfig()
      await this.initializeEngineConfig(engine, defaultConfig)
      
      const engineInstance: EngineInstance = {
        sessionId,
        engine,
        lastActivity: new Date(),
        isActive: true,
        config: defaultConfig
      }

      await this.enforceEngineLimit()
      this.engineInstances.set(sessionId, engineInstance)
      
      return engine
    } catch (error) {
      console.error('[EngineLifecycleManager] Failed to get or create engine:', error)
      throw error
    }
  }

  /**
   * 初始化引擎 (接口方法)
   */
  async initializeEngine(sessionId: string, config: AgentConfig): Promise<AIAgentEngine> {
    try {
      // 检查是否已存在引擎实例
      const existingInstance = this.engineInstances.get(sessionId)
      if (existingInstance && existingInstance.isActive) {
        existingInstance.lastActivity = new Date()
        return existingInstance.engine
      }

      // 创建新的引擎实例
      const engine = new AIAgentEngine()
      
      // 初始化引擎配置
      await this.initializeEngineConfig(engine, config)
      
      // 创建引擎实例记录
      const engineInstance: EngineInstance = {
        sessionId,
        engine,
        lastActivity: new Date(),
        isActive: true,
        config
      }

      // 检查引擎数量限制
      await this.enforceEngineLimit()
      
      // 存储引擎实例
      this.engineInstances.set(sessionId, engineInstance)
      
      console.log('[EngineLifecycleManager] Engine initialized:', {
        sessionId,
        totalEngines: this.engineInstances.size
      })
      
      return engine
    } catch (error) {
      console.error('[EngineLifecycleManager] Failed to initialize engine:', error)
      throw error
    }
  }

  /**
   * 获取引擎 (接口方法)
   */
  getEngine(sessionId: string): AIAgentEngine | null {
    const instance = this.engineInstances.get(sessionId)
    if (instance && instance.isActive) {
      instance.lastActivity = new Date()
      return instance.engine
    }
    return null
  }

  /**
   * 销毁引擎 (接口方法)
   */
  async destroyEngine(sessionId: string): Promise<void> {
    await this.destroyForSession(sessionId)
  }

  /**
   * 同步引擎状态 (接口方法)
   */
  async syncEngineState(sessionId: string): Promise<void> {
    await this.syncToSession(sessionId)
  }

  /**
   * 从会话恢复引擎 (接口方法)
   */
  async restoreEngineFromSession(session: ChatSession): Promise<AIAgentEngine> {
    return await this.restoreFromSession(session)
  }

  /**
   * 获取活跃的引擎实例
   */
  getActiveEngines(): EngineInstance[] {
    return Array.from(this.engineInstances.values()).filter(instance => instance.isActive)
  }

  /**
   * 获取引擎实例数量
   */
  getEngineCount(): number {
    return this.engineInstances.size
  }

  /**
   * 获取活跃引擎数量
   */
  getActiveEngineCount(): number {
    return Array.from(this.engineInstances.values()).filter(instance => instance.isActive).length
  }

  /**
   * 清理不活跃的引擎实例
   */
  async cleanupInactiveEngines(maxIdleTime?: number): Promise<void> {
    try {
      const idleTimeout = maxIdleTime || this.config.engineIdleTimeout || 30 * 60 * 1000
      const now = new Date()
      const sessionsToCleanup: string[] = []
      
      for (const [sessionId, instance] of this.engineInstances) {
        const idleTime = now.getTime() - instance.lastActivity.getTime()
        
        if (idleTime > idleTimeout || !instance.isActive) {
          sessionsToCleanup.push(sessionId)
        }
      }
      
      for (const sessionId of sessionsToCleanup) {
        await this.destroyForSession(sessionId)
      }
      
      if (sessionsToCleanup.length > 0) {
        console.log('[EngineLifecycleManager] Cleaned up inactive engines:', {
          cleanedCount: sessionsToCleanup.length,
          remainingEngines: this.engineInstances.size
        })
      }
    } catch (error) {
      console.error('[EngineLifecycleManager] Failed to cleanup inactive engines:', error)
    }
  }

  /**
   * 初始化引擎配置
   */
  private async initializeEngineConfig(engine: AIAgentEngine, agentConfig: AgentConfig): Promise<void> {
    try {
      // 转换AgentConfig到引擎配置格式
      const engineConfig = this.convertToEngineConfig(agentConfig)
      
      // 初始化引擎
      await engine.initialize(engineConfig)
      
      console.log('[EngineLifecycleManager] Engine config initialized:', {
        configId: agentConfig.id,
        modelProvider: agentConfig.provider,
        modelName: agentConfig.modelName
      })
    } catch (error) {
      console.error('[EngineLifecycleManager] Failed to initialize engine config:', error)
      throw error
    }
  }

  /**
   * 转换AgentConfig到引擎配置格式
   */
  private convertToEngineConfig(agentConfig: AgentConfig): any {
    // 根据AIAgentEngine的配置格式进行转换
    return {
      modelProvider: agentConfig.provider,
      modelName: agentConfig.modelName,
      apiKey: agentConfig.apiKey,
      baseUrl: agentConfig.baseURL,
      temperature: agentConfig.temperature,
      maxTokens: agentConfig.maxTokens,
      systemPrompt: agentConfig.systemPrompt,
      Tools: agentConfig.tools
      // 添加其他必要的配置字段
    }
  }

  /**
   * 强制执行引擎数量限制
   */
  async enforceEngineLimit(): Promise<void> {
    const maxEngines = this.config.maxEngineInstances || 10
    
    if (this.engineInstances.size >= maxEngines) {
      // 找到最久未访问的引擎
      let oldestSessionId: string | null = null
      let oldestTime = new Date()
      
      for (const [sessionId, instance] of this.engineInstances) {
        if (instance.lastActivity < oldestTime) {
          oldestTime = instance.lastActivity
          oldestSessionId = sessionId
        }
      }
      
      if (oldestSessionId) {
        await this.destroyForSession(oldestSessionId)
        console.log('[EngineLifecycleManager] Enforced engine limit, removed oldest:', {
          removedSessionId: oldestSessionId,
          maxEngines
        })
      }
    }
  }

  /**
   * 清理引擎资源
   */
  private async cleanupEngine(engine: AIAgentEngine): Promise<void> {
    try {
      // 清理对话历史 - 使用公共方法
      engine.clearConversationHistory()
      
      // 如果引擎有cleanup方法，调用它
      if (typeof (engine as any).cleanup === 'function') {
        await (engine as any).cleanup()
      }
      
      // 如果引擎有destroy方法，调用它
      if (typeof (engine as any).destroy === 'function') {
        await (engine as any).destroy()
      }
    } catch (error) {
      console.error('[EngineLifecycleManager] Failed to cleanup engine:', error)
    }
  }
}