import { AppDataSource } from '../../../database'
import { Message } from '@share/entity/database/Message'

class ChatMessageService {
  private get repo() {
    return AppDataSource.getRepository(Message)
  }

  async saveMessage(
    role: 'user' | 'ai',
    content: string,
    options?: {
      sessionId?: string
      turnId?: number | null
      status?: Message['status']
      eventId?: string | null
      consumer?: string | null
    }
  ): Promise<Message | null> {
    try {
      const message = new Message()
      message.role = role
      message.content = content
      message.sessionId = options?.sessionId?.trim() || 'default'
      message.turnId = options?.turnId ?? null
      message.status = options?.status ?? 'committed'
      message.eventId = options?.eventId?.trim() || null
      message.consumer = options?.consumer?.trim() || null
      return await this.repo.save(message)
    } catch (error) {
      console.error('Failed to save message:', error)
      return null
    }
  }

  async getRecentHistory(limit = 50): Promise<Message[]> {
    try {
      const messages = await this.repo.find({
        where: [
          { status: 'committed' },
          { status: 'interrupted' }
        ],
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

  async attachMessageToTurn(messageId: number, turnId: number): Promise<Message | null> {
    try {
      const message = await this.repo.findOneBy({ id: messageId })
      if (!message) {
        return null
      }

      message.turnId = turnId
      return await this.repo.save(message)
    } catch (error) {
      console.error('Failed to attach message to turn:', error)
      return null
    }
  }

  async markMessagesReverted(messageIds: number[]): Promise<void> {
    if (messageIds.length === 0) {
      return
    }

    const uniqueIds = [...new Set(messageIds)]
    const messages = await this.repo.find({
      where: uniqueIds.map((id) => ({ id }))
    })
    for (const message of messages) {
      message.status = 'reverted'
    }
    await this.repo.save(messages)
  }

  async getLatestVisibleMessage(): Promise<Message | null> {
    const rows = await this.repo.find({
      where: [{ status: 'committed' }, { status: 'interrupted' }],
      order: {
        createdAt: 'DESC',
        id: 'DESC'
      },
      take: 1
    })

    return rows[0] ?? null
  }
}

export const chatMessageService = new ChatMessageService()
