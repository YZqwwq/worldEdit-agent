import { AppDataSource } from '../../../database'
import { Message } from '@share/entity/database/Message'

class ChatMessageService {
  private get repo() {
    return AppDataSource.getRepository(Message)
  }

  async saveMessage(
    role: 'user' | 'ai',
    content: string,
    options?: { sessionId?: string }
  ): Promise<Message | null> {
    try {
      const message = new Message()
      message.role = role
      message.content = content
      message.sessionId = options?.sessionId?.trim() || 'default'
      return await this.repo.save(message)
    } catch (error) {
      console.error('Failed to save message:', error)
      return null
    }
  }

  async getRecentHistory(limit = 50): Promise<Message[]> {
    try {
      const messages = await this.repo.find({
        order: {
          createdAt: 'DESC',
          id: 'DESC'
        },
        take: limit
      })
      return messages.reverse()
    } catch (error) {
      console.error('Failed to get history:', error)
      return []
    }
  }

  async clearAll(): Promise<void> {
    await this.repo.clear()
  }
}

export const chatMessageService = new ChatMessageService()
