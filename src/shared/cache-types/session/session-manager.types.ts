/**
 * 会话管理框架类型定义
 * 定义了会话管理相关的接口、枚举和类型
 * 使用纯TypeScript实现，不依赖任何Node.js框架
 */

import type { ChatSession, ChatMessage, AgentConfig } from '../../entities'
import type { AIAgentEngine } from '../../../main/services/ai-agent/AIAgentEngine'

/**
 * 会话状态枚举
 */
export enum SessionStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived',
  CLOSED = 'closed'
}

/**
 * 会话创建选项
 */
export interface SessionCreateOptions {
  title?: string
  agentConfigId?: string
  userId?: string
  metadata?: Record<string, any>
}

/**
 * 会话查找选项
 */
export interface SessionFindOptions {
  userId?: string
  status?: SessionStatus
  limit?: number
  offset?: number
  sortBy?: 'createdAt' | 'updatedAt' | 'title'
  sortOrder?: 'ASC' | 'DESC'
}

/**
 * 会话统计信息
 */
export interface SessionStats {
  messageCount: number
  lastMessageAt: Date | null
  totalTokens: number
  averageResponseTime: number
  createdAt: Date
  updatedAt: Date
}

/**
 * 引擎实例信息
 */
export interface EngineInstance {
  sessionId: string // 会话ID
  engine: AIAgentEngine // 引擎实例
  lastActivity: Date // 最后活动时间
  isActive: boolean // 是否活动
  config: AgentConfig // 会话配置
}

/**
 * 会话管理器接口
 * 负责会话的生命周期管理
 */
export interface ISessionManager {
  // 会话操作
  enterSession(sessionId?: string, options?: SessionCreateOptions): Promise<ChatSession>
  createSession(options?: SessionCreateOptions): Promise<ChatSession>
  switchSession(sessionId: string): Promise<ChatSession>
  closeSession(sessionId: string): Promise<void>
  archiveSession(sessionId: string): Promise<void>
  
  // 会话查询
  findSessions(options?: SessionFindOptions): Promise<ChatSession[]>
  getActiveSession(): ChatSession | null
  getSessionStats(sessionId: string): Promise<SessionStats | null>
  
  // 会话维护
  updateSessionActivity(sessionId: string): Promise<void>
  cleanupInactiveSessions(): Promise<void>
  
  // 事件监听
  addEventListener(listener: ISessionEventListener): void
  removeEventListener(listener: ISessionEventListener): void
  
  // 生命周期管理
  initialize(): Promise<void>
  destroy(): Promise<void>
}

/**
 * 引擎生命周期管理器接口
 */
export interface IEngineLifecycleManager {
  // 引擎管理
  initializeEngine(sessionId: string, config: AgentConfig): Promise<AIAgentEngine>
  initializeForSession(session: ChatSession): Promise<AIAgentEngine>
  getEngine(sessionId: string): AIAgentEngine | null
  getOrCreateEngine(sessionId: string): Promise<AIAgentEngine>
  destroyEngine(sessionId: string): Promise<void>
  destroyForSession(sessionId: string): Promise<void>
  
  // 引擎状态
  syncEngineState(sessionId: string): Promise<void>
  syncToSession(sessionId: string): Promise<void>
  restoreEngineFromSession(session: ChatSession): Promise<AIAgentEngine>
  restoreFromSession(session: ChatSession): Promise<AIAgentEngine>
  
  // 资源管理
  cleanupInactiveEngines(): Promise<void>
  getActiveEngines(): EngineInstance[]
  enforceEngineLimit(): Promise<void>
  
  // 生命周期
  initialize(): Promise<void>
  destroy(): Promise<void>
}

/**
 * 消息同步服务接口
 */
export interface IMessageSyncService {
  // 消息同步
  saveMessage(sessionId: string, message: ChatMessage): Promise<ChatMessage>
  saveBatchMessages(sessionId: string, messages: ChatMessage[]): Promise<ChatMessage[]>
  loadMessageHistory(sessionId: string, limit?: number, offset?: number): Promise<ChatMessage[]>
  
  // 消息管理
  clearSessionMessages(sessionId: string): Promise<void>
  updateSessionStats(sessionId: string): Promise<void>
  getMessageStats(sessionId: string): Promise<{
    count: number
    lastMessage: ChatMessage | null
  }>
  
  // 格式转换
  convertToEngineMessage(dbMessage: ChatMessage): any
  convertFromEngineMessage(engineMessage: any, sessionId: string): ChatMessage
  
  // 生命周期
  initialize(): Promise<void>
  destroy(): Promise<void>
}

/**
 * 会话配置加载器接口
 */
export interface ISessionConfigLoader {
  // 配置加载
  loadSessionConfig(sessionId: string): Promise<AgentConfig>
  loadUserDefaultConfig(userId: string): Promise<AgentConfig | null>
  loadSystemDefaultConfig(): Promise<AgentConfig>
  
  // 配置缓存
  getCachedConfig(configId: string): AgentConfig | null
  setCachedConfig(configId: string, config: AgentConfig): void
  clearConfigCache(): void
  
  // 配置验证
  validateConfig(config: Partial<AgentConfig>): boolean
  
  // 生命周期
  initialize(): Promise<void>
  destroy(): Promise<void>
}

/**
 * 会话事件类型
 */
export enum SessionEventType {
  SESSION_CREATED = 'session_created',
  SESSION_ENTERED = 'session_entered',
  SESSION_SWITCHED = 'session_switched',
  SESSION_CLOSED = 'session_closed',
  SESSION_ARCHIVED = 'session_archived',
  MESSAGE_SENT = 'message_sent',
  MESSAGE_RECEIVED = 'message_received',
  ENGINE_INITIALIZED = 'engine_initialized',
  ENGINE_DESTROYED = 'engine_destroyed',
  CONFIG_LOADED = 'config_loaded',
  ERROR_OCCURRED = 'error_occurred'
}

/**
 * 会话事件
 */
export interface SessionEvent {
  type: SessionEventType
  sessionId: string
  timestamp: Date
  data?: {
    session?: ChatSession
    message?: ChatMessage
    config?: AgentConfig
    error?: Error
    [key: string]: any
  }
}

/**
 * 会话事件监听器接口
 */
export interface ISessionEventListener {
  onSessionEvent(event: SessionEvent): Promise<void> | void
}

/**
 * 会话管理器配置
 */
export interface SessionManagerConfig {
  // 引擎配置
  maxEngineInstances?: number
  engineIdleTimeout?: number // 毫秒
  
  // 会话配置
  defaultSessionTitle?: string
  autoCleanupInterval?: number // 毫秒
  
  // 消息配置
  messageHistoryLimit?: number
  messageBatchSize?: number
  
  // 缓存配置
  configCacheSize?: number
  configCacheTTL?: number // 毫秒
  
  // 数据库配置
  databasePath?: string
  enableWAL?: boolean

  // 事件配置
  enableEventLogging?: boolean
}

/**
 * 服务容器接口
 * 用于管理服务依赖注入
 */
export interface IServiceContainer {
  // 服务注册
  register<T>(token: string, factory: () => T): void
  registerSingleton<T>(token: string, factory: () => T): void
  registerInstance<T>(token: string, instance: T): void
  
  // 服务获取
  get<T>(token: string): T
  has(token: string): boolean
  
  // 服务管理
  clear(): void
  dispose(): Promise<void>
}

/**
 * 服务令牌常量
 */
export const SERVICE_TOKENS = {
  SESSION_MANAGER: 'SessionManager',
  ENGINE_LIFECYCLE_MANAGER: 'EngineLifecycleManager',
  MESSAGE_SYNC_SERVICE: 'MessageSyncService',
  SESSION_CONFIG_LOADER: 'SessionConfigLoader',
  TYPEORM_SERVICE: 'TypeORMService'
} as const

export type ServiceToken = typeof SERVICE_TOKENS[keyof typeof SERVICE_TOKENS]