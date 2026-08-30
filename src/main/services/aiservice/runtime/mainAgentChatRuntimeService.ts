import { randomUUID } from 'node:crypto'
import { HumanMessage } from '@langchain/core/messages'
import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type { MainAgentMessageContentPart } from '@share/cache/AItype/states/mainAgentMessageContent'
import type {
  MainAgentBackgroundPersonaStagePayload,
  MainAgentTaskEvent,
  TaskLifecycleState
} from '@share/cache/AItype/states/taskLifecycleState'
import type { AgentWorkspaceContext } from '@share/cache/AItype/states/agentWorkspaceContext'
import type {
  MainAgentGraphTurnResult,
  MainAgentInterruptionRecord,
  TurnWorkspace
} from '@share/cache/AItype/states/turnWorkspace'
import { agent } from '../agentrsystem/agentReactSystem'
import { memorySlotService } from '../agentrsystem/manager/memory/memorySlotService'
import { loadPersonaState } from '../agentrsystem/manager/personal/personalManager'
import { selfCoreAuthorityService } from '../agentrsystem/manager/selfmodel/selfCoreAuthorityService'
import { createTurnWorkspace, withObservationDraft } from '../agentrsystem/state/turnWorkspace'
import {
  attachMainAgentContentPartsMetadata,
  getMainAgentContentPartsFromPersistedMessage,
  MAIN_AGENT_USER_MESSAGE_CREATED_AT_KEY,
  parseMainAgentContentForPersistence
} from '../messagecontent/mainAgentMessageContentService'
import { contentToText } from '../messageoutput/transformRespones'
import { runWithAgentRuntimeContext } from './agentRuntimeContext'
import { mainAgentRunControlService } from './mainAgentRunControlService'
import { chatMessageService } from '../chat/chatMessageService'
import { mainAgentTurnVersionService } from './version/mainAgentTurnVersionService'
import { isAgentLoopTerminationError } from '../agentrsystem/execution/reasoningLoopPolicy'
import { agentLifeStateService } from '../agentrsystem/manager/selfmodel/agentLifeStateService'

export type MainAgentChatRuntimeResult = {
  fullText: string
  interrupted: boolean
  graphResult?: MainAgentGraphTurnResult
  interruptedWorkspace?: TurnWorkspace
  interruption?: MainAgentInterruptionRecord
}

const readGraphTurnResult = (value: unknown): MainAgentGraphTurnResult | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<MainAgentGraphTurnResult> & {
    turnWorkspace?: MainAgentGraphTurnResult['workspace']
  }
  const workspace = candidate.workspace ?? candidate.turnWorkspace
  if (!workspace || typeof workspace !== 'object') return undefined
  return {
    workspace,
    finalResponse: candidate.finalResponse
  }
}

class MainAgentChatRuntimeService {
  async runTaskNotification(
    eventId: string,
    turnId: number,
    sessionId: string,
    taskEvent: MainAgentTaskEvent,
    resumeFromHead = false
  ): Promise<MainAgentChatRuntimeResult> {
    const runId = randomUUID()
    const controller = mainAgentRunControlService.startRun({ eventId, turnId })
    let fullText = ''
    const restoredHead = resumeFromHead ? await mainAgentTurnVersionService.loadHead(turnId) : null
    if (resumeFromHead && !restoredHead) {
      throw new Error(`Recovering task notification turn ${turnId} has no restorable HEAD.`)
    }
    if (restoredHead?.kind === 'ready_to_commit') {
      return {
        fullText: restoredHead.candidate.finalResponse.content,
        interrupted: false,
        graphResult: {
          workspace: restoredHead.candidate.workspace,
          finalResponse: restoredHead.candidate.finalResponse
        }
      }
    }
    const restoredState = restoredHead?.kind === 'checkpoint' ? restoredHead.state : null
    const restoredWorkspace = restoredState?.turnWorkspace
    const [memorySlots, persona, selfCore, lifeState] = restoredWorkspace
      ? [
          restoredWorkspace.base.memorySlots,
          restoredWorkspace.base.persona,
          restoredWorkspace.base.selfCore ?? null,
          restoredWorkspace.base.lifeState
        ]
      : await Promise.all([
          memorySlotService.reconcileFromObservations(),
          loadPersonaState(),
          selfCoreAuthorityService.load(),
          agentLifeStateService.load()
        ])
    const observationType =
      taskEvent.payload.outcome === 'completed'
        ? 'task_completed'
        : taskEvent.payload.outcome === 'needs_input'
          ? 'task_needs_input'
          : taskEvent.payload.outcome === 'cancelled'
            ? 'task_cancelled'
            : 'task_failed'
    const baseWorkspace =
      restoredWorkspace ??
      createTurnWorkspace({
        eventId,
        turnId,
        sessionId,
        runId,
        memorySlots,
        persona,
        selfCore,
        lifeState
      })
    const turnWorkspace =
      restoredWorkspace ??
      withObservationDraft(baseWorkspace, {
        id: (memorySlots.lastObservationId ?? 0) + 1,
        type: observationType,
        source: 'task_queue',
        summary: taskEvent.payload.summary || taskEvent.notice.message,
        payload: {
          taskId: taskEvent.taskId,
          notificationId: taskEvent.notificationId,
          notificationType: taskEvent.notificationType,
          outcome: taskEvent.payload.outcome,
          message: taskEvent.payload.message,
          details: taskEvent.payload.details
        },
        createdAt: new Date().toISOString()
      })
    const runtimeEventText = [
      `子 Agent 返回了任务「${taskEvent.activeTask.title}」的执行事件。`,
      `结果类型：${taskEvent.payload.outcome}`,
      `摘要：${taskEvent.payload.summary || '(none)'}`,
      `消息：${taskEvent.payload.message || '(none)'}`
    ].join('\n')
    let graphResult: MainAgentGraphTurnResult | undefined

    try {
      return await runWithAgentRuntimeContext(runId, { sessionId, eventId, turnId }, async () => {
        await mainAgentTurnVersionService.runInTurn({ eventId, turnId }, async () => {
          const graphInput = restoredState ?? {
            messages: [
              new HumanMessage({
                content: runtimeEventText,
                additional_kwargs: {
                  isRuntimeEvent: true,
                  runtimeEventKind: 'task_notification'
                }
              })
            ],
            turnInput: {
              kind: 'task_notification' as const,
              source: 'subagent' as const,
              content: runtimeEventText,
              occurredAt: new Date().toISOString(),
              taskEvent
            },
            taskLifecycle: {
              activeTask: taskEvent.activeTask,
              notice: taskEvent.notice
            },
            turnWorkspace
          }
          const stream = await agent.streamEvents(graphInput, {
            version: 'v2',
            signal: controller.signal
          } as {
            version: 'v2'
            signal: AbortSignal
          })
          for await (const event of stream) {
            if (
              event.event === 'on_chat_model_stream' &&
              event.metadata?.langgraph_node === 'expressionNode'
            ) {
              const chunk = event.data.chunk
              if (chunk?.content) fullText += contentToText(chunk.content)
            }
            if (event.event === 'on_chain_end') {
              graphResult = readGraphTurnResult(event.data?.output) ?? graphResult
            }
          }
          if (controller.signal.aborted) {
            throw new Error('Task notification turn was interrupted.')
          }
          if (!graphResult) {
            throw new Error('Task notification turn completed without a final result.')
          }
          await mainAgentTurnVersionService.prepareReadyToCommit(
            graphResult,
            'task_notification_consumer'
          )
        })
        return {
          fullText: graphResult?.finalResponse?.content ?? fullText,
          interrupted: false,
          graphResult
        }
      })
    } finally {
      mainAgentRunControlService.finishRun(eventId)
    }
  }

  async runUserMessage(
    eventId: string,
    turnId: number,
    userMessageId: number,
    content: MainAgentMessageContentPart[],
    workspaceContext?: AgentWorkspaceContext,
    onChunk?: (chunk: StreamChunk) => void,
    taskLifecycle?: TaskLifecycleState,
    resumeFromHead = false
  ): Promise<MainAgentChatRuntimeResult> {
    const runId = randomUUID()
    let fullText = ''
    const persistedMessage = await chatMessageService.getMessageById(userMessageId)
    const originalContent = getMainAgentContentPartsFromPersistedMessage(persistedMessage)
    const effectiveContent = originalContent.length > 0 ? originalContent : content
    const message = parseMainAgentContentForPersistence(effectiveContent)
    const userMessageCreatedAtIso =
      persistedMessage?.createdAt instanceof Date
        ? persistedMessage.createdAt.toISOString()
        : new Date().toISOString()
    const restoredHead = resumeFromHead ? await mainAgentTurnVersionService.loadHead(turnId) : null
    if (resumeFromHead && !restoredHead) {
      throw new Error(`Recovering turn ${turnId} has no restorable HEAD version.`)
    }
    if (restoredHead?.kind === 'ready_to_commit') {
      return {
        fullText: restoredHead.candidate.finalResponse.content,
        interrupted: false,
        graphResult: {
          workspace: restoredHead.candidate.workspace,
          finalResponse: restoredHead.candidate.finalResponse
        }
      }
    }
    const restoredState = restoredHead?.kind === 'checkpoint' ? restoredHead.state : null
    const restoredWorkspace = restoredState?.turnWorkspace
    const [memorySlots, persona, selfCore, lifeState] = restoredWorkspace
      ? [
          restoredWorkspace.base.memorySlots,
          restoredWorkspace.base.persona,
          restoredWorkspace.base.selfCore ?? null,
          restoredWorkspace.base.lifeState
        ]
      : await Promise.all([
          memorySlotService.reconcileFromObservations(),
          loadPersonaState(),
          selfCoreAuthorityService.load(),
          agentLifeStateService.load()
        ])
    const baseTurnWorkspace =
      restoredWorkspace ??
      createTurnWorkspace({
        eventId,
        turnId,
        sessionId: persistedMessage?.sessionId || 'default',
        runId,
        memorySlots,
        persona,
        selfCore,
        lifeState
      })
    const userText = persistedMessage?.content?.trim() || contentToText(message).trim()
    const turnWorkspace = restoredWorkspace
      ? restoredWorkspace
      : userText
        ? withObservationDraft(baseTurnWorkspace, {
            id: (memorySlots.lastObservationId ?? 0) + 1,
            type: 'user_message',
            source: 'user',
            summary: userText.slice(0, 120),
            payload: {
              text: userText,
              messageId: userMessageId,
              eventId
            },
            createdAt: new Date().toISOString()
          })
        : baseTurnWorkspace
    let graphResult: MainAgentGraphTurnResult | undefined
    const controller = mainAgentRunControlService.startRun({ eventId, turnId })

    try {
      return await runWithAgentRuntimeContext(
        runId,
        {
          sessionId: persistedMessage?.sessionId || 'default',
          eventId,
          turnId,
          emitChunk: onChunk
        },
        async () => {
        const graphInput = restoredState ?? {
          messages: [
            new HumanMessage({
              content: message,
              additional_kwargs: attachMainAgentContentPartsMetadata(
                {
                  [MAIN_AGENT_USER_MESSAGE_CREATED_AT_KEY]: userMessageCreatedAtIso
                },
                effectiveContent
              )
            })
          ],
          turnInput: {
            kind: 'user_message' as const,
            source: 'user' as const,
            content: message,
            occurredAt: userMessageCreatedAtIso
          },
          taskLifecycle,
          workspaceContext,
          turnWorkspace
        }
        await mainAgentTurnVersionService.runInTurn({ eventId, turnId }, async () => {
          const stream = await agent.streamEvents(graphInput, {
            version: 'v2',
            signal: controller.signal
          } as {
            version: 'v2'
            signal: AbortSignal
          })
          for await (const event of stream) {
            // Final Composition 同时生成用户正文和内部生活状态信封。
            // 不转发底层原始 token，避免内部 JSON 短暂出现在用户界面。
            if (event.event === 'on_chain_end') {
              graphResult = readGraphTurnResult(event.data?.output) ?? graphResult
            }
          }
          if (controller.signal.aborted) {
            throw new Error('Main agent run was interrupted after streaming completed.')
          }
          if (!graphResult) {
            throw new Error('Agent graph completed without a final turn result.')
          }
          await mainAgentTurnVersionService.prepareReadyToCommit(graphResult)
          if (controller.signal.aborted) {
            throw new Error('Main agent run was interrupted before commit.')
          }
        })
        const canonicalText = graphResult?.finalResponse?.content ?? fullText
        fullText = canonicalText
        if (canonicalText) {
          onChunk?.({
            type: 'text_delta',
            content: canonicalText
          })
        }
        return { fullText: canonicalText, interrupted: false, graphResult }
        }
      )
    } catch (error) {
      const interrupted =
        controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')
      if (!interrupted) {
        if (isAgentLoopTerminationError(error)) {
          try {
            await mainAgentRunControlService.waitForDurableToolExecutions(eventId)
            const stable = await mainAgentTurnVersionService.loadStableInterruptionState(turnId)
            error.turnWorkspace = stable.workspace
          } catch (captureError) {
            console.warn(
              'Failed to attach the stable workspace to a loop termination:',
              captureError
            )
          }
        }
        throw error
      }
      await mainAgentRunControlService.waitForDurableToolExecutions(eventId)
      return {
        fullText,
        interrupted: true,
        ...(await this.captureInterruption(turnId, controller.signal.reason))
      }
    } finally {
      mainAgentRunControlService.finishRun(eventId)
    }
  }

  private async captureInterruption(
    turnId: number,
    reason: unknown
  ): Promise<{
    interruptedWorkspace?: TurnWorkspace
    interruption: MainAgentInterruptionRecord
  }> {
    const stable = await mainAgentTurnVersionService.loadStableInterruptionState(turnId)
    return {
      interruptedWorkspace: stable.workspace,
      interruption: {
        reason: reason === 'runtime_reset' ? 'runtime_reset' : 'user_interrupted',
        interruptedAt: new Date().toISOString(),
        sourceVersionId: stable.sourceVersionId,
        resumePoint: stable.resumePoint
      }
    }
  }

  async runBackgroundPersonaStage(
    eventId: string,
    turnId: number,
    sessionId: string,
    payload: MainAgentBackgroundPersonaStagePayload
  ): Promise<MainAgentChatRuntimeResult> {
    const runId = randomUUID()
    const controller = mainAgentRunControlService.startRun({ eventId, turnId })
    let fullText = ''
    const stageMessage = this.buildBackgroundStageMessage(payload)
    const [memorySlots, persona, selfCore, lifeState] = await Promise.all([
      memorySlotService.reconcileFromObservations(),
      loadPersonaState(),
      selfCoreAuthorityService.load(),
      agentLifeStateService.load()
    ])
    const turnWorkspace = createTurnWorkspace({
      eventId,
      turnId,
      sessionId,
      runId,
      memorySlots,
      persona,
      selfCore,
      lifeState
    })
    let graphResult: MainAgentGraphTurnResult | undefined

    try {
      return await runWithAgentRuntimeContext(runId, { sessionId, eventId, turnId }, async () => {
        await mainAgentTurnVersionService.runInTurn({ eventId, turnId }, async () => {
          const stream = await agent.streamEvents(
            {
              messages: [
                new HumanMessage({
                  content: stageMessage,
                  additional_kwargs: {
                    isBackgroundPersonaStage: true,
                    [MAIN_AGENT_USER_MESSAGE_CREATED_AT_KEY]: new Date().toISOString()
                  }
                })
              ],
              turnInput: {
                kind: 'background_persona_stage' as const,
                source: 'system' as const,
                content: stageMessage,
                occurredAt: new Date().toISOString(),
                backgroundStage: payload
              },
              turnWorkspace
            },
            { version: 'v2', signal: controller.signal } as {
              version: 'v2'
              signal: AbortSignal
            }
          )

          for await (const event of stream) {
            if (
              event.event === 'on_chat_model_stream' &&
              event.metadata?.langgraph_node === 'expressionNode'
            ) {
              const chunk = event.data.chunk
              if (chunk && chunk.content) {
                fullText += contentToText(chunk.content)
              }
            }
            if (event.event === 'on_chain_end') {
              graphResult = readGraphTurnResult(event.data?.output) ?? graphResult
            }
          }
          if (controller.signal.aborted) {
            throw new Error('Background persona stage was interrupted after streaming completed.')
          }
        })
        return {
          fullText: graphResult?.finalResponse?.content ?? fullText,
          interrupted: false,
          graphResult
        }
      })
    } catch (error) {
      const interrupted =
        controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')
      if (!interrupted) {
        throw error
      }
      await mainAgentRunControlService.waitForDurableToolExecutions(eventId)
      return {
        fullText,
        interrupted: true,
        ...(await this.captureInterruption(turnId, controller.signal.reason))
      }
    } finally {
      mainAgentRunControlService.finishRun(eventId)
    }
  }

  private buildBackgroundStageMessage(payload: MainAgentBackgroundPersonaStagePayload): string {
    const lines = [
      '后台人格阶段任务。',
      '这不是用户即时消息，不要把它当作需要直接回复用户的对话。',
      '请以主 agent 自身的视角完成这一独立阶段任务，并输出阶段结果。',
      '',
      `任务标题：${payload.title}`,
      `后台任务 ID：${payload.backgroundTaskId}`,
      `阶段 ID：${payload.stageId}`,
      `阶段类型：${payload.stageKind}`,
      `继续位置：${payload.resumePointer}`,
      '',
      `阶段指令：${payload.instruction}`,
      payload.expectedResult ? `期望产物：${payload.expectedResult}` : '',
      '',
      `阶段输入：${JSON.stringify(payload.input, null, 2)}`,
      payload.context ? `阶段上下文：${JSON.stringify(payload.context, null, 2)}` : '',
      '',
      '输出要求：',
      '1. 区分客观结果与主观理解。',
      '2. 明确本阶段结束的位置。',
      '3. 记录这段经历如何影响你对相关内容的理解。',
      '4. 不要声称已经完成未被本阶段覆盖的后续内容。'
    ]

    return lines.filter((line) => line.trim().length > 0).join('\n')
  }
}

export const mainAgentChatRuntimeService = new MainAgentChatRuntimeService()
