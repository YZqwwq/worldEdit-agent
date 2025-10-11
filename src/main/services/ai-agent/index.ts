/**
 * AI Agent服务主入口
 * 统一管理AI Agent相关的所有服务
 */

import { AIAgentEngine } from './AIAgentEngine'
import { ContextManager } from './ContextManager'
import { ModelAdapter } from './ModelAdapter'
import { MCPToolManager } from './MCPToolManager'
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
// ModelConfig已合并到AgentConfig中
import { PromptPipeline } from '../prompt/PromptPipeline'
import { ToolPromptGenerator } from '../prompt/ToolPromptGenerator'
import { ModelConfigService } from '../ModelConfigService'
import { TypeORMService } from '../database/TypeORMService'

// 服务层使用的 AgentConfig 接口，扩展实体类型
interface ServiceAgentConfig extends Partial<AgentConfig> {
  // AgentConfig现在已包含所有模型配置字段
  promptConfig?: any
  enableMCPTools?: boolean
}

/**
 * AI Agent服务类
 * 提供统一的AI Agent功能接口
 */
export class AIAgentService {
  private engine: AIAgentEngine
  private contextManager: ContextManager
  private modelAdapter: ModelAdapter
  private toolManager: MCPToolManager
  private promptPipeline: PromptPipeline | null = null
  private modelConfigService: ModelConfigService
  private isInitialized = false

  constructor(typeormService: TypeORMService) {
    this.engine = new AIAgentEngine()
    this.contextManager = new ContextManager()
    this.modelAdapter = new ModelAdapter()
    this.toolManager = new MCPToolManager()
    this.modelConfigService = new ModelConfigService(typeormService)
  }

  /**
   * 初始化AI Agent服务
   */
  async initialize(config: ServiceAgentConfig): Promise<void> {
    try {
      // Initializing AI Agent service...
      
      // 初始化提示词管道
      this.promptPipeline = new PromptPipeline(config.promptConfig)
      
      // 初始化模型配置服务
      await this.modelConfigService.initialize()
      
      // 初始化工具管理器
      await this.toolManager.initialize()
      
      // 初始化模型适配器
      await this.modelAdapter.initialize(config.currentModel)
      
      // 将工具添加到引擎
      const tools = this.toolManager.getAvailableTools()
      for (const tool of tools) {
        await this.engine.addTool(tool)
      }
      
      // 设置工具提示词
      if (this.promptPipeline && config.enableMCPTools && tools.length > 0) {
        const toolPrompt = ToolPromptGenerator.generateToolPrompt(tools)
        this.promptPipeline.setToolPrompt(toolPrompt)
      }
      
      // 初始化引擎
      await this.engine.initialize(config)
      
      // 创建默认会话
      this.contextManager.createSession('默认对话')
      
      this.isInitialized = true
      // AI Agent service initialized successfully
    } catch (error) {
      console.error('AI Agent service initialize error:', error)
      throw error
    }
  }

  /**
   * 发送消息
   */
  async sendMessage(message: string, sessionId?: string): Promise<{
    response: string
    messageId: string
    sessionId: string
  }> {
    if (!this.isInitialized) {
      throw new Error('AI Agent服务未初始化')
    }

    try {
      // 切换到指定会话或使用当前会话
      let session: ChatSession | null = null
      if (sessionId) {
        session = this.contextManager.switchToSession(sessionId)
        if (!session) {
          throw new Error(`会话不存在: ${sessionId}`)
        }
      } else {
        session = this.contextManager.getCurrentSession()
        if (!session) {
          session = this.contextManager.createSession()
        }
      }

      // 添加用户消息到上下文
      const userMessage: ChatMessage = {
        id: this.generateMessageId(),
        sessionId: session.id,
        role: MessageRole.USER,
        type: MessageType.TEXT,
        content: message,
        createdAt: new Date(),
        session: session,
        tokenCount: 0,
        isDeleted: false
      }
      this.contextManager.addMessage(userMessage)

      // 获取上下文消息
      const contextMessages = this.contextManager.getContextMessages(10, session.id)
      
      // 发送消息到引擎
      const response = await this.engine.sendMessage(message, {
        sessionId: session.id,
        history: contextMessages
      })

      // 添加AI回复到上下文
      const aiMessage: ChatMessage = {
        id: this.generateMessageId(),
        sessionId: session.id,
        role: MessageRole.ASSISTANT,
        type: MessageType.TEXT,
        content: response,
        createdAt: new Date(),
        session: session,
        tokenCount: 0,
        isDeleted: false
      }
      this.contextManager.addMessage(aiMessage)

      return {
        response,
        messageId: aiMessage.id,
        sessionId: session.id
      }
    } catch (error) {
      console.error('AI Agent send message error:', error)
      throw error
    }
  }

  /**
   * 创建新会话
   */
  createSession(title?: string): ChatSession {
    return this.contextManager.createSession(title)
  }

  /**
   * 获取所有会话
   */
  getAllSessions(): ChatSession[] {
    return this.contextManager.getAllSessions()
  }

  /**
   * 获取会话消息
   */
  getSessionMessages(sessionId: string): ChatMessage[] {
    return this.contextManager.getSessionMessages(sessionId)
  }

  /**
   * 删除会话
   */
  deleteSession(sessionId: string): boolean {
    return this.contextManager.deleteSession(sessionId)
  }

  /**
   * 更新会话标题
   */
  updateSessionTitle(sessionId: string, title: string): boolean {
    return this.contextManager.updateSessionTitle(sessionId, title)
  }

  /**
   * 获取当前状态
   */
  getState(): RuntimeAgentState {
    return this.engine.getState()
  }

  /**
   * 更新配置
   */
  async updateConfig(newConfig: Partial<ServiceAgentConfig>): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('AI Agent reinitialize failed')
    }

    await this.engine.updateConfig(newConfig)
    
    // 如果模型配置发生变化，更新模型适配器
    if (newConfig.currentModel) {
      await this.modelAdapter.updateConfig(newConfig.currentModel)
    }
  }

  /**
   * 验证模型配置
   */
  async validateModelConfig(config: Partial<AgentConfig>): Promise<boolean> {
    return await this.modelAdapter.validateConfig(config)
  }

  /**
   * 注册MCP服务器
   */
  async registerMCPServer(config: MCPServerConfig): Promise<void> {
    await this.toolManager.registerServer(config)
    
    // 重新加载工具到引擎
    if (this.isInitialized) {
      const tools = this.toolManager.getAvailableTools()
      for (const tool of tools) {
        await this.engine.addTool(tool)
      }
    }
  }

  /**
   * 获取可用工具列表
   */
  getAvailableTools(): MCPTool[] {
    return this.toolManager.getAllToolsInfo()
  }

  /**
   * 搜索消息
   */
  searchMessages(query: string, sessionId?: string): ChatMessage[] {
    return this.contextManager.searchMessages(query, sessionId)
  }

  /**
   * 获取会话统计
   */
  getSessionStats(sessionId?: string) {
    return this.contextManager.getSessionStats(sessionId)
  }

  /**
   * 获取全局统计
   */
  getGlobalStats() {
    return this.contextManager.getGlobalStats()
  }

  /**
   * 导出会话
   */
  exportSession(sessionId: string): ChatSession | null {
    return this.contextManager.exportSession(sessionId)
  }

  /**
   * 导入会话
   */
  importSession(sessionData: ChatSession): boolean {
    return this.contextManager.importSession(sessionData)
  }

  /**
   * 清空对话历史
   */
  clearConversationHistory(): void {
    this.engine.clearConversationHistory()
  }

  /**
   * 清空所有会话
   */
  clearAllSessions(): void {
    this.contextManager.clearAllSessions()
  }

  /**
   * 获取模型信息
   */
  getModelInfo() {
    return this.modelAdapter.getModelInfo()
  }

  /**
   * 估算令牌数量
   */
  estimateTokens(text: string): number {
    return this.modelAdapter.estimateTokens(text)
  }

  /**
   * 获取支持的模型列表
   */
  getSupportedModels() {
    return ModelAdapter.getSupportedModels()
  }

  /**
   * 获取模型配置
   */
  async getModelConfig(id: string): Promise<Partial<AgentConfig> | null> {
    try {
      if (id === 'current' || id === 'default') {
        // 获取默认配置
        const defaultConfig = await this.modelConfigService.getDefaultConfig()
        if (defaultConfig) {
          return defaultConfig.toApiConfig()
        }
        // 如果没有默认配置，返回当前引擎配置
        const config = this.engine.getConfig()
        if (config && config.currentModel) {
          return config.currentModel
        }
      } else {
        // 根据ID获取配置
        const modelConfig = await this.modelConfigService.getConfigById(id)
        if (modelConfig) {
          return modelConfig.toApiConfig()
        }
      }
      return null
    } catch (error) {
      console.error('TypeORM database model config get error:', error)
      return null
    }
  }

  /**
   * 获取所有模型配置
   */
  async getAllModelConfigs(): Promise<Partial<AgentConfig>[]> {
    return await this.modelConfigService.getAllConfigs()
  }

  /**
   * 创建模型配置
   */
  async createModelConfig(configData: Partial<AgentConfig>): Promise<Partial<AgentConfig>> {
    return await this.modelConfigService.createConfig(configData)
  }

  /**
   * 更新模型配置
   */
  async updateModelConfig(id: string, configData: Partial<AgentConfig>): Promise<Partial<AgentConfig> | null> {
    return await this.modelConfigService.updateConfig(id, configData)
  }

  /**
   * 删除模型配置
   */
  async deleteModelConfig(id: string): Promise<boolean> {
    return await this.modelConfigService.deleteConfig(id)
  }

  /**
   * 设置默认模型配置
   */
  async setDefaultModelConfig(id: string): Promise<boolean> {
    return await this.modelConfigService.setDefaultConfig(id)
  }

  /**
   * 检查服务是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized
  }

  /**
   * 检查服务是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized
  }

  /**
   * 生成消息ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 更新用户提示词
   */
  updateUserPrompt(prompt: string): void {
    if (this.promptPipeline) {
      this.promptPipeline.setUserPrompt(prompt)
    }
  }

  /**
   * 更新系统提示词
   */
  updateSystemPrompt(prompt: string): void {
    if (this.promptPipeline) {
      this.promptPipeline.setSystemPrompt(prompt)
    }
  }

  /**
   * 启用/禁用工具提示词
   */
  setToolPromptEnabled(enabled: boolean): void {
    if (this.promptPipeline) {
      this.promptPipeline.setToolPromptsEnabled(enabled)
    }
  }

  /**
   * 获取当前提示词统计信息
   */
  getPromptStats() {
    if (this.promptPipeline) {
      return this.promptPipeline.getStats()
    }
    return null
  }

  /**
   * 获取构建后的系统提示词
   */
  getBuiltSystemPrompt(): string {
    if (this.promptPipeline) {
      return this.promptPipeline.buildPrompt()
    }
    return ''
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.toolManager.destroy()
    this.modelAdapter.destroy()
    this.contextManager.clearAllSessions()
    this.promptPipeline = null
    this.isInitialized = false
    // AI Agent service destroyed
  }
}

// 导出所有相关类型和类
export {
  AIAgentEngine,
  ContextManager,
  ModelAdapter,
  MCPToolManager
}

export type {
  AgentConfig,
  ChatMessage,
  ChatSession,
  RuntimeAgentState,
  MCPServerConfig,
  MCPTool
} from '../../../shared/cache-types/agent/agent'