import { randomUUID } from 'node:crypto'
import { HumanMessage } from '@langchain/core/messages'
import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type { MainAgentMessageContentPart } from '@share/cache/AItype/states/mainAgentMessageContent'
import type {
  MainAgentBackgroundPersonaStagePayload,
  TaskLifecycleState
} from '@share/cache/AItype/states/taskLifecycleState'
import { agent } from '../agentrsystem/agentReactSystem'
import {
  attachMainAgentContentPartsMetadata,
  getMainAgentContentPartsFromPersistedMessage,
  MAIN_AGENT_USER_MESSAGE_CREATED_AT_KEY,
  parseMainAgentContentForPersistence
} from '../messagecontent/mainAgentMessageContentService'
import { contentToText } from '../messageoutput/transformRespones'
import { runWithTraceContext } from '../../log/trace/agentTraceRuntime'
import { mainAgentRunControlService } from './mainAgentRunControlService'
import { chatMessageService } from '../chat/chatMessageService'

export type MainAgentChatRuntimeResult = {
  fullText: string
  interrupted: boolean
}

class MainAgentChatRuntimeService {
  async runUserMessage(
    eventId: string,
    turnId: number,
    userMessageId: number,
    content: MainAgentMessageContentPart[],
    onChunk?: (chunk: StreamChunk) => void,
    taskLifecycle?: TaskLifecycleState
  ): Promise<MainAgentChatRuntimeResult> {
    const runId = randomUUID()
    const controller = mainAgentRunControlService.startRun({ eventId, turnId })
    let fullText = ''
    const persistedMessage = await chatMessageService.getMessageById(userMessageId)
  const originalContent = getMainAgentContentPartsFromPersistedMessage(persistedMessage)
  const effectiveContent = originalContent.length > 0 ? originalContent : content
  const message = parseMainAgentContentForPersistence(effectiveContent)
  const userMessageCreatedAtIso =
    persistedMessage?.createdAt instanceof Date
      ? persistedMessage.createdAt.toISOString()
      : new Date().toISOString()

    try {
      return await runWithTraceContext(runId, { turnId, emitChunk: onChunk }, async () => {
        const stream = await agent.streamEvents(
          {
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
            taskLifecycle
          },
          { version: 'v2', signal: controller.signal } as {
            version: 'v2'
            signal: AbortSignal
          }
        )

        for await (const event of stream) {
          if (event.event === 'on_chat_model_stream') {
            const chunk = event.data.chunk
            if (chunk && chunk.content) {
              const token = contentToText(chunk.content)
              if (token) {
                fullText += token
                onChunk?.({
                  type: 'text_delta',
                  content: token
                })
              }
            }
          }
        }
        return { fullText, interrupted: false }
      })
    } catch (error) {
      const interrupted =
        controller.signal.aborted ||
        (error instanceof Error && error.name === 'AbortError')
      if (!interrupted) {
        throw error
      }
      return {
        fullText,
        interrupted: true
      }
    } finally {
      mainAgentRunControlService.finishRun(eventId)
    }
  }

  async runBackgroundPersonaStage(
    eventId: string,
    turnId: number,
    payload: MainAgentBackgroundPersonaStagePayload
  ): Promise<MainAgentChatRuntimeResult> {
    const runId = randomUUID()
    const controller = mainAgentRunControlService.startRun({ eventId, turnId })
    let fullText = ''
    const stageMessage = this.buildBackgroundStageMessage(payload)

    try {
      return await runWithTraceContext(runId, { turnId }, async () => {
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
            backgroundPersonaStage: payload
          },
          { version: 'v2', signal: controller.signal } as {
            version: 'v2'
            signal: AbortSignal
          }
        )

        for await (const event of stream) {
          if (event.event === 'on_chat_model_stream') {
            const chunk = event.data.chunk
            if (chunk && chunk.content) {
              fullText += contentToText(chunk.content)
            }
          }
        }
        return { fullText, interrupted: false }
      })
    } catch (error) {
      const interrupted =
        controller.signal.aborted ||
        (error instanceof Error && error.name === 'AbortError')
      if (!interrupted) {
        throw error
      }
      return {
        fullText,
        interrupted: true
      }
    } finally {
      mainAgentRunControlService.finishRun(eventId)
    }
  }

  private buildBackgroundStageMessage(payload: MainAgentBackgroundPersonaStagePayload): string {
    const lines = [
      '后台人格阶段任务。',
      '这不是用户即时消息，不要把它当作需要直接回复用户的对话。',
      '请以主 agent 自身的视角完成这一小段可暂停任务，并输出阶段结果。',
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
      '2. 明确本阶段结束后的停顿位置。',
      '3. 记录这段经历如何影响你对相关内容的理解。',
      '4. 不要声称已经完成未被本阶段覆盖的后续内容。'
    ]

    return lines.filter((line) => line.trim().length > 0).join('\n')
  }
}

export const mainAgentChatRuntimeService = new MainAgentChatRuntimeService()
