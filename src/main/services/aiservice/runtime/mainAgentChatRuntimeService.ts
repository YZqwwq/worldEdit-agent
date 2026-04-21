import { randomUUID } from 'node:crypto'
import { HumanMessage } from '@langchain/core/messages'
import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type { MainAgentMessageContentPart } from '@share/cache/AItype/states/mainAgentMessageContent'
import type { TaskLifecycleState } from '@share/cache/AItype/states/taskLifecycleState'
import { agent } from '../agentrsystem/agentReactSystem'
import {
  attachMainAgentContentPartsMetadata,
  getMainAgentContentPartsFromPersistedMessage,
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

    try {
      return await runWithTraceContext(runId, { turnId, emitChunk: onChunk }, async () => {
        const stream = await agent.streamEvents(
          {
            messages: [
              new HumanMessage({
                content: message,
                additional_kwargs: attachMainAgentContentPartsMetadata(undefined, effectiveContent)
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
}

export const mainAgentChatRuntimeService = new MainAgentChatRuntimeService()
