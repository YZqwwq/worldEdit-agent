import { AppDataSource } from '../../../database'
import { Message } from '@share/entity/database/Message'
import {
  hasMainAgentFileContent,
  normalizeMainAgentMessageContent,
  serializeMainAgentMessageContent,
  type MainAgentMessageContentPart
} from '@share/cache/AItype/states/mainAgentMessageContent'
import {
  VISIBLE_MAIN_AGENT_MESSAGE_STATUSES,
  type MainAgentMessageStatus
} from '@share/cache/AItype/states/mainAgentTurnState'

class ChatMessageService {
  private get repo() {
    return AppDataSource.getRepository(Message)
  }

  async getMessageById(messageId: number): Promise<Message | null> {
    return this.repo.findOneBy({ id: messageId })
  }

  async saveMessage(
    role: 'user' | 'ai',
    content: string,
    options?: {
      sessionId?: string
      turnId?: number | null
      status?: MainAgentMessageStatus
      eventId?: string | null
      consumer?: string | null
      contentParts?: MainAgentMessageContentPart[]
    }
  ): Promise<Message | null> {
    try {
      const eventId = options?.eventId?.trim() || null
      const consumer = options?.consumer?.trim() || null
      const sessionId = options?.sessionId?.trim() || 'default'
      const existing =
        eventId && role === 'ai'
          ? await this.repo.findOne({
              where: {
                eventId,
                role,
                ...(consumer ? { consumer } : {})
              },
              order: { id: 'DESC' }
            })
          : null

      const message = existing ?? new Message()
      const contentParts = normalizeMainAgentMessageContent(options?.contentParts)
      message.role = role
      message.content = content
      message.contentJson =
        contentParts.length > 0
          ? serializeMainAgentMessageContent(contentParts)
          : serializeMainAgentMessageContent([{ type: 'text', text: content }])
      message.type =
        contentParts.length > 1 || hasMainAgentFileContent(contentParts) ? 'structured' : 'text'
      message.sessionId = sessionId
      message.turnId = options?.turnId ?? message.turnId ?? null
      message.status = options?.status ?? 'committed'
      message.eventId = eventId
      message.consumer = consumer
      return await this.repo.save(message)
    } catch (error) {
      console.error('Failed to save message:', error)
      return null
    }
  }

  async getRecentHistory(limit = 50): Promise<Message[]> {
    try {
      const messages = await this.repo.find({
        where: VISIBLE_MAIN_AGENT_MESSAGE_STATUSES.map((status) => ({ status })),
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

  async attachMessageEventMetadata(
    messageId: number,
    input: {
      eventId: string
      consumer?: string | null
    }
  ): Promise<Message | null> {
    try {
      const message = await this.repo.findOneBy({ id: messageId })
      if (!message) {
        return null
      }
      message.eventId = input.eventId.trim()
      if (typeof input.consumer === 'string') {
        message.consumer = input.consumer.trim() || null
      }
      return await this.repo.save(message)
    } catch (error) {
      console.error('Failed to attach event metadata to message:', error)
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

  async markMessagesRevertedByEvent(eventId: string, role?: 'user' | 'ai'): Promise<void> {
    const trimmed = eventId.trim()
    if (!trimmed) {
      return
    }

    const messages = await this.repo.find({
      where: role
        ? { eventId: trimmed, role }
        : { eventId: trimmed }
    })
    if (messages.length === 0) {
      return
    }
    for (const message of messages) {
      message.status = 'reverted'
    }
    await this.repo.save(messages)
  }

  async getLatestVisibleMessage(): Promise<Message | null> {
    const rows = await this.repo.find({
      where: VISIBLE_MAIN_AGENT_MESSAGE_STATUSES.map((status) => ({ status })),
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
