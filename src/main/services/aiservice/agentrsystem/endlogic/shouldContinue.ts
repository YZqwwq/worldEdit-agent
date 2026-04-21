import { AIMessage } from '@langchain/core/messages'
import { END } from '@langchain/langgraph'
import { MessagesState } from '../state/messageState'
import { traceDecision } from '../../../log/trace/agentTraceEmitter'

export async function shouldContinue(
  state: typeof MessagesState.State
): Promise<string | typeof END> {
  const lastMessage = state.messages.at(-1)

  if (lastMessage == null) return END // 这里可能需要改为 memoryNode？如果没消息也需要归档吗？通常不会发生。

  // Check if it's an AI message (AIMessage or AIMessageChunk)
  // Using loose check for robustness against version mismatches or Chunk types
  const isAIMessage = lastMessage instanceof AIMessage || lastMessage.constructor.name === 'AIMessageChunk' || lastMessage._getType() === 'ai'
  
  if (!isAIMessage) {
    return END
  }

  // Cast to any to access tool_calls safely if types don't align perfectly
  const msg = lastMessage as any

  // If the LLM makes a tool call, then perform an action
  // 检查最后一条消息是否包含工具调用，如果不包含则结束。
  if (msg.tool_calls?.length) {
    traceDecision('shouldContinue', {
      title: '决策: shouldContinue 路由',
      summary: `route=toolNode，toolCalls=${msg.tool_calls.length}`,
      data: {
        lastMessageType: lastMessage.constructor.name,
        toolCallCount: msg.tool_calls.length,
        route: 'toolNode'
      }
    })
    return 'toolNode'
  }

  traceDecision('shouldContinue', {
    title: '决策: shouldContinue 路由',
    summary: 'route=memoryNode',
    data: {
      lastMessageType: lastMessage.constructor.name,
      toolCallCount: 0,
      route: 'memoryNode'
    }
  })
  // Otherwise, we stop (reply to the user)
  // 改为跳转到 memoryNode 进行记忆管理
  return 'memoryNode'
}
