/**
 * 上下文管理器
 * 负责管理对话上下文、会话状态和数据持久化
 */

import type {
  ChatSession,
  ChatMessage,
  AgentConfig
} from '../../types/agent'
import { DEFAULT_AGENT_CONFIG } from '../../types/agent'

/**
 * 上下文管理器类
 */
export class ContextManager {
  private sessions: Map<string, ChatSession> = new Map()
  private currentSessionId: string | null = null
  private maxSessions = 50 // 最大会话数量
  private maxMessagesPerSession = 1000 // 每个会话最大消息数量

  /**
   * 创建新会话
   */
  createSession(title?: string, config?: AgentConfig): ChatSession {
    const sessionId = this.generateSessionId()
    const session: ChatSession = {
      id: sessionId,
      title: title || `对话 ${new Date().toLocaleString()}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      config: config || DEFAULT_AGENT_CONFIG as AgentConfig,
      metadata: {
        messageCount: 0,
        tokenUsage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        }
      }
    }

    this.sessions.set(sessionId, session)
    this.currentSessionId = sessionId
    
    // 清理旧会话
    this.cleanupOldSessions()
    
    return session
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): ChatSession | null {
    if (!this.currentSessionId) {
      return null
    }
    return this.sessions.get(this.currentSessionId) || null
  }

  /**
   * 切换到指定会话
   */
  switchToSession(sessionId: string): ChatSession | null {
    const session = this.sessions.get(sessionId)
    if (session) {
      this.currentSessionId = sessionId
      return session
    }
    return null
  }

  /**
   * 获取所有会话
   */
  getAllSessions(): ChatSession[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /**
   * 添加消息到当前会话
   */
  addMessage(message: ChatMessage): void {
    const session = this.getCurrentSession()
    if (!session) {
      throw new Error('没有活动会话')
    }

    session.messages.push(message)
    session.updatedAt = Date.now()
    if (session.metadata) {
      session.metadata.messageCount = session.messages.length
    }

    // 更新令牌使用统计
    if (message.metadata?.tokenUsage && session.metadata?.tokenUsage) {
      const usage = session.metadata.tokenUsage
      usage.promptTokens += message.metadata.tokenUsage.promptTokens || 0
      usage.completionTokens += message.metadata.tokenUsage.completionTokens || 0
      usage.totalTokens += message.metadata.tokenUsage.totalTokens || 0
    }

    // 限制消息数量
    this.trimSessionMessages(session)
  }

  /**
   * 获取会话消息
   */
  getSessionMessages(sessionId?: string): ChatMessage[] {
    const targetSessionId = sessionId || this.currentSessionId
    if (!targetSessionId) {
      return []
    }

    const session = this.sessions.get(targetSessionId)
    return session ? [...session.messages] : []
  }

  /**
   * 更新会话标题
   */
  updateSessionTitle(sessionId: string, title: string): boolean {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.title = title
      session.updatedAt = Date.now()
      return true
    }
    return false
  }

  /**
   * 删除会话
   */
  deleteSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId)
    
    // 如果删除的是当前会话，切换到最新的会话
    if (deleted && this.currentSessionId === sessionId) {
      const sessions = this.getAllSessions()
      this.currentSessionId = sessions.length > 0 ? sessions[0].id : null
    }
    
    return deleted
  }

  /**
   * 清空所有会话
   */
  clearAllSessions(): void {
    this.sessions.clear()
    this.currentSessionId = null
  }

  /**
   * 获取上下文窗口内的消息
   */
  getContextMessages(windowSize: number, sessionId?: string): ChatMessage[] {
    const messages = this.getSessionMessages(sessionId)
    return messages.slice(-windowSize)
  }

  /**
   * 搜索消息
   */
  searchMessages(query: string, sessionId?: string): ChatMessage[] {
    const messages = sessionId 
      ? this.getSessionMessages(sessionId)
      : this.getAllMessages()
    
    const lowerQuery = query.toLowerCase()
    return messages.filter(message => 
      message.content.toLowerCase().includes(lowerQuery)
    )
  }

  /**
   * 获取所有消息
   */
  private getAllMessages(): ChatMessage[] {
    const allMessages: ChatMessage[] = []
    for (const session of Array.from(this.sessions.values())) {
      allMessages.push(...session.messages)
    }
    return allMessages.sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 清理旧会话
   */
  private cleanupOldSessions(): void {
    const sessions = this.getAllSessions()
    if (sessions.length > this.maxSessions) {
      // 删除最旧的会话
      const sessionsToDelete = sessions.slice(this.maxSessions)
      for (const session of sessionsToDelete) {
        this.sessions.delete(session.id)
      }
    }
  }

  /**
   * 限制会话消息数量
   */
  private trimSessionMessages(session: ChatSession): void {
    if (session.messages.length > this.maxMessagesPerSession) {
      // 保留最新的消息
      session.messages = session.messages.slice(-this.maxMessagesPerSession)
      if (session.metadata) {
        session.metadata.messageCount = session.messages.length
      }
    }
  }

  /**
   * 导出会话数据
   */
  exportSession(sessionId: string): ChatSession | null {
    const session = this.sessions.get(sessionId)
    return session ? JSON.parse(JSON.stringify(session)) : null
  }

  /**
   * 导入会话数据
   */
  importSession(sessionData: ChatSession): boolean {
    try {
      // 验证会话数据格式
      if (!this.validateSessionData(sessionData)) {
        return false
      }

      this.sessions.set(sessionData.id, sessionData)
      return true
    } catch (error) {
      console.error('导入会话失败:', error)
      return false
    }
  }

  /**
   * 验证会话数据格式
   */
  private validateSessionData(sessionData: any): sessionData is ChatSession {
    return (
      typeof sessionData === 'object' &&
      typeof sessionData.id === 'string' &&
      typeof sessionData.title === 'string' &&
      Array.isArray(sessionData.messages) &&
      typeof sessionData.createdAt === 'number' &&
      typeof sessionData.updatedAt === 'number' &&
      typeof sessionData.metadata === 'object'
    )
  }

  /**
   * 获取会话统计信息
   */
  getSessionStats(sessionId?: string): {
    messageCount: number
    tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number }
    duration: number
  } | null {
    const targetSessionId = sessionId || this.currentSessionId
    if (!targetSessionId) {
      return null
    }

    const session = this.sessions.get(targetSessionId)
    if (!session) {
      return null
    }

    return {
      messageCount: session.metadata?.messageCount || 0,
      tokenUsage: {
        promptTokens: session.metadata?.tokenUsage?.promptTokens || 0,
        completionTokens: session.metadata?.tokenUsage?.completionTokens || 0,
        totalTokens: session.metadata?.tokenUsage?.totalTokens || 0
      },
      duration: session.updatedAt - session.createdAt
    }
  }

  /**
   * 获取全局统计信息
   */
  getGlobalStats(): {
    sessionCount: number
    totalMessages: number
    totalTokens: number
  } {
    let totalMessages = 0
    let totalTokens = 0

    for (const session of Array.from(this.sessions.values())) {
      totalMessages += session.metadata?.messageCount || 0
      totalTokens += session.metadata?.tokenUsage?.totalTokens || 0
    }

    return {
      sessionCount: this.sessions.size,
      totalMessages,
      totalTokens
    }
  }
}