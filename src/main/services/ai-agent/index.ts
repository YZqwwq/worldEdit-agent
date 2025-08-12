/**
 * AI Agent服务主入口
 * 统一管理AI Agent相关的所有服务
 */

import { AIAgentEngine } from './AIAgentEngine'
import { ContextManager } from './ContextManager'
import { ModelAdapter } from './ModelAdapter'
import { MCPToolManager } from './MCPToolManager'
import { MessageType } from '../../types/agent'
import type {
  AgentConfig,
  ChatMessage,
  ChatSession,
  AgentState,
  ModelConfig,
  MCPServerConfig,
  MCPTool
} from '../../types/agent'

/**
 * AI Agent服务类
 * 提供统一的AI Agent功能接口
 */
export class AIAgentService {
  private engine: AIAgentEngine
  private contextManager: ContextManager
  private modelAdapter: ModelAdapter
  private toolManager: MCPToolManager
  private isInitialized = false

  constructor() {
    this.engine = new AIAgentEngine()
    this.contextManager = new ContextManager()
    this.modelAdapter = new ModelAdapter()
    this.toolManager = new MCPToolManager()
  }

  /**
   * 初始化AI Agent服务
   */
  async initialize(config: AgentConfig): Promise<void> {
    try {
      console.log('正在初始化AI Agent服务...')
      
      // 初始化工具管理器
      await this.toolManager.initialize()
      
      // 初始化模型适配器
      await this.modelAdapter.initialize(config.currentModel)
      
      // 将工具添加到引擎
      const tools = this.toolManager.getAvailableTools()
      for (const tool of tools) {
        await this.engine.addTool(tool)
      }
      
      // 初始化引擎
      await this.engine.initialize(config)
      
      // 创建默认会话
      this.contextManager.createSession('默认对话')
      
      this.isInitialized = true
      console.log('AI Agent服务初始化完成')
    } catch (error) {
      console.error('AI Agent服务初始化失败:', error)
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
        type: MessageType.USER,
        content: message,
        timestamp: Date.now()
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
        type: MessageType.ASSISTANT,
        content: response,
        timestamp: Date.now()
      }
      this.contextManager.addMessage(aiMessage)

      return {
        response,
        messageId: aiMessage.id,
        sessionId: session.id
      }
    } catch (error) {
      console.error('发送消息失败:', error)
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
  getState(): AgentState {
    return this.engine.getState()
  }

  /**
   * 更新配置
   */
  async updateConfig(newConfig: Partial<AgentConfig>): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('AI Agent服务未初始化')
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
  async validateModelConfig(config: ModelConfig): Promise<boolean> {
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
   * 销毁服务
   */
  destroy(): void {
    this.toolManager.destroy()
    this.modelAdapter.destroy()
    this.contextManager.clearAllSessions()
    this.isInitialized = false
    console.log('AI Agent服务已销毁')
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
  AgentState,
  ModelConfig,
  MCPServerConfig,
  MCPTool
} from '../../types/agent'