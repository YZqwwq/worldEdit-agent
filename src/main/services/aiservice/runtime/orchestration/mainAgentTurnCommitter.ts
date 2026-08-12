import { AppDataSource } from '../../../../database'
import { MainAgentEventRecord } from '@share/entity/database/MainAgentEventRecord'
import { MainAgentTurnRecord } from '@share/entity/database/MainAgentTurnRecord'
import { Message } from '@share/entity/database/Message'
import type { MainAgentCommitTurnEffect } from '@share/cache/AItype/states/taskLifecycleState'
import {
  serializeMainAgentMessageContent
} from '@share/cache/AItype/states/mainAgentMessageContent'
import { memoryManager } from '../../agentrsystem/manager/memory/MemoryManager'
import { memorySlotService } from '../../agentrsystem/manager/memory/memorySlotService'
import { savePersonaState } from '../../agentrsystem/manager/personal/personalManager'
import { interactionObservationService } from '../../agentrsystem/manager/personal/interactionObservationService'
import type { InteractionObservationSnapshot } from '@share/cache/AItype/states/interactionObservation'
import { getMainAgentToolEntry } from '../../ai-utils/toolkits/mainAgentToolRegistry'
import { toolUsageStatsService } from '../../ai-utils/toolkits/toolUsageStatsService'
import { resolveTurnWorkspaceCommitPolicy } from './turnCommitPolicy'
import { persistFinalTurnVersionWithManager } from '../version/turnVersionPersistence'

export type MainAgentTurnCommitInput = Pick<
  MainAgentCommitTurnEffect,
  | 'eventId'
  | 'sessionId'
  | 'turnId'
  | 'consumer'
  | 'status'
  | 'finalResponse'
  | 'workspace'
  | 'errorMessage'
  | 'observations'
>

class MainAgentTurnCommitter {
  async commit(input: MainAgentTurnCommitInput): Promise<void> {
    this.assertInput(input)

    const existingEvent = await AppDataSource.getRepository(MainAgentEventRecord).findOneBy({
      id: input.eventId
    })
    if (existingEvent?.status === 'completed' || existingEvent?.status === 'failed') {
      return
    }

    const memoryMessages = await this.resolveMemoryMessages(input)
    const observationDrafts = await this.resolveObservationDrafts(input)
    await memoryManager.commitTurnAtomically(memoryMessages, async (manager) => {
      const eventRepo = manager.getRepository(MainAgentEventRecord)
      const turnRepo = manager.getRepository(MainAgentTurnRecord)
      const messageRepo = manager.getRepository(Message)
      const event = await eventRepo.findOneBy({ id: input.eventId })
      const turn = await turnRepo.findOneBy({ id: input.turnId })

      if (!event) throw new Error(`Cannot commit missing event: ${input.eventId}`)
      if (!turn) throw new Error(`Cannot commit missing turn: ${input.turnId}`)
      if (turn.eventId !== input.eventId) {
        throw new Error(`Turn ${input.turnId} does not belong to event ${input.eventId}`)
      }

      let aiMessageId = turn.aiMessageId
      if (input.finalResponse?.content.trim()) {
        let aiMessage = await messageRepo.findOne({
          where: {
            eventId: input.eventId,
            role: 'ai',
            consumer: input.consumer
          },
          order: { id: 'DESC' }
        })
        if (!aiMessage) aiMessage = messageRepo.create()
        aiMessage.role = 'ai'
        aiMessage.content = input.finalResponse.content
        aiMessage.contentJson = serializeMainAgentMessageContent([
          { type: 'text', text: input.finalResponse.content }
        ])
        aiMessage.type = 'text'
        aiMessage.requestId = input.finalResponse.messageId
        aiMessage.sessionId = input.sessionId
        aiMessage.turnId = input.turnId
        aiMessage.status = input.status === 'interrupted' ? 'interrupted' : 'committed'
        aiMessage.eventId = input.eventId
        aiMessage.consumer = input.consumer
        aiMessage = await messageRepo.save(aiMessage)
        aiMessageId = aiMessage.id
      }

      const now = new Date()
      if (
        input.consumer === 'chat_runtime' ||
        input.consumer === 'lifecycle_control' ||
        input.consumer === 'background_persona_stage_consumer'
      ) {
        turn.consumer = input.consumer
      }
      turn.aiMessageId = aiMessageId ?? null
      turn.status = input.status
      turn.errorMessage = input.errorMessage?.trim() || ''
      if (!turn.startedAt) turn.startedAt = now
      if (input.status === 'completed') turn.completedAt = now
      if (input.status === 'interrupted') turn.interruptedAt = now
      await turnRepo.save(turn)

      let lastCommittedObservationId: number | undefined
      for (const observation of observationDrafts) {
        const savedObservation = await interactionObservationService.record(
          {
            type: observation.type,
            source: observation.source,
            summary: observation.summary,
            payload: observation.payload
          },
          manager
        )
        lastCommittedObservationId = savedObservation.id
      }

      if (input.workspace) {
        const workspaceCommitPolicy = resolveTurnWorkspaceCommitPolicy(
          input.status,
          input.consumer
        )
        if (workspaceCommitPolicy.commitMemorySlots && input.workspace.draft.memorySlots) {
          const slots = {
            ...input.workspace.draft.memorySlots,
            lastObservationId:
              lastCommittedObservationId ?? input.workspace.draft.memorySlots.lastObservationId
          }
          await memorySlotService.saveSnapshotWithManager(
            slots,
            manager
          )
        }
        if (workspaceCommitPolicy.commitPersona && input.workspace.draft.persona) {
          const persona = {
            ...input.workspace.draft.persona,
            last_observation_id:
              lastCommittedObservationId ?? input.workspace.draft.persona.last_observation_id
          }
          await savePersonaState(persona, manager)
        }
      }

      event.status = input.status === 'failed' ? 'failed' : 'completed'
      event.consumer = input.consumer
      event.summary = `turn_${input.status}`
      event.errorMessage = input.errorMessage?.trim() || ''
      event.finishedAt = now
      await eventRepo.save(event)

      const finalVersion = await persistFinalTurnVersionWithManager(manager, {
        turn,
        snapshotJson: JSON.stringify({
          schemaVersion: 1,
          eventId: input.eventId,
          turnId: input.turnId,
          sessionId: input.sessionId,
          consumer: input.consumer,
          status: input.status,
          finalResponse: input.finalResponse,
          workspace: input.workspace,
          errorMessage: input.errorMessage,
          observations: input.observations
        })
      })
      turn.headVersionId = finalVersion.id
      await turnRepo.save(turn)
    })

    if (input.status === 'completed' && input.workspace) {
      for (const toolName of input.workspace.draft.successfulToolNames) {
        const entry = getMainAgentToolEntry(toolName)
        if (!entry || entry.activationMode === 'always') continue
        try {
          await toolUsageStatsService.recordToolUse({
            toolName,
            capabilityLayer: entry.capabilityLayer
          })
        } catch (error) {
          console.warn(`Failed to record committed tool usage for "${toolName}":`, error)
        }
      }
    }

    if (input.status !== 'failed') {
      try {
        await memoryManager.archivePendingIfNeeded()
      } catch (error) {
        console.warn('Failed to archive committed turn memory:', error)
      }
    }
  }

  private assertInput(input: MainAgentTurnCommitInput): void {
    if (
      input.status === 'completed' &&
      input.consumer !== 'background_persona_stage_consumer' &&
      !input.finalResponse?.content.trim()
    ) {
      throw new Error('Completed turn requires one canonical final response')
    }
    if (input.workspace) {
      if (input.workspace.eventId !== input.eventId || input.workspace.turnId !== input.turnId) {
        throw new Error('Turn workspace identity does not match commit input')
      }
      if (input.workspace.sessionId !== input.sessionId) {
        throw new Error('Turn workspace session does not match commit input')
      }
    }
  }

  private async resolveMemoryMessages(
    input: MainAgentTurnCommitInput
  ): Promise<Array<{ role: 'user' | 'ai'; content: string }>> {
    if (input.status === 'failed') return []
    if (input.consumer === 'background_persona_stage_consumer') return []
    if (input.workspace?.draft.memoryMessages.length) {
      return input.workspace.draft.memoryMessages
    }

    const turn = await AppDataSource.getRepository(MainAgentTurnRecord).findOneBy({ id: input.turnId })
    const messages: Array<{ role: 'user' | 'ai'; content: string }> = []
    if (turn?.userMessageId) {
      const userMessage = await AppDataSource.getRepository(Message).findOneBy({ id: turn.userMessageId })
      if (userMessage?.content.trim()) messages.push({ role: 'user', content: userMessage.content })
    }
    if (input.finalResponse?.content.trim()) {
      messages.push({ role: 'ai', content: input.finalResponse.content })
    }
    return messages
  }

  private async resolveObservationDrafts(
    input: MainAgentTurnCommitInput
  ): Promise<InteractionObservationSnapshot[]> {
    if (input.observations?.length) {
      return input.observations.map((observation) => ({
        id: 0,
        type: observation.type,
        source: observation.source,
        summary: observation.summary,
        payload: observation.payload ?? {},
        createdAt: new Date().toISOString()
      }))
    }
    if (input.status === 'failed' || input.consumer === 'background_persona_stage_consumer') {
      return []
    }
    if (input.workspace?.draft.observations.length) {
      return input.workspace.draft.observations
    }

    const turn = await AppDataSource.getRepository(MainAgentTurnRecord).findOneBy({ id: input.turnId })
    if (!turn?.userMessageId) return []
    const userMessage = await AppDataSource.getRepository(Message).findOneBy({ id: turn.userMessageId })
    const text = userMessage?.content.trim()
    if (!text) return []
    return [
      {
        id: 0,
        type: 'user_message',
        source: 'user',
        summary: text.slice(0, 120),
        payload: {
          text,
          messageId: turn.userMessageId,
          eventId: input.eventId
        },
        createdAt: new Date().toISOString()
      }
    ]
  }
}

export const mainAgentTurnCommitter = new MainAgentTurnCommitter()
