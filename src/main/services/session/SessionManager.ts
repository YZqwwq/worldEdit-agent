import { Repository } from 'typeorm'
import { ChatSession } from '../../../shared/entities/agent/ChatSession.entity'
import { ChatMessage } from '../../../shared/entities/agent/ChatMessage.entity'
import { AgentConfig } from '../../../shared/entities/agent/AgentConfig.entity'
import {
  ISessionManager,
  IEngineLifecycleManager,
  IMessageSyncService,
  ISessionConfigLoader,
  ISessionEventListener,
  SessionCreateOptions,
  SessionFindOptions,
  SessionStats,
  SessionStatus,
  SessionEvent,
  SessionEventType,
  SessionManagerConfig,
  SERVICE_TOKENS
} from '../../../shared/cache-types/session/session-manager.types'
import { TypeORMService } from '../database/TypeORMService'
import { Injectable, serviceContainer } from './ServiceContainer'

@Injectable(SERVICE_TOKENS.SESSION_MANAGER)
export class SessionManager implements ISessionManager {
  private currentSession: ChatSession | null = null
  private eventListeners: ISessionEventListener[] = []
  private config: SessionManagerConfig
  private cleanupTimer: NodeJS.Timeout | null = null
  private engineLifecycleManager!: IEngineLifecycleManager
  private messageSyncService!: IMessageSyncService
  private configLoader!: ISessionConfigLoader
  private sessionRepository!: Repository<ChatSession>
  private messageRepository!: Repository<ChatMessage>
  private agentConfigRepository!: Repository<AgentConfig>

  constructor(
    private typeormService: TypeORMService,
    config?: Partial<SessionManagerConfig>
  ) {
    this.config = {
      maxEngineInstances: 5,
      engineIdleTimeout: 30 * 60 * 1000, // 30分钟
      autoCleanupInterval: 10 * 60 * 1000, // 10分钟
      defaultSessionTitle: '新对话',
      enableEventLogging: true,
      messageHistoryLimit: 1000,
      messageBatchSize: 50,
      configCacheSize: 100,
      configCacheTTL: 5 * 60 * 1000, // 5分钟
      databasePath: './data/sessions.db',
      enableWAL: true,
      ...config
    }
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    try {
      // 从服务容器获取依赖
      this.engineLifecycleManager = serviceContainer.get<IEngineLifecycleManager>(SERVICE_TOKENS.ENGINE_LIFECYCLE_MANAGER)
      this.messageSyncService = serviceContainer.get<IMessageSyncService>(SERVICE_TOKENS.MESSAGE_SYNC_SERVICE)
      this.configLoader = serviceContainer.get<ISessionConfigLoader>(SERVICE_TOKENS.SESSION_CONFIG_LOADER)
      
      // 获取数据库仓库
      this.sessionRepository = this.typeormService.getRepository(ChatSession)
      this.messageRepository = this.typeormService.getRepository(ChatMessage)
      this.agentConfigRepository = this.typeormService.getRepository(AgentConfig)
      
      // 初始化依赖服务
      await this.engineLifecycleManager.initialize()
      await this.messageSyncService.initialize()
      await this.configLoader.initialize()
      
      // 启动清理定时器
      this.startCleanupTimer()
      
      console.log('[SessionManager] Initialized successfully')
    } catch (error) {
      console.error('[SessionManager] Failed to initialize:', error)
      throw error
    }
  }

  async cleanupInactiveSessions(): Promise<void> {
    try {
      // 清理过期的引擎实例
      await this.engineLifecycleManager.cleanupInactiveEngines()
    } catch (error) {
      console.error('[SessionManager] Failed to cleanup inactive sessions:', error)
      throw error
    }
  }

  /**
   * 销毁服务
   */
  async destroy(): Promise<void> {
    try {
      // 停止清理定时器
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer)
        this.cleanupTimer = null
      }
      
      // 关闭当前活跃会话
      if (this.currentSession) {
        await this.closeSession(this.currentSession.id)
      }
      
      // 清理事件监听器
      this.eventListeners = []
      
      console.log('[SessionManager] Destroyed successfully')
    } catch (error) {
      console.error('[SessionManager] Failed to destroy:', error)
      throw error
    }
  }

  /**
   * 启动清理定时器
   */
  private startCleanupTimer(): void {
    if (this.config.autoCleanupInterval) {
      this.cleanupTimer = setInterval(() => {
        this.cleanupInactiveSessions()
      }, this.config.autoCleanupInterval)
    }
  }

  /**
   * 进入会话（查找现有或创建新会话）
   */
  async enterSession(sessionId?: string, options?: SessionCreateOptions): Promise<ChatSession> {
    let session: ChatSession | null = null

    try {
      if (sessionId) {
        // 尝试查找指定会话
        session = await this.findSessionById(sessionId)
        if (!session) {
          throw new Error(`Session with id ${sessionId} not found`)
        }
      } else {
        // 查找最后活跃的会话
        session = await this.getLastActiveSession(options?.userId)
      }

      // 如果没有找到会话，创建新会话
      if (!session) {
        session = await this.createSession(options)
      }

      // 初始化引擎
      await this.engineLifecycleManager.initializeEngine(session.id, session.agentConfig)

      // 恢复对话历史
      await this.messageSyncService.loadMessageHistory(session.id)

      // 更新会话活跃时间
      await this.updateSessionActivity(session.id)

      // 设置为当前会话
      this.currentSession = session

      // 触发事件
      await this.emitEvent({
        type: SessionEventType.SESSION_ENTERED,
        sessionId: session.id,
        timestamp: new Date(),
        data: { session }
      })

      return session
    } catch (error) {
      console.error('[SessionManager] Failed to enter session:', error)
      throw error
    }
  }

  /**
   * 创建新会话
   */
  async createSession(options?: SessionCreateOptions): Promise<ChatSession> {
    try {
      // 获取或创建默认配置
      let agentConfig: AgentConfig | null
      if (options?.agentConfigId) {
        agentConfig =  await this.agentConfigRepository.findOne({
          where: { id: options.agentConfigId }
        })
        // 当配置不存在时抛出错误
        if (!agentConfig) {
          throw new Error(`AgentConfig with id ${options.agentConfigId} not found`)
        }
      } else {
        // 当用户ID不存在时，使用空字符串
        // 当用户配置不存在时，使用系统默认配置
        agentConfig = await this.configLoader.loadUserDefaultConfig(options?.userId || '') ||
                     await this.configLoader.loadSystemDefaultConfig()
      }

      // 创建会话
      const session = this.sessionRepository.create({
        title: options?.title || this.config.defaultSessionTitle,
        agentConfigId: agentConfig.id,
        status: SessionStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      const savedSession = await this.sessionRepository.save(session)

      // 触发事件
      await this.emitEvent({
        type: SessionEventType.SESSION_CREATED,
        sessionId: savedSession.id,
        timestamp: new Date(),
        data: { session: savedSession, options }
      })

      return savedSession
    } catch (error) {
      console.error('[SessionManager] Failed to create session:', error)
      throw error
    }
  }

  /**
   * 切换到指定会话
   */
  async switchSession(sessionId: string): Promise<ChatSession> {
    try {
      const session = await this.findSessionById(sessionId)
      if (!session) {
        throw new Error(`Session with id ${sessionId} not found`)
      }

      // 如果有当前会话，先保存状态
      if (this.currentSession) {
        await this.engineLifecycleManager.syncToSession(this.currentSession.id)
      }

      // 切换到新会话
      const engine = await this.engineLifecycleManager.getOrCreateEngine(sessionId)
      await this.engineLifecycleManager.restoreFromSession(session)

      // 加载消息历史
      await this.messageSyncService.loadMessageHistory(sessionId)

      // 更新活跃时间
      await this.updateSessionActivity(sessionId)

      this.currentSession = session

      // 触发事件
      await this.emitEvent({
        type: SessionEventType.SESSION_SWITCHED,
        sessionId: session.id,
        timestamp: new Date(),
        data: { session }
      })

      return session
    } catch (error) {
      console.error('[SessionManager] Failed to switch session:', error)
      throw error
    }
  }

  /**
   * 关闭会话
   */
  async closeSession(sessionId: string): Promise<void> {
    try {
      // 同步引擎状态
      await this.engineLifecycleManager.syncToSession(sessionId)

      // 销毁引擎实例
      await this.engineLifecycleManager.destroyForSession(sessionId)

      // 更新会话状态
      await this.sessionRepository.update(sessionId, {
        status: SessionStatus.INACTIVE,
        updatedAt: new Date()
      })

      // 如果是当前会话，清空当前会话
      if (this.currentSession?.id === sessionId) {
        this.currentSession = null
      }

      // 触发事件
      await this.emitEvent({
        type: SessionEventType.SESSION_CLOSED,
        sessionId,
        timestamp: new Date()
      })
    } catch (error) {
      console.error('[SessionManager] Failed to close session:', error)
      throw error
    }
  }

  /**
   * 获取当前活跃会话
   */
  getActiveSession(): ChatSession | null {
    return this.currentSession
  }

  /**
   * 获取用户的最后活跃会话
   */
  async getLastActiveSession(userId?: string): Promise<ChatSession | null> {
    try {
      const queryBuilder = this.sessionRepository
        .createQueryBuilder('session')
        .leftJoinAndSelect('session.agentConfig', 'agentConfig')
        .where('session.status = :status', { status: SessionStatus.ACTIVE })
        .orderBy('session.updatedAt', 'DESC')
        .limit(1)

      if (userId) {
        queryBuilder.andWhere('session.userId = :userId', { userId })
      }

      return await queryBuilder.getOne()
    } catch (error) {
      console.error('[SessionManager] Failed to get last active session:', error)
      return null
    }
  }

  /**
   * 查找会话列表
   */
  async findSessions(options?: SessionFindOptions): Promise<ChatSession[]> {
    try {
      const queryBuilder = this.sessionRepository
        .createQueryBuilder('session')
        .leftJoinAndSelect('session.agentConfig', 'agentConfig')
        .orderBy('session.updatedAt', 'DESC')

      if (options?.userId) {
        queryBuilder.andWhere('session.userId = :userId', { userId: options.userId })
      }

      if (options?.status) {
        queryBuilder.andWhere('session.status = :status', { status: options.status })
      }

      if (options?.limit) {
        queryBuilder.limit(options.limit)
      }

      if (options?.offset) {
        queryBuilder.offset(options.offset)
      }

      return await queryBuilder.getMany()
    } catch (error) {
      console.error('[SessionManager] Failed to find sessions:', error)
      return []
    }
  }

  /**
   * 获取会话统计信息
   */
  async getSessionStats(sessionId: string): Promise<SessionStats> {
    try {
      const session = await this.findSessionById(sessionId)
      if (!session) {
        throw new Error(`Session with id ${sessionId} not found`)
      }

      const messageStats = await this.messageSyncService.getMessageStats(sessionId)
      
      // 计算会话持续时间
      const duration = session.updatedAt.getTime() - session.createdAt.getTime()

      // TODO: 实现token使用统计
      const tokenUsage = {
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0
      }

      return {
        messageCount: messageStats.count,
        tokenUsage,
        lastActivity: session.updatedAt,
        duration
      }
    } catch (error) {
      console.error('[SessionManager] Failed to get session stats:', error)
      throw error
    }
  }

  /**
   * 更新会话活跃时间
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      await this.sessionRepository.update(sessionId, {
        updatedAt: new Date()
      })
    } catch (error) {
      console.error('[SessionManager] Failed to update session activity:', error)
    }
  }

  /**
   * 归档会话
   */
  async archiveSession(sessionId: string): Promise<void> {
    try {
      // 先关闭会话
      await this.closeSession(sessionId)

      // 更新状态为归档
      await this.sessionRepository.update(sessionId, {
        status: SessionStatus.ARCHIVED,
        updatedAt: new Date()
      })

      // 触发事件
      await this.emitEvent({
        type: SessionEventType.SESSION_ARCHIVED,
        sessionId,
        timestamp: new Date()
      })
    } catch (error) {
      console.error('[SessionManager] Failed to archive session:', error)
      throw error
    }
  }

  /**
   * 添加事件监听器
   */
  addEventListener(listener: ISessionEventListener): void {
    this.eventListeners.push(listener)
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(listener: ISessionEventListener): void {
    const index = this.eventListeners.indexOf(listener)
    if (index > -1) {
      this.eventListeners.splice(index, 1)
    }
  }

  /**
   * 触发事件
   */
  private async emitEvent(event: SessionEvent): Promise<void> {
    if (this.config.enableEventLogging) {
      console.log('[SessionManager] Event:', event)
    }

    for (const listener of this.eventListeners) {
      try {
        await listener.onSessionEvent(event)
      } catch (error) {
        console.error('[SessionManager] Event listener error:', error)
      }
    }
  }

  /**
   * 根据ID查找会话
   */
  private async findSessionById(sessionId: string): Promise<ChatSession | null> {
    return await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: ['agentConfig']
    })
  }
}