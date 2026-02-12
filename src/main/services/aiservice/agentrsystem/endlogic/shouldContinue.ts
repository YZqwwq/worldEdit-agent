import { AIMessage } from '@langchain/core/messages'
import { END } from '@langchain/langgraph'
import { MessagesState } from '../state/messageState'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

function debugLog(msg: string) {
  try {
    const logPath = join(process.cwd(), 'src/main/services/log/logs/debug.log')
    appendFileSync(logPath, `[${new Date().toISOString()}] shouldContinue: ${msg}\n`)
  } catch (e) {
    // ignore
  }
}

export async function shouldContinue(
  state: typeof MessagesState.State
): Promise<string | typeof END> {
  const lastMessage = state.messages.at(-1)
  
  if (lastMessage) {
    debugLog(`Last message type: ${lastMessage.constructor.name}`)
    debugLog(`Last message content: ${typeof lastMessage.content === 'string' ? lastMessage.content.slice(0, 50) : 'complex'}`)
    
    if (lastMessage instanceof AIMessage) {
      debugLog(`Tool calls length: ${lastMessage.tool_calls?.length ?? 0}`)
      if (lastMessage.tool_calls?.length) {
        debugLog(`Tool calls: ${JSON.stringify(lastMessage.tool_calls)}`)
      }
    } else {
      debugLog(`Not an AIMessage`)
    }
  } else {
    debugLog(`No last message`)
  }

  if (lastMessage == null) return END

  // Check if it's an AI message (AIMessage or AIMessageChunk)
  // Using loose check for robustness against version mismatches or Chunk types
  const isAIMessage = lastMessage instanceof AIMessage || lastMessage.constructor.name === 'AIMessageChunk' || lastMessage._getType() === 'ai'
  
  if (!isAIMessage) {
    debugLog(`Not an AIMessage (strict check failed, loose check also failed?)`)
    return END
  }

  // Cast to any to access tool_calls safely if types don't align perfectly
  const msg = lastMessage as any

  // If the LLM makes a tool call, then perform an action
  // 检查最后一条消息是否包含工具调用，如果不包含则结束。
  if (msg.tool_calls?.length) {
    debugLog(`Routing to toolNode with ${msg.tool_calls.length} calls`)
    return 'toolNode'
  }

  debugLog(`Routing to END`)
  // Otherwise, we stop (reply to the user)
  return END
}
