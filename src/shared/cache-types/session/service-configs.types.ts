/**
 * 服务配置类型定义
 * 将不同服务的配置参数分离，提高代码的可维护性和清晰度
 */

/**
 * 会话管理器专用配置
 * 只包含会话管理相关的配置参数
 */
export interface SessionManagerConfig {
  // 会话配置
  defaultSessionTitle?: string
  autoCleanupInterval?: number // 毫秒
  
  // 事件配置
  enableEventLogging?: boolean
}

/**
 * 引擎生命周期管理器专用配置
 * 只包含引擎管理相关的配置参数
 */
export interface EngineLifecycleConfig {
  // 引擎配置
  maxEngineInstances?: number
  engineIdleTimeout?: number // 毫秒
}

/**
 * 消息同步服务专用配置
 * 只包含消息处理相关的配置参数
 */
export interface MessageSyncConfig {
  // 消息配置
  messageHistoryLimit?: number
  messageBatchSize?: number
}

/**
 * 会话配置加载器专用配置
 * 只包含配置加载和缓存相关的配置参数
 */
export interface SessionConfigLoaderConfig {
  // 缓存配置
  configCacheSize?: number
  configCacheTTL?: number // 毫秒
}

/**
 * 数据库服务专用配置
 * 只包含数据库相关的配置参数
 */
export interface DatabaseConfig {
  // 数据库配置
  databasePath?: string
  enableWAL?: boolean
}

/**
 * 完整的系统配置
 * 包含所有服务的配置参数，用于系统初始化
 */
export interface SystemConfig {
  sessionManager?: SessionManagerConfig
  engineLifecycle?: EngineLifecycleConfig
  messageSync?: MessageSyncConfig
  configLoader?: SessionConfigLoaderConfig
  database?: DatabaseConfig
}

/**
 * 配置默认值
 */
export const DEFAULT_CONFIGS = {
  sessionManager: {
    defaultSessionTitle: 'New Chat Session',
    autoCleanupInterval: 5 * 60 * 1000, // 5分钟
    enableEventLogging: true
  } as SessionManagerConfig,
  
  engineLifecycle: {
    maxEngineInstances: 10,
    engineIdleTimeout: 10 * 60 * 1000 // 10分钟
  } as EngineLifecycleConfig,
  
  messageSync: {
    messageHistoryLimit: 1000,
    messageBatchSize: 50
  } as MessageSyncConfig,
  
  configLoader: {
    configCacheSize: 100,
    configCacheTTL: 30 * 60 * 1000 // 30分钟
  } as SessionConfigLoaderConfig,
  
  database: {
    databasePath: './data/sessions.db',
    enableWAL: true
  } as DatabaseConfig
} as const

/**
 * 配置工具函数
 */
export class ConfigUtils {
  /**
   * 合并配置，使用默认值填充缺失的配置项
   */
  static mergeWithDefaults<T>(config: Partial<T>, defaults: T): T {
    return { ...defaults, ...config }
  }
  
  /**
   * 从系统配置中提取特定服务的配置
   */
  static extractServiceConfig<K extends keyof SystemConfig>(
    systemConfig: SystemConfig,
    serviceKey: K
  ): SystemConfig[K] {
    return systemConfig[serviceKey]
  }
  
  /**
   * 验证配置的完整性
   */
  static validateConfig<T>(config: T, requiredFields: (keyof T)[]): boolean {
    return requiredFields.every(field => config[field] !== undefined)
  }
}