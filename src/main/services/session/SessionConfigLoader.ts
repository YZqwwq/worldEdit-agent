import { Repository } from 'typeorm'
import { ChatSession } from '../../../shared/entities/agent/ChatSession.entity'
import { AgentConfig } from '../../../shared/entities/agent/AgentConfig.entity'
import { ModelProvider } from '../../../shared/cache-types/agent/Enum/modelEnum'
import {
  ISessionConfigLoader,
  SERVICE_TOKENS
} from '../../../shared/cache-types/session/session-manager.types'
import { SessionConfigLoaderConfig, DEFAULT_CONFIGS, ConfigUtils } from '../../../shared/cache-types/session/service-configs.types'

import { TypeORMService } from '../database/TypeORMService'
import { Injectable } from './ServiceContainer'

@Injectable(SERVICE_TOKENS.SESSION_CONFIG_LOADER)
export class SessionConfigLoader implements ISessionConfigLoader {
  private systemDefaultConfig: AgentConfig | null = null
  private configCache: Map<string, AgentConfig> = new Map()
  private sessionRepository!: Repository<ChatSession>
  private agentConfigRepository!: Repository<AgentConfig>
  private config: SessionConfigLoaderConfig

  constructor(
    private typeormService: TypeORMService,
    config?: Partial<SessionConfigLoaderConfig>
  ) {
    // 使用专门的SessionConfigLoaderConfig，只包含配置加载相关的配置
    this.config = ConfigUtils.mergeWithDefaults(
      config || {},
      DEFAULT_CONFIGS.configLoader
    )
  }

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
  async loadSessionConfig(sessionId: string): Promise<AgentConfig> {
    try {
      // 首先查找会话
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
        relations: ['agentConfig']
      })

      if (!session) {
        console.warn(`[SessionConfigLoader] Session ${sessionId} not found, using system default config`)
        return await this.loadSystemDefaultConfig()
      }

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

      // 最后使用系统默认配置
      return await this.loadSystemDefaultConfig()
    } catch (error) {
      console.error('[SessionConfigLoader] Failed to load session config:', error)
      // 出错时返回系统默认配置
      return await this.loadSystemDefaultConfig()
    }
  }

  /**
   * 加载用户默认配置
   */
  async loadUserDefaultConfig(userId: string): Promise<AgentConfig | null> {
    try {
      // 查找用户的默认配置
      const userConfig = await this.agentConfigRepository.findOne({
        where: { isDefault: true }
      })

      if (userConfig) {
        return userConfig
      }

      return null
    } catch (error) {
      console.error('[SessionConfigLoader] Failed to load user default config:', error)
      return null
    }
  }

  /**
   * 加载系统默认配置
   */
  async loadSystemDefaultConfig(): Promise<AgentConfig> {
    try {
      // 如果已缓存，直接返回
      if (this.systemDefaultConfig) {
        return this.systemDefaultConfig
      }

      // 从数据库查找系统默认配置
      let systemConfig = await this.agentConfigRepository.findOne({
        where: { isDefault: true }
      })

      // 如果没有系统默认配置，创建一个
      if (!systemConfig) {
        systemConfig = await this.createSystemDefaultConfig()
      }

      // 缓存系统默认配置
      this.systemDefaultConfig = systemConfig
      return systemConfig
    } catch (error) {
      console.error('[SessionConfigLoader] Failed to load system default config:', error)
      throw error
    }
  }

  /**
   * 获取缓存的配置
   */
  getCachedConfig(configId: string): AgentConfig | null {
    return this.configCache.get(configId) || null
  }

  /**
   * 设置缓存的配置
   */
  setCachedConfig(configId: string, config: AgentConfig): void {
    this.configCache.set(configId, config)
  }

  /**
   * 清除配置缓存
   */
  clearConfigCache(): void {
    this.configCache.clear()
    this.systemDefaultConfig = null
  }

  /**
   * 验证配置的完整性
   */
  validateConfig(config: Partial<AgentConfig>): boolean {
    try {
      // 检查必要字段
      if (!config.provider || !config.modelName) {
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
   * 创建系统默认配置
   */
  private async createSystemDefaultConfig(): Promise<AgentConfig> {
    try {
      const defaultConfig = this.agentConfigRepository.create({
        name: '系统默认配置',
        description: '系统默认的AI Agent配置',
        provider: ModelProvider.OPENAI,
        modelName: 'gpt-3.5-turbo',
        apiKey: '',
        temperature: 0.7,
        maxTokens: 2048,
        systemPrompt: '你是一个有用的AI助手，请尽力帮助用户解决问题。',
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      const savedConfig = await this.agentConfigRepository.save(defaultConfig)
      
      console.log('[SessionConfigLoader] System default config created:', {
        configId: savedConfig.id,
        provider: savedConfig.provider,
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
      where: { isDefault: true }
    })
    
    if (!systemDefault) {
      await this.createSystemDefaultConfig()
      console.log('[SessionConfigLoader] Created system default config')
    }
  }
}