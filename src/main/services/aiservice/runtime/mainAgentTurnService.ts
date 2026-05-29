import { AppDataSource } from '../../../database'
import { MainAgentTurnRecord } from '@share/entity/database/MainAgentTurnRecord'
import { Message } from '@share/entity/database/Message'
import {
  buildMainAgentMessageContent,
  buildMainAgentUserInputFromContent,
  type MainAgentUserMessageInput
} from '@share/cache/AItype/states/mainAgentMessageContent'
import { chatMessageService } from '../chat/chatMessageService'
import { getMainAgentContentPartsFromPersistedMessage } from '../messagecontent/mainAgentMessageContentService'
import {
  memoryManager,
  type MemoryCheckpoint
} from '../agentrsystem/manager/memory/MemoryManager'
import {
  createDefaultLongTermMemory
} from '../agentrsystem/manager/memory/longTermMemoryService'
import {
  REVERTIBLE_MAIN_AGENT_TURN_STATUSES,
  type MainAgentTurnSnapshot
} from '@share/cache/AItype/states/mainAgentTurnState'
import {
  assertMainAgentTurnStatusTransition,
  isTerminalMainAgentTurnStatus
} from '@share/cache/AItype/states/mainAgentOrchestrationRules'
import { interactionObservationService } from '../agentrsystem/manager/personal/interactionObservationService'

type SerializedMemoryCheckpoint = {
  state?: MemoryCheckpoint['state']
  shortTerm?: MemoryCheckpoint['shortTerm']
  longTerm?: MemoryCheckpoint['longTerm']
  archiveBuffer?: MemoryCheckpoint['archiveBuffer']
  lastStageIndex?: MemoryCheckpoint['lastStageIndex']
  lastArchivedAt?: MemoryCheckpoint['lastArchivedAt']
}

export type RevertLastTurnResult =
  | {
      ok: true
      revertedTurnId: number
      message: string
      restoredInput: MainAgentUserMessageInput
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
      longTerm: parsed.longTerm ?? createDefaultLongTermMemory(),
      archiveBuffer: Array.isArray(parsed.archiveBuffer) ? parsed.archiveBuffer : [],
      lastStageIndex: typeof parsed.lastStageIndex === 'number' ? parsed.lastStageIndex : 0,
      lastArchivedAt: typeof parsed.lastArchivedAt === 'string' ? parsed.lastArchivedAt : ''
    }
  } catch {
    return null
  }
}

const toPreview = (input: string): string | undefined => {
  const normalized = input.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return undefined
  }
  return normalized.length > 88 ? `${normalized.slice(0, 88)}...` : normalized
}

const restoreUserInputFromMessage = (message: Message | null): MainAgentUserMessageInput => {
  if (!message) {
    return {}
  }

  const content = getMainAgentContentPartsFromPersistedMessage(message)
  if (content.length > 0) {
    return buildMainAgentUserInputFromContent(content)
  }

  return buildMainAgentUserInputFromContent(
    buildMainAgentMessageContent({
      text: message.content
    })
  )
}

class MainAgentTurnService {
  private get repo() {
    return AppDataSource.getRepository(MainAgentTurnRecord)
  }

  private get messageRepo() {
    return AppDataSource.getRepository(Message)
  }

  private getLatestVisibleAnchorMessageId(turn: MainAgentTurnRecord): number | null {
    if (typeof turn.aiMessageId === 'number' && turn.aiMessageId > 0) {
      return turn.aiMessageId
    }
    if (typeof turn.userMessageId === 'number' && turn.userMessageId > 0) {
      return turn.userMessageId
    }
    return null
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

  async createBackgroundPersonaStageTurn(input: {
    eventId: string
    sessionId: string
  }): Promise<MainAgentTurnRecord> {
    const existing = await this.repo.findOneBy({ eventId: input.eventId })
    if (existing) {
      return existing
    }

    const memoryCheckpoint = await memoryManager.getCheckpoint()
    const turn = this.repo.create({
      eventId: input.eventId,
      sessionId: input.sessionId,
      consumer: 'background_persona_stage_consumer',
      status: 'queued',
      userMessageId: null,
      aiMessageId: null,
      reversible: 0,
      memoryCheckpointJson: JSON.stringify(memoryCheckpoint),
      errorMessage: '',
      startedAt: null,
      completedAt: null,
      interruptedAt: null,
      revertedAt: null
    })
    return this.repo.save(turn)
  }

  async findByEventId(eventId: string): Promise<MainAgentTurnRecord | null> {
    return this.repo.findOneBy({ eventId })
  }

  async markProcessing(turnId: number): Promise<void> {
    const turn = await this.repo.findOneBy({ id: turnId })
    if (!turn) return
    assertMainAgentTurnStatusTransition(turn.status, 'processing')
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
    assertMainAgentTurnStatusTransition(turn.status, 'completed')
    turn.status = 'completed'
    turn.completedAt = new Date()
    await this.repo.save(turn)
  }

  async markInterrupted(turnId: number): Promise<void> {
    const turn = await this.repo.findOneBy({ id: turnId })
    if (!turn) return
    assertMainAgentTurnStatusTransition(turn.status, 'interrupted')
    turn.status = 'interrupted'
    turn.interruptedAt = new Date()
    await this.repo.save(turn)
  }

  async markFailed(turnId: number, errorMessage: string): Promise<void> {
    const turn = await this.repo.findOneBy({ id: turnId })
    if (!turn) return
    assertMainAgentTurnStatusTransition(turn.status, 'failed')
    turn.status = 'failed'
    turn.errorMessage = errorMessage.trim()
    await this.repo.save(turn)
  }

  async reconcileIncompleteTurnForFailedEvent(input: {
    eventId: string
    errorMessage: string
  }): Promise<void> {
    const turn = await this.repo.findOneBy({ eventId: input.eventId })
    if (!turn) {
      return
    }

    if (isTerminalMainAgentTurnStatus(turn.status)) {
      return
    }

    const checkpoint = parseCheckpoint(turn.memoryCheckpointJson)
    if (checkpoint) {
      await memoryManager.restoreCheckpoint(checkpoint)
    }

    await chatMessageService.markMessagesRevertedByEvent(input.eventId, 'ai')
    await this.markFailed(turn.id, input.errorMessage)
  }

  async listRecentTurns(limit = 8): Promise<MainAgentTurnSnapshot[]> {
    const turns = await this.repo.find({
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit
    })

    if (turns.length === 0) {
      return []
    }

    const messageIds = turns.flatMap((turn) =>
      [turn.userMessageId, turn.aiMessageId].filter(
        (id): id is number => typeof id === 'number' && id > 0
      )
    )
    const messages = messageIds.length
      ? await this.messageRepo.find({
          where: [...new Set(messageIds)].map((id) => ({ id }))
        })
      : []
    const messageMap = new Map(messages.map((message) => [message.id, message]))

    return turns.map((turn) => ({
      id: turn.id,
      eventId: turn.eventId,
      sessionId: turn.sessionId,
      consumer: turn.consumer,
      status: turn.status,
      reversible: turn.reversible === 1,
      userMessageId: turn.userMessageId ?? undefined,
      aiMessageId: turn.aiMessageId ?? undefined,
      userPreview:
        typeof turn.userMessageId === 'number'
          ? toPreview(messageMap.get(turn.userMessageId)?.content ?? '')
          : undefined,
      aiPreview:
        typeof turn.aiMessageId === 'number'
          ? toPreview(messageMap.get(turn.aiMessageId)?.content ?? '')
          : undefined,
      createdAt: turn.createdAt.toISOString(),
      startedAt: turn.startedAt?.toISOString(),
      completedAt: turn.completedAt?.toISOString(),
      interruptedAt: turn.interruptedAt?.toISOString(),
      revertedAt: turn.revertedAt?.toISOString(),
      errorMessage: turn.errorMessage || undefined
    }))
  }

  async revertLastRevertibleTurn(): Promise<RevertLastTurnResult> {
    const turns = await this.repo.find({
      where: REVERTIBLE_MAIN_AGENT_TURN_STATUSES.map((status) => ({ status })),
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

    const anchorMessageId = this.getLatestVisibleAnchorMessageId(turn)
    if (!anchorMessageId) {
      return {
        ok: false,
        message: '最后一轮聊天缺少完整消息记录，暂时无法撤回。'
      }
    }

    const latestVisibleMessage = await chatMessageService.getLatestVisibleMessage()
    if (!latestVisibleMessage || latestVisibleMessage.id !== anchorMessageId) {
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
    const userMessage =
      typeof turn.userMessageId === 'number' && turn.userMessageId > 0
        ? await this.messageRepo.findOneBy({ id: turn.userMessageId })
        : null
    await chatMessageService.markMessagesReverted(
      [turn.userMessageId, turn.aiMessageId].filter(
        (id): id is number => typeof id === 'number' && id > 0
      )
    )

    assertMainAgentTurnStatusTransition(turn.status, 'reverted')
    turn.status = 'reverted'
    turn.revertedAt = new Date()
    await this.repo.save(turn)

    await interactionObservationService.record({
      type: 'user_revert',
      source: 'user',
      summary: '用户撤回了最后一轮普通聊天回复。',
      payload: {
        revertedTurnId: turn.id,
        userMessageId: turn.userMessageId,
        aiMessageId: turn.aiMessageId
      }
    })

    return {
      ok: true,
      revertedTurnId: turn.id,
      message: '已撤回最后一轮普通聊天回复，并恢复到生成前的记忆状态。',
      restoredInput: restoreUserInputFromMessage(userMessage)
    }
  }
}

export const mainAgentTurnService = new MainAgentTurnService()
