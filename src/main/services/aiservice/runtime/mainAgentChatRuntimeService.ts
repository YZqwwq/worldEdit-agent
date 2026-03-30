import { randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { HumanMessage } from '@langchain/core/messages'
import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type { TaskLifecycleState } from '@share/cache/AItype/states/taskLifecycleState'
import { agent } from '../agentrsystem/agentReactSystem'
import { contentToText } from '../messageoutput/transformRespones'
import { handleGraphLogEvent, runWithGraphLogContext } from '../../log/graphlog'
import { mainAgentRunControlService } from './mainAgentRunControlService'

export type MainAgentChatRuntimeResult = {
  fullText: string
  interrupted: boolean
}

function debugLog(message: string) {
  try {
    const logPath = join(process.cwd(), 'src/main/services/log/logs/debug.log')
    appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`)
  } catch {
    // ignore debug log failures
  }
}

class MainAgentChatRuntimeService {
  async runUserMessage(
    eventId: string,
    turnId: number,
    message: string,
    onChunk?: (chunk: StreamChunk) => void,
    taskLifecycle?: TaskLifecycleState
  ): Promise<MainAgentChatRuntimeResult> {
    const runId = randomUUID()
    const controller = mainAgentRunControlService.startRun({ eventId, turnId })
    let fullText = ''
    debugLog(`sendStreamMessage called with: ${message}`)
    debugLog(`RunID generated: ${runId}`)

    try {
      return await runWithGraphLogContext(runId, async () => {
        debugLog('Entered runWithGraphLogContext')
        debugLog('Calling agent.streamEvents')

        const stream = await agent.streamEvents(
          { messages: [new HumanMessage(message)], taskLifecycle },
          { version: 'v2', signal: controller.signal } as {
            version: 'v2'
            signal: AbortSignal
          }
        )
        debugLog('streamEvents returned stream iterator')

        for await (const event of stream) {
          const logChunk = handleGraphLogEvent(event)
          if (logChunk && onChunk) onChunk(logChunk)

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

        debugLog('Stream loop finished')
        return { fullText, interrupted: false }
      }, onChunk)
    } catch (error) {
      const interrupted =
        controller.signal.aborted ||
        (error instanceof Error && error.name === 'AbortError')
      if (!interrupted) {
        throw error
      }

      debugLog('User interrupted active main-agent run')
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
