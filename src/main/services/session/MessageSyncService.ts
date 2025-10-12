import { TypeORMService } from '../database/TypeORMService'
import { ChatMessage, ChatSession } from '../../../shared/entities'
import {
  IMessageSyncService,
  IEngineLifecycleManager,
  SERVICE_TOKENS
} from '../../../shared/cache-types/session/session-manager.types'
import { Injectable, serviceContainer } from './ServiceContainer'

@Injectable(SERVICE_TOKENS.MESSAGE_SYNC_SERVICE)
export class MessageSyncService implements IMessageSyncService {
  private typeormService: TypeORMService

  constructor(typeormService: TypeORMService) {
    this.typeormService = typeormService
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    console.log('MessageSyncService - 服务已初始化')
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
   * 同步单个消息到数据库
   */
  async syncMessage(message: ChatMessage): Promise<void> {
    try {
      // 保存到数据库
      await this.typeormService.getRepository(ChatMessage).save(message)
      
      console.log('MessageSyncService - 消息已同步到数据库:', message.id)
    } catch (error) {
      console.error('MessageSyncService - 同步消息失败:', error)
      throw error
    }
  }

  /**
   * 批量同步消息到数据库
   */
  async syncMessages(messages: ChatMessage[]): Promise<void> {
    if (messages.length === 0) return

    try {
      // 批量保存到数据库
      await this.typeormService.getRepository(ChatMessage).save(messages)
      
      console.log(`MessageSyncService - ${messages.length}条消息已同步到数据库`)
    } catch (error) {
      console.error('MessageSyncService - 批量同步消息失败:', error)
      throw error
    }
  }

  /**
   * 从数据库加载消息历史
   */
  async loadMessageHistory(sessionId: string, limit: number = 50): Promise<ChatMessage[]> {
    try {
      const messages = await this.typeormService
        .getRepository(ChatMessage)
        .find({
          where: { sessionId, isDeleted: false },
          order: { createdAt: 'ASC' },
          take: limit
        })

      console.log(`MessageSyncService - 从数据库加载了${messages.length}条消息`)
      return messages
    } catch (error) {
      console.error('MessageSyncService - 加载消息历史失败:', error)
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
   * 清空会话的消息历史（软删除）
   */
  async clearMessageHistory(sessionId: string): Promise<void> {
    try {
      await this.typeormService
        .getRepository(ChatMessage)
        .update(
          { sessionId, isDeleted: false },
          { isDeleted: true, updatedAt: new Date() }
        )

      console.log(`MessageSyncService - 已清空会话 ${sessionId} 的消息历史`)
    } catch (error) {
      console.error('MessageSyncService - 清空消息历史失败:', error)
      throw error
    }
  }

  /**
   * 获取会话消息统计
   */
  async getMessageStats(sessionId: string): Promise<{
    count: number // 对话数量
    lastMessageAt: Date | null // 最后一条消息时间
    totalTokens: number // 总令牌数
    averageResponseTime: number // 平均响应时间（毫秒）
  }> {
    try {
      const count = await this.typeormService.getRepository(ChatMessage).count({
        where: { sessionId, isDeleted: false }
      })

      // 找到最后一条消息的创建时间
      const lastMessage = await this.typeormService.getRepository(ChatMessage).findOne({
        where: { sessionId, isDeleted: false },
        order: { createdAt: 'DESC' }
      })

      return { 
        count, 
        lastMessageAt: lastMessage?.createdAt || null,
        totalTokens: 0,
        averageResponseTime: 0 
      }
    } catch (error) {
      console.error('MessageSyncService - 获取消息统计失败:', error)
      return { count: 0, lastMessageAt: null, totalTokens: 0, averageResponseTime: 0 }
    }
  }

  /**
   * 保存消息到数据库
   */
  private async saveToDatabase(sessionId: string, message: ChatMessage): Promise<ChatMessage> {
    try {
      // 确保会话存在
      const session = await this.typeormService.getRepository(ChatSession).findOne({
        where: { id: sessionId }
      })
      if (!session) {
        throw new Error(`Session with id ${sessionId} not found`)
      }

      // 创建消息实体
      const messageEntity = this.typeormService.getRepository(ChatMessage).create({
        ...message,
        sessionId,
        session,
        createdAt: message.createdAt || new Date(),
        updatedAt: new Date()
      })

      return await this.typeormService.getRepository(ChatMessage).save(messageEntity)
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
      const session = await this.typeormService.getRepository(ChatSession).findOne({
        where: { id: sessionId }
      })
      if (!session) {
        throw new Error(`Session with id ${sessionId} not found`)
      }

      // 创建消息实体数组
      const messageEntities = messages.map(message => 
        this.typeormService.getRepository(ChatMessage).create({
          ...message,
          sessionId,
          session,
          createdAt: message.createdAt || new Date(),
          updatedAt: new Date()
        })
      )

      return await this.typeormService.getRepository(ChatMessage).save(messageEntities)
    } catch (error) {
      console.error('[MessageSyncService] Failed to save batch messages to database:', error)
      throw error
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
   * 更新会话统计信息
   */
  async updateSessionStats(sessionId: string): Promise<void> {
    try {
      // 更新会话的最后活动时间
      await this.typeormService.getRepository(ChatSession).update(sessionId, {
        updatedAt: new Date()
      })

      // TODO: 更新token使用统计等其他统计信息
    } catch (error) {
      console.error('MessageSyncService - 更新会话统计失败:', error)
      throw error
    }
  }
}