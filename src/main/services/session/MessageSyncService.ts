import { Repository } from 'typeorm'
import { ChatMessage } from '../../../shared/entities/agent/ChatMessage.entity'
import { ChatSession } from '../../../shared/entities/agent/ChatSession.entity'
import { AIAgentEngine } from '../ai-agent/AIAgentEngine'
import {
  IMessageSyncService,
  IEngineLifecycleManager,
  SERVICE_TOKENS
} from '../../../shared/cache-types/session/session-manager.types'
import { TypeORMService } from '../database/TypeORMService'
import { Injectable } from './ServiceContainer'

@Injectable(SERVICE_TOKENS.MESSAGE_SYNC_SERVICE)
export class MessageSyncService implements IMessageSyncService {
  private messageRepository!: Repository<ChatMessage>
  private sessionRepository!: Repository<ChatSession>

  constructor(
    private typeormService: TypeORMService,
    private engineLifecycleManager: IEngineLifecycleManager
  ) {}

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    try {
      // 获取数据库仓库
      this.messageRepository = this.typeormService.getRepository(ChatMessage)
      this.sessionRepository = this.typeormService.getRepository(ChatSession)
      
      console.log('[MessageSyncService] Initialized successfully')
    } catch (error) {
      console.error('[MessageSyncService] Failed to initialize:', error)
      throw error
    }
  }

  /**
   * 销毁服务
   */
  async destroy(): Promise<void> {
    try {
      // 清理资源（如果有的话）
      console.log('[MessageSyncService] Destroyed successfully')
    } catch (error) {
      console.error('[MessageSyncService] Failed to destroy:', error)
      throw error
    }
  }

  /**
   * 保存单个消息
   */
  async saveMessage(sessionId: string, message: ChatMessage): Promise<ChatMessage> {
    return await this.saveToDatabase(sessionId, message)
  }

  /**
   * 批量保存消息
   */
  async saveBatchMessages(sessionId: string, messages: ChatMessage[]): Promise<ChatMessage[]> {
    return await this.saveBatchToDatabase(sessionId, messages)
  }

  /**
   * 同步消息到数据库和引擎
   */
  async syncMessage(sessionId: string, message: ChatMessage): Promise<void> {
    try {
      // 1. 保存到数据库
      const savedMessage = await this.saveToDatabase(sessionId, message)

      // 2. 更新引擎内存
      const engine = await this.engineLifecycleManager.getOrCreateEngine(sessionId)
      await this.addToEngineHistory(engine, savedMessage)

      // 3. 更新会话统计
      await this.updateSessionStats(sessionId, savedMessage)

      console.log('[MessageSyncService] Message synced successfully:', {
        sessionId,
        messageId: savedMessage.id,
        type: savedMessage.type
      })
    } catch (error) {
      console.error('[MessageSyncService] Failed to sync message:', error)
      throw error
    }
  }

  /**
   * 批量同步消息
   */
  async syncMessages(sessionId: string, messages: ChatMessage[]): Promise<void> {
    try {
      // 批量保存到数据库
      const savedMessages = await this.saveBatchToDatabase(sessionId, messages)

      // 更新引擎内存
      const engine = await this.engineLifecycleManager.getOrCreateEngine(sessionId)
      for (const message of savedMessages) {
        await this.addToEngineHistory(engine, message)
      }

      // 更新会话统计
      for (const message of savedMessages) {
        await this.updateSessionStats(sessionId, message)
      }

      console.log('[MessageSyncService] Batch messages synced successfully:', {
        sessionId,
        count: savedMessages.length
      })
    } catch (error) {
      console.error('[MessageSyncService] Failed to sync batch messages:', error)
      throw error
    }
  }

  /**
   * 从数据库加载消息历史到引擎
   */
  async loadMessageHistory(sessionId: string, limit: number = 100): Promise<ChatMessage[]> {
    try {
      // 从数据库加载消息历史
      const messages = await this.messageRepository.find({
        where: { sessionId },
        order: { createdAt: 'ASC' },
        take: limit
      })

      // 加载到引擎
      const engine = await this.engineLifecycleManager.getOrCreateEngine(sessionId)
      await this.loadMessagesToEngine(engine, messages)

      console.log('[MessageSyncService] Message history loaded:', {
        sessionId,
        count: messages.length
      })

      return messages
    } catch (error) {
      console.error('[MessageSyncService] Failed to load message history:', error)
      throw error
    }
  }

  /**
   * 清理会话的消息历史
   */
  async clearSessionMessages(sessionId: string): Promise<void> {
    return await this.clearMessageHistory(sessionId)
  }

  /**
   * 清理会话的消息历史
   */
  async clearMessageHistory(sessionId: string): Promise<void> {
    try {
      // 从数据库删除消息
      await this.messageRepository.delete({ sessionId })

      // 清理引擎内存
      const engine = await this.engineLifecycleManager.getOrCreateEngine(sessionId)
      await this.clearEngineHistory(engine)

      console.log('[MessageSyncService] Message history cleared:', { sessionId })
    } catch (error) {
      console.error('[MessageSyncService] Failed to clear message history:', error)
      throw error
    }
  }

  /**
   * 获取会话消息统计
   */
  async getMessageStats(sessionId: string): Promise<{
    count: number
    lastMessage: ChatMessage | null
  }> {
    try {
      const count = await this.messageRepository.count({
        where: { sessionId }
      })

      const lastMessage = await this.messageRepository.findOne({
        where: { sessionId },
        order: { createdAt: 'DESC' }
      })

      return { count, lastMessage }
    } catch (error) {
      console.error('[MessageSyncService] Failed to get message stats:', error)
      return { count: 0, lastMessage: null }
    }
  }

  /**
   * 保存消息到数据库
   */
  private async saveToDatabase(sessionId: string, message: ChatMessage): Promise<ChatMessage> {
    try {
      // 确保会话存在
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId }
      })
      if (!session) {
        throw new Error(`Session with id ${sessionId} not found`)
      }

      // 创建消息实体
      const messageEntity = this.messageRepository.create({
        ...message,
        sessionId,
        session,
        createdAt: message.createdAt || new Date(),
        updatedAt: new Date()
      })

      return await this.messageRepository.save(messageEntity)
    } catch (error) {
      console.error('[MessageSyncService] Failed to save message to database:', error)
      throw error
    }
  }

  /**
   * 批量保存消息到数据库
   */
  private async saveBatchToDatabase(sessionId: string, messages: ChatMessage[]): Promise<ChatMessage[]> {
    try {
      // 确保会话存在
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId }
      })
      if (!session) {
        throw new Error(`Session with id ${sessionId} not found`)
      }

      // 创建消息实体数组
      const messageEntities = messages.map(message => 
        this.messageRepository.create({
          ...message,
          sessionId,
          session,
          createdAt: message.createdAt || new Date(),
          updatedAt: new Date()
        })
      )

      return await this.messageRepository.save(messageEntities)
    } catch (error) {
      console.error('[MessageSyncService] Failed to save batch messages to database:', error)
      throw error
    }
  }

  /**
   * 添加消息到引擎历史
   */
  private async addToEngineHistory(engine: AIAgentEngine, message: ChatMessage): Promise<void> {
    try {
      // 转换消息格式以适配引擎
      const engineMessage = this.convertToEngineMessage(message)
      
      // 添加到引擎的对话历史
      if (engine.conversationHistory) {
        engine.conversationHistory.push(engineMessage)
      } else {
        engine.conversationHistory = [engineMessage]
      }

      // 限制历史长度，避免内存溢出
      const maxHistoryLength = 1000
      if (engine.conversationHistory.length > maxHistoryLength) {
        engine.conversationHistory = engine.conversationHistory.slice(-maxHistoryLength)
      }
    } catch (error) {
      console.error('[MessageSyncService] Failed to add message to engine history:', error)
      throw error
    }
  }

  /**
   * 加载消息到引擎
   */
  private async loadMessagesToEngine(engine: AIAgentEngine, messages: ChatMessage[]): Promise<void> {
    try {
      // 转换消息格式
      const engineMessages = messages.map(message => this.convertToEngineMessage(message))
      
      // 设置引擎的对话历史
      engine.conversationHistory = engineMessages
    } catch (error) {
      console.error('[MessageSyncService] Failed to load messages to engine:', error)
      throw error
    }
  }

  /**
   * 清理引擎历史
   */
  private async clearEngineHistory(engine: AIAgentEngine): Promise<void> {
    try {
      engine.conversationHistory = []
    } catch (error) {
      console.error('[MessageSyncService] Failed to clear engine history:', error)
      throw error
    }
  }

  /**
   * 转换消息格式以适配引擎
   */
  convertToEngineMessage(message: ChatMessage): any {
    // 根据AIAgentEngine的消息格式进行转换
    // 这里需要根据实际的引擎消息格式进行调整
    return {
      id: message.id,
      type: message.type,
      content: message.content,
      role: message.role,
      timestamp: message.createdAt,
      metadata: message.metadata
    }
  }

  /**
   * 从引擎消息格式转换为数据库消息格式
   */
  convertFromEngineMessage(engineMessage: any, sessionId: string): ChatMessage {
    return {
      id: engineMessage.id || this.generateMessageId(),
      sessionId,
      type: engineMessage.type,
      content: engineMessage.content,
      role: engineMessage.role,
      createdAt: engineMessage.timestamp || new Date(),
      updatedAt: new Date(),
      metadata: engineMessage.metadata,
      tokenCount: 0,
      isDeleted: false
    } as ChatMessage
  }

  /**
   * 生成消息ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 转换消息格式以适配引擎
   */
  private convertToEngineMessage(message: ChatMessage): any {
    // 根据AIAgentEngine的消息格式进行转换
    // 这里需要根据实际的引擎消息格式进行调整
    return {
      id: message.id,
      type: message.type,
      content: message.content,
      role: message.role,
      timestamp: message.createdAt,
      metadata: message.metadata
    }
  }

  /**
   * 更新会话统计信息（公共方法）
   */
  async updateSessionStats(sessionId: string): Promise<void> {
    try {
      // 更新会话的最后活动时间
      await this.sessionRepository.update(sessionId, {
        updatedAt: new Date()
      })

      // TODO: 更新token使用统计等其他统计信息
    } catch (error) {
      console.error('[MessageSyncService] Failed to update session stats:', error)
      throw error
    }
  }

  /**
   * 更新会话统计信息（私有方法）
   */
  private async updateSessionStats(sessionId: string, message: ChatMessage): Promise<void> {
    try {
      // 更新会话的最后活动时间
      await this.sessionRepository.update(sessionId, {
        updatedAt: new Date()
      })

      // TODO: 更新token使用统计等其他统计信息
    } catch (error) {
      console.error('[MessageSyncService] Failed to update session stats:', error)
    }
  }
}