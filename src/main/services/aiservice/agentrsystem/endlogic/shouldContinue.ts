import { AIMessage } from '@langchain/core/messages'
import { END } from '@langchain/langgraph'
import { MessagesState } from '../state/messageState'

export async function shouldContinue(
  state: typeof MessagesState.State
): Promise<string | typeof END> {
  const lastMessage = state.messages.at(-1)
  if (lastMessage == null || !(lastMessage instanceof AIMessage)) return END

  // If the LLM makes a tool call, then perform an action
  // 检查最后一条消息是否包含工具调用，如果不包含则结束。
  if (lastMessage.tool_calls?.length) {
    return 'toolNode'
  }

  // Otherwise, we stop (reply to the user)
  return END
}
