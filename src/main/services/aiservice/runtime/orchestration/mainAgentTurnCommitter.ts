import { AppDataSource } from '../../../../database'
import { MainAgentEventRecord } from '@share/entity/database/MainAgentEventRecord'
import { MainAgentTurnRecord } from '@share/entity/database/MainAgentTurnRecord'
import { Message } from '@share/entity/database/Message'
import type { MainAgentCommitTurnEffect } from '@share/cache/AItype/states/taskLifecycleState'
import { serializeMainAgentMessageContent } from '@share/cache/AItype/states/mainAgentMessageContent'
import { memoryManager } from '../../agentrsystem/manager/memory/MemoryManager'
import { memorySlotService } from '../../agentrsystem/manager/memory/memorySlotService'
import { savePersonaState } from '../../agentrsystem/manager/personal/personalManager'
import { interactionObservationService } from '../../agentrsystem/manager/personal/interactionObservationService'
import type { InteractionObservationSnapshot } from '@share/cache/AItype/states/interactionObservation'
import { getMainAgentToolEntry } from '../../ai-utils/toolkits/mainAgentToolRegistry'
import { toolUsageStatsService } from '../../ai-utils/toolkits/toolUsageStatsService'
import { resolveTurnWorkspaceCommitPolicy } from './turnCommitPolicy'
import { persistFinalTurnVersionWithManager } from '../version/turnVersionPersistence'
import { sealTurnChangeSetWithManager } from '../../../toolEffects/toolChangeSetService'
import { agentArtifactService } from '../../artifacts/agentArtifactService'
import type { AgentArtifactRecord } from '@share/entity/database/AgentArtifactRecord'
import { parseMainAgentContentForPersistence } from '../../messagecontent/mainAgentMessageContentService'
import type { MainAgentMessageContentPart } from '@share/cache/AItype/states/mainAgentMessageContent'
import type { TurnWorkspaceDurableToolReceipt } from '@share/cache/AItype/states/turnWorkspace'
import { commitWorldDocumentChangeSetWithManager } from '../../../worldbuilding/worldDocumentVersionService'
import { agentLifeStateService } from '../../agentrsystem/manager/selfmodel/agentLifeStateService'

export type MainAgentTurnCommitInput = Pick<
  MainAgentCommitTurnEffect,
  | 'eventId'
  | 'sessionId'
  | 'turnId'
  | 'consumer'
  | 'status'
  | 'finalResponse'
  | 'workspace'
  | 'interruption'
  | 'errorMessage'
  | 'systemNotice'
  | 'observations'
>

class MainAgentTurnCommitter {
  async commitInterruptedTurn(input: MainAgentTurnCommitInput): Promise<void> {
    if (input.status !== 'interrupted') {
      throw new Error('commitInterruptedTurn requires an interrupted Turn input.')
    }
    await this.commit(input)
  }

  async commit(input: MainAgentTurnCommitInput): Promise<void> {
    this.assertInput(input)

    const [existingEvent, existingTurn] = await Promise.all([
      AppDataSource.getRepository(MainAgentEventRecord).findOneBy({ id: input.eventId }),
      AppDataSource.getRepository(MainAgentTurnRecord).findOneBy({ id: input.turnId })
    ])
    if (
      existingEvent?.status === 'completed' ||
      existingEvent?.status === 'cancelled' ||
      existingEvent?.status === 'failed'
    ) {
      return
    }
    if (
      existingTurn?.status === 'completed' ||
      existingTurn?.status === 'interrupted' ||
      existingTurn?.status === 'failed'
    ) {
      return
    }

    const turnArtifacts =
      input.status === 'failed'
        ? []
        : await agentArtifactService.listForTurn(input.eventId, input.turnId)
    const memoryMessages = await this.resolveMemoryMessages(input, turnArtifacts)
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

      if (input.status === 'failed') {
        await agentArtifactService.discardTurnDrafts(input.eventId, input.turnId, manager)
      }
      const committedArtifacts =
        input.status === 'failed'
          ? []
          : await agentArtifactService.commitTurnArtifacts(input.eventId, input.turnId, manager)
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
        const contentParts = this.buildResponseContentParts(
          input.finalResponse.content,
          committedArtifacts,
          input.workspace?.draft.durableToolReceipts ?? []
        )
        aiMessage.content = parseMainAgentContentForPersistence(contentParts)
        aiMessage.contentJson = serializeMainAgentMessageContent(contentParts)
        aiMessage.type = contentParts.length > 1 ? 'structured' : 'text'
        aiMessage.requestId = input.finalResponse.messageId
        aiMessage.sessionId = input.sessionId
        aiMessage.turnId = input.turnId
        aiMessage.status = input.status === 'interrupted' ? 'interrupted' : 'committed'
        aiMessage.eventId = input.eventId
        aiMessage.consumer = input.consumer
        aiMessage = await messageRepo.save(aiMessage)
        aiMessageId = aiMessage.id
      }
      if (input.status === 'failed' && input.systemNotice?.trim()) {
        let systemMessage = await messageRepo.findOne({
          where: {
            eventId: input.eventId,
            role: 'system',
            consumer: 'system_runtime'
          },
          order: { id: 'DESC' }
        })
        if (!systemMessage) systemMessage = messageRepo.create()
        const systemNotice = input.systemNotice.trim()
        systemMessage.role = 'system'
        systemMessage.content = systemNotice
        systemMessage.contentJson = serializeMainAgentMessageContent([
          { type: 'text', text: systemNotice }
        ])
        systemMessage.type = 'text'
        systemMessage.requestId = `${input.eventId}:system-error`
        systemMessage.sessionId = input.sessionId
        systemMessage.turnId = input.turnId
        systemMessage.status = 'committed'
        systemMessage.eventId = input.eventId
        systemMessage.consumer = 'system_runtime'
        await messageRepo.save(systemMessage)
      }

      const now = new Date()
      if (
        input.consumer === 'chat_runtime' ||
        input.consumer === 'task_notification_consumer' ||
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
        const workspaceCommitPolicy = resolveTurnWorkspaceCommitPolicy(input.status, input.consumer)
        if (workspaceCommitPolicy.commitMemorySlots && input.workspace.draft.memorySlots) {
          const slots = {
            ...input.workspace.draft.memorySlots,
            lastObservationId:
              lastCommittedObservationId ?? input.workspace.draft.memorySlots.lastObservationId
          }
          await memorySlotService.saveSnapshotWithManager(slots, manager)
        }
        if (workspaceCommitPolicy.commitPersona && input.workspace.draft.persona) {
          const persona = {
            ...input.workspace.draft.persona,
            last_observation_id:
              lastCommittedObservationId ?? input.workspace.draft.persona.last_observation_id
          }
          await savePersonaState(persona, manager)
        }
        if (workspaceCommitPolicy.commitLifeState && input.workspace.draft.lifeState) {
          const committed = await agentLifeStateService.commitCandidateWithManager(
            input.workspace.draft.lifeState,
            input.workspace.base.lifeState.revision,
            manager
          )
          if (!committed) {
            throw new Error(
              `Agent life state revision conflict: expected ${input.workspace.base.lifeState.revision}`
            )
          }
        }
      }

      if (input.status !== 'interrupted') {
        event.status = input.status === 'failed' ? 'failed' : 'completed'
        event.consumer = input.consumer
        event.summary = `turn_${input.status}`
        event.errorMessage = input.errorMessage?.trim() || ''
        event.finishedAt = now
        await eventRepo.save(event)
      }

      const changeSet = await sealTurnChangeSetWithManager(manager, input.eventId, input.turnId)
      if (changeSet) {
        await commitWorldDocumentChangeSetWithManager(manager, changeSet.id, 'agent')
      }

      const finalVersion = await persistFinalTurnVersionWithManager(manager, {
        turn,
        reuseReadySnapshot: input.status === 'completed',
        snapshotJson: JSON.stringify({
          schemaVersion: 1,
          eventId: input.eventId,
          turnId: input.turnId,
          sessionId: input.sessionId,
          consumer: input.consumer,
          status: input.status,
          finalResponse: input.finalResponse,
          workspace: input.workspace,
          interruption: input.interruption,
          errorMessage: input.errorMessage,
          systemNotice: input.systemNotice,
          observations: input.observations
        })
      })
      turn.headVersionId = finalVersion.id
      await turnRepo.save(turn)
    })

    if (input.status !== 'failed' && input.workspace) {
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
    input: MainAgentTurnCommitInput,
    artifacts: AgentArtifactRecord[]
  ): Promise<Array<{ role: 'user' | 'ai'; content: string }>> {
    if (input.status === 'failed') return []
    if (input.consumer === 'background_persona_stage_consumer') return []
    const attachmentContext = [
      this.formatArtifactContext(artifacts),
      this.formatDocumentDiffContext(input.workspace?.draft.durableToolReceipts ?? [])
    ]
      .filter(Boolean)
      .join('\n\n')
    if (input.workspace?.draft.memoryMessages.length) {
      const messages = input.workspace.draft.memoryMessages.map((message) => ({ ...message }))
      if (attachmentContext) {
        let lastAiIndex = -1
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          if (messages[index].role === 'ai') {
            lastAiIndex = index
            break
          }
        }
        if (lastAiIndex >= 0) {
          messages[lastAiIndex].content = `${messages[lastAiIndex].content}\n\n${attachmentContext}`
        } else if (input.finalResponse?.content.trim()) {
          messages.push({
            role: 'ai',
            content: `${input.finalResponse.content}\n\n${attachmentContext}`
          })
        }
      }
      return messages
    }

    const turn = await AppDataSource.getRepository(MainAgentTurnRecord).findOneBy({
      id: input.turnId
    })
    const messages: Array<{ role: 'user' | 'ai'; content: string }> = []
    if (turn?.userMessageId) {
      const userMessage = await AppDataSource.getRepository(Message).findOneBy({
        id: turn.userMessageId
      })
      if (userMessage?.content.trim()) messages.push({ role: 'user', content: userMessage.content })
    }
    if (input.finalResponse?.content.trim()) {
      messages.push({
        role: 'ai',
        content: attachmentContext
          ? `${input.finalResponse.content}\n\n${attachmentContext}`
          : input.finalResponse.content
      })
    }
    return messages
  }

  private buildResponseContentParts(
    text: string,
    artifacts: AgentArtifactRecord[],
    receipts: TurnWorkspaceDurableToolReceipt[]
  ): MainAgentMessageContentPart[] {
    const seenDiffRefs = new Set<string>()
    const documentDiffParts = receipts.flatMap<MainAgentMessageContentPart>((receipt) => {
      if (
        receipt.completionState !== 'completed' ||
        !receipt.diffRef ||
        seenDiffRefs.has(receipt.diffRef)
      ) {
        return []
      }
      seenDiffRefs.add(receipt.diffRef)
      const payload = receipt.payload ?? {}
      const documentId = receipt.subject?.id || String(payload.documentId || '')
      if (!documentId) return []
      return [
        {
          type: 'document_diff_ref',
          diffRef: receipt.diffRef,
          documentId,
          title: receipt.subject?.label || '文档修改',
          summary: receipt.summary,
          afterRevision: receipt.afterRevision,
          addedLines: Number(payload.addedLines) || 0,
          removedLines: Number(payload.removedLines) || 0
        }
      ]
    })
    return [
      { type: 'text', text },
      ...artifacts.map(
        (artifact): MainAgentMessageContentPart => ({
          type: 'artifact_ref',
          artifactId: artifact.id,
          artifactKind: artifact.kind,
          title: artifact.title,
          summary: artifact.summary || undefined
        })
      ),
      ...documentDiffParts
    ]
  }

  private formatArtifactContext(artifacts: AgentArtifactRecord[]): string {
    if (artifacts.length === 0) return ''
    return [
      '本轮关联的 Agent 观点产物：',
      ...artifacts.map(
        (artifact) =>
          `- ${artifact.id}《${artifact.title}》${artifact.summary ? `：${artifact.summary}` : ''}`
      )
    ].join('\n')
  }

  private formatDocumentDiffContext(receipts: TurnWorkspaceDurableToolReceipt[]): string {
    const edits = receipts.filter(
      (receipt) => receipt.completionState === 'completed' && receipt.diffRef
    )
    if (edits.length === 0) return ''
    return [
      '本轮已完成的文档修改：',
      ...edits.map(
        (receipt) =>
          `- ${receipt.subject?.label || receipt.subject?.id || '文档'}：${receipt.summary}${receipt.afterRevision ? `（revision ${receipt.afterRevision}）` : ''}`
      )
    ].join('\n')
  }

  private async resolveObservationDrafts(
    input: MainAgentTurnCommitInput
  ): Promise<InteractionObservationSnapshot[]> {
    if (input.status === 'interrupted') {
      return [
        ...(input.workspace?.draft.observations ?? []),
        ...(input.observations ?? []).map((observation) => ({
          id: 0,
          type: observation.type,
          source: observation.source,
          summary: observation.summary,
          payload: observation.payload ?? {},
          createdAt: new Date().toISOString()
        }))
      ]
    }
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

    const turn = await AppDataSource.getRepository(MainAgentTurnRecord).findOneBy({
      id: input.turnId
    })
    if (!turn?.userMessageId) return []
    const userMessage = await AppDataSource.getRepository(Message).findOneBy({
      id: turn.userMessageId
    })
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
