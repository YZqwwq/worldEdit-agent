import { AppDataSource } from '../../../database'
import { MainAgentTurnRecord } from '@share/entity/database/MainAgentTurnRecord'
import { chatMessageService } from '../chat/chatMessageService'
import {
  memoryManager,
  type MemoryCheckpoint
} from '../agentrsystem/manager/memory/MemoryManager'

type SerializedMemoryCheckpoint = {
  state?: MemoryCheckpoint['state']
  shortTerm?: MemoryCheckpoint['shortTerm']
  summary?: string
}

export type RevertLastTurnResult =
  | {
      ok: true
      revertedTurnId: number
      message: string
    }
  | {
      ok: false
      message: string
    }

const parseCheckpoint = (raw: string): MemoryCheckpoint | null => {
  try {
    const parsed = JSON.parse(raw) as SerializedMemoryCheckpoint
    if (!parsed || !parsed.state || !Array.isArray(parsed.shortTerm)) {
      return null
    }

    return {
      state: parsed.state,
      shortTerm: parsed.shortTerm,
      summary: typeof parsed.summary === 'string' ? parsed.summary : ''
    }
  } catch {
    return null
  }
}

class MainAgentTurnService {
  private get repo() {
    return AppDataSource.getRepository(MainAgentTurnRecord)
  }

  async createUserMessageTurn(input: {
    eventId: string
    sessionId: string
    userMessageId: number
  }): Promise<MainAgentTurnRecord> {
    const existing = await this.repo.findOneBy({ eventId: input.eventId })
    if (existing) {
      return existing
    }

    const memoryCheckpoint = await memoryManager.getCheckpoint()
    const turn = this.repo.create({
      eventId: input.eventId,
      sessionId: input.sessionId,
      consumer: 'chat_runtime',
      status: 'queued',
      userMessageId: input.userMessageId,
      aiMessageId: null,
      reversible: 1,
      memoryCheckpointJson: JSON.stringify(memoryCheckpoint),
      errorMessage: '',
      startedAt: null,
      completedAt: null,
      interruptedAt: null,
      revertedAt: null
    })
    const saved = await this.repo.save(turn)
    await chatMessageService.attachMessageToTurn(input.userMessageId, saved.id)
    return saved
  }

  async markProcessing(turnId: number): Promise<void> {
    const turn = await this.repo.findOneBy({ id: turnId })
    if (!turn) return
    turn.status = 'processing'
    if (!turn.startedAt) {
      turn.startedAt = new Date()
    }
    await this.repo.save(turn)
  }

  async attachAiMessage(turnId: number, messageId: number): Promise<void> {
    const turn = await this.repo.findOneBy({ id: turnId })
    if (!turn) return
    turn.aiMessageId = messageId
    await this.repo.save(turn)
  }

  async markCompleted(turnId: number): Promise<void> {
    const turn = await this.repo.findOneBy({ id: turnId })
    if (!turn) return
    turn.status = 'completed'
    turn.completedAt = new Date()
    await this.repo.save(turn)
  }

  async markInterrupted(turnId: number): Promise<void> {
    const turn = await this.repo.findOneBy({ id: turnId })
    if (!turn) return
    turn.status = 'interrupted'
    turn.interruptedAt = new Date()
    await this.repo.save(turn)
  }

  async markFailed(turnId: number, errorMessage: string): Promise<void> {
    const turn = await this.repo.findOneBy({ id: turnId })
    if (!turn) return
    turn.status = 'failed'
    turn.errorMessage = errorMessage.trim()
    await this.repo.save(turn)
  }

  async revertLastRevertibleTurn(): Promise<RevertLastTurnResult> {
    const turns = await this.repo.find({
      where: [{ status: 'completed' }, { status: 'interrupted' }],
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 1
    })
    const turn = turns[0]
    if (!turn || turn.reversible !== 1) {
      return {
        ok: false,
        message: '当前没有可撤回的最后一轮普通聊天回复。'
      }
    }

    if (!turn.userMessageId || !turn.aiMessageId) {
      return {
        ok: false,
        message: '最后一轮聊天缺少完整消息记录，暂时无法撤回。'
      }
    }

    const latestVisibleMessage = await chatMessageService.getLatestVisibleMessage()
    if (!latestVisibleMessage || latestVisibleMessage.id !== turn.aiMessageId) {
      return {
        ok: false,
        message: '最后一轮聊天之后已经出现了更新的消息，当前只允许撤回最末一轮回复。'
      }
    }

    const checkpoint = parseCheckpoint(turn.memoryCheckpointJson)
    if (!checkpoint) {
      return {
        ok: false,
        message: '最后一轮聊天缺少可恢复的记忆快照，暂时无法撤回。'
      }
    }

    await memoryManager.restoreCheckpoint(checkpoint)
    await chatMessageService.markMessagesReverted([turn.userMessageId, turn.aiMessageId])

    turn.status = 'reverted'
    turn.revertedAt = new Date()
    await this.repo.save(turn)

    return {
      ok: true,
      revertedTurnId: turn.id,
      message: '已撤回最后一轮普通聊天回复，并恢复到生成前的记忆状态。'
    }
  }
}

export const mainAgentTurnService = new MainAgentTurnService()
