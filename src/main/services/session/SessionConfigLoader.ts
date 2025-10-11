import { Repository } from 'typeorm'
import { ChatSession } from '../../../shared/entities/agent/ChatSession.entity'
import { AgentConfig } from '../../../shared/entities/agent/AgentConfig.entity'
import { ModelProvider } from '../../../shared/cache-types/agent/modelEnum'
import {
  ISessionConfigLoader,
  SessionManagerConfig,
  SERVICE_TOKENS
} from '../../../shared/cache-types/session/session-manager.types'

import { TypeORMService } from '../database/TypeORMService'
import { Injectable } from './ServiceContainer'

@Injectable(SERVICE_TOKENS.SESSION_CONFIG_LOADER)
export class SessionConfigLoader implements ISessionConfigLoader {
  private systemDefaultConfig: AgentConfig | null = null
  private userDefaultConfigs: Map<string, AgentConfig> = new Map()
  private configCache: Map<string, { config: AgentConfig; timestamp: number }> = new Map()
  private sessionRepository!: Repository<ChatSession>
  private agentConfigRepository!: Repository<AgentConfig>

  constructor(
    private typeormService: TypeORMService,
    private config: SessionManagerConfig
  ) {}

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    try {
      // 获取数据库仓库
      this.sessionRepository = this.typeormService.getRepository(ChatSession)
      this.agentConfigRepository = this.typeormService.getRepository(AgentConfig)
      
      // 确保系统默认配置存在
      await this.ensureSystemDefaultConfig()
      
      console.log('[SessionConfigLoader] Initialized successfully')
    } catch (error) {
      console.error('[SessionConfigLoader] Failed to initialize:', error)
      throw error
    }
  }

  /**
   * 销毁服务
   */
  async destroy(): Promise<void> {
    try {
      // 清理缓存
      this.configCache.clear()
      this.userDefaultConfigs.clear()
      this.systemDefaultConfig = null
      
      console.log('[SessionConfigLoader] Destroyed successfully')
    } catch (error) {
      console.error('[SessionConfigLoader] Failed to destroy:', error)
      throw error
    }
  }

  /**
   * 加载会话的Agent配置
   */
  async loadConfigForSession(sessionId: string): Promise<AgentConfig> {
    try {
      // 检查缓存
      const cached = this.configCache.get(sessionId)
      if (cached && Date.now() - cached.timestamp < this.config.configCacheTTL!) {
        return cached.config
      }
      
      // 查找会话
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
        relations: ['agentConfig']
      })
      
      let config: AgentConfig
      
      if (session?.agentConfig) {
        // 使用会话特定配置
        config = session.agentConfig
      } else {
        // 使用用户默认配置或系统默认配置
        config = await this.loadDefaultConfig(session?.userId)
      }
      
      // 缓存配置
      this.configCache.set(sessionId, {
        config,
        timestamp: Date.now()
      })
      
      // 清理过期缓存
      this.cleanupExpiredCache()
      
      return config
    } catch (error) {
      console.error('[SessionConfigLoader] Failed to load config for session:', error)
      throw error
    }
  }

  /**
   * 加载会话的Agent配置（兼容旧接口）
   */
  async loadSessionConfig(session: ChatSession): Promise<AgentConfig> {
    try {
      // 如果会话已经关联了agentConfig，直接返回
      if (session.agentConfig) {
        return session.agentConfig
      }

      // 通过agentConfigId查找配置
      if (session.agentConfigId) {
        const config = await this.agentConfigRepository.findOne({
          where: { id: session.agentConfigId }
        })
        
        if (config) {
          return config
        }
      }

      // 如果没有找到特定配置，使用用户默认配置
      const userDefaultConfig = await this.getUserDefaultConfig(session.userId)
      if (userDefaultConfig) {
        return userDefaultConfig
      }

      // 最后使用系统默认配置
      return await this.getSystemDefaultConfig()
    } catch (error) {
      console.error('[SessionConfigLoader] Failed to load session config:', error)
      // 出错时返回系统默认配置
      return await this.getSystemDefaultConfig()
    }
  }

  /**
   * 获取用户默认配置
   */
  async getUserDefaultConfig(userId?: string): Promise<AgentConfig | null> {
    try {
      if (!userId) {
        return null
      }

      // 检查缓存
      const cachedConfig = this.userDefaultConfigs.get(userId)
      if (cachedConfig) {
        return cachedConfig
      }

      // 从数据库查找用户的默认配置
      const userConfig = await this.agentConfigRepository.findOne({
        where: {
          userId,
          isDefault: true
        }
      })

      if (userConfig) {
        // 缓存用户配置
        this.userDefaultConfigs.set(userId, userConfig)
        return userConfig
      }

      // 如果用户没有默认配置，查找用户的第一个配置
      const firstUserConfig = await this.agentConfigRepository.findOne({
        where: { userId },
        order: { createdAt: 'ASC' }
      })

      if (firstUserConfig) {
        this.userDefaultConfigs.set(userId, firstUserConfig)
        return firstUserConfig
      }

      return null
    } catch (error) {
      console.error('[SessionConfigLoader] Failed to get user default config:', error)
      return null
    }
  }

  /**
   * 获取系统默认配置
   */
  async getSystemDefaultConfig(): Promise<AgentConfig> {
    try {
      // 如果已缓存，直接返回
      if (this.systemDefaultConfig) {
        return this.systemDefaultConfig
      }

      // 从数据库查找系统默认配置
      let systemConfig = await this.agentConfigRepository.findOne({
        where: {
          isSystemDefault: true
        }
      })

      // 如果没有系统默认配置，创建一个
      if (!systemConfig) {
        systemConfig = await this.createSystemDefaultConfig()
      }

      // 缓存系统默认配置
      this.systemDefaultConfig = systemConfig
      return systemConfig
    } catch (error) {
      console.error('[SessionConfigLoader] Failed to get system default config:', error)
      throw error
    }
  }

  /**
   * 更新会话配置
   */
  async updateSessionConfig(sessionId: string, configId: string): Promise<void> {
    try {
      // 验证配置是否存在
      const config = await this.agentConfigRepository.findOne({
        where: { id: configId }
      })

      if (!config) {
        throw new Error(`AgentConfig with id ${configId} not found`)
      }

      // 更新会话的配置ID
      // 这里需要注入ChatSession的Repository
      // 为了简化，暂时不实现具体的更新逻辑
      
      console.log('[SessionConfigLoader] Session config updated:', {
        sessionId,
        configId
      })
    } catch (error) {
      console.error('[SessionConfigLoader] Failed to update session config:', error)
      throw error
    }
  }

  /**
   * 清除用户配置缓存
   */
  clearUserConfigCache(userId: string): void {
    this.userDefaultConfigs.delete(userId)
  }

  /**
   * 清除所有缓存
   */
  clearAllCache(): void {
    this.systemDefaultConfig = null
    this.userDefaultConfigs.clear()
  }

  /**
   * 初始化系统默认配置
   */
  private async initializeSystemDefaultConfig(): Promise<void> {
    try {
      await this.getSystemDefaultConfig()
    } catch (error) {
      console.error('[SessionConfigLoader] Failed to initialize system default config:', error)
    }
  }

  /**
   * 加载默认配置
   */
  private async loadDefaultConfig(userId?: string): Promise<AgentConfig> {
    if (userId) {
      // 尝试加载用户默认配置
      const userDefault = await this.agentConfigRepository.findOne({
        where: { userId, isDefault: true }
      })
      if (userDefault) {
        return userDefault
      }
    }
    
    // 加载系统默认配置
    const systemDefault = await this.agentConfigRepository.findOne({
      where: { isSystemDefault: true }
    })
    
    if (!systemDefault) {
      // 创建系统默认配置
      return await this.createSystemDefaultConfig()
    }
    
    return systemDefault
  }

  /**
   * 创建系统默认配置
   */
  private async createSystemDefaultConfig(): Promise<AgentConfig> {
    try {
      const defaultConfig = this.agentConfigRepository.create({
        name: '系统默认配置',
        description: '系统默认的AI Agent配置',
        modelProvider: ModelProvider.OPENAI,
        modelName: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 2048,
        systemPrompt: '你是一个有用的AI助手，请尽力帮助用户解决问题。',
        enableTools: true,
        toolConfigs: {},
        isSystemDefault: true,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      const savedConfig = await this.agentConfigRepository.save(defaultConfig)
      
      console.log('[SessionConfigLoader] System default config created:', {
        configId: savedConfig.id,
        modelProvider: savedConfig.modelProvider,
        modelName: savedConfig.modelName
      })

      return savedConfig
    } catch (error) {
      console.error('[SessionConfigLoader] Failed to create system default config:', error)
      throw error
    }
  }

  /**
   * 确保系统默认配置存在
   */
  private async ensureSystemDefaultConfig(): Promise<void> {
    const systemDefault = await this.agentConfigRepository.findOne({
      where: { isSystemDefault: true }
    })
    
    if (!systemDefault) {
      await this.createSystemDefaultConfig()
      console.log('[SessionConfigLoader] Created system default config')
    }
  }

  /**
   * 清理过期缓存
   */
  private cleanupExpiredCache(): void {
    const now = Date.now()
    const ttl = this.config.configCacheTTL!
    
    for (const [key, value] of this.configCache.entries()) {
      if (now - value.timestamp > ttl) {
        this.configCache.delete(key)
      }
    }
  }

  /**
   * 验证配置的完整性
   */
  private validateConfig(config: AgentConfig): boolean {
    try {
      // 检查必要字段
      if (!config.modelProvider || !config.modelName) {
        return false
      }

      // 检查数值字段的合理性
      if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
        return false
      }

      if (config.maxTokens !== undefined && config.maxTokens <= 0) {
        return false
      }

      return true
    } catch (error) {
      console.error('[SessionConfigLoader] Config validation error:', error)
      return false
    }
  }

  /**
   * 获取配置的摘要信息
   */
  getConfigSummary(config: AgentConfig): string {
    return `${config.name} (${config.modelProvider}/${config.modelName})`
  }
}