import { randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { HumanMessage } from '@langchain/core/messages'
import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import { agent } from '../agentrsystem/agentReactSystem'
import { contentToText } from '../messageoutput/transformRespones'
import { handleGraphLogEvent, runWithGraphLogContext } from '../../log/graphlog'

export type MainAgentChatRuntimeResult = {
  fullText: string
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
    message: string,
    onChunk?: (chunk: StreamChunk) => void
  ): Promise<MainAgentChatRuntimeResult> {
    const runId = randomUUID()
    debugLog(`sendStreamMessage called with: ${message}`)
    debugLog(`RunID generated: ${runId}`)

    return runWithGraphLogContext(runId, async () => {
      debugLog('Entered runWithGraphLogContext')
      debugLog('Calling agent.streamEvents')

      const stream = await agent.streamEvents(
        { messages: [new HumanMessage(message)] },
        { version: 'v2' }
      )
      debugLog('streamEvents returned stream iterator')

      let fullText = ''

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
      return { fullText }
    }, onChunk)
  }
}

export const mainAgentChatRuntimeService = new MainAgentChatRuntimeService()
