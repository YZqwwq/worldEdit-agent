import { BaseMessage, SystemMessage } from '@langchain/core/messages'
import { modelWithTool } from '../../modelwithtool/modelwithtool'
import { MessagesState } from '../../state/messageState'

export async function llmCall(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  // 动态调整消息顺序：确保 SystemMessage 位于首位
  // ContextNode 可能将 SystemMessage 追加到了末尾，这里进行一次重排序
  const sortedMessages = [...state.messages].sort((a, b) => {
    if (a instanceof SystemMessage) return -1
    if (b instanceof SystemMessage) return 1
    return 0
  })

  const response: BaseMessage = await modelWithTool.invoke(sortedMessages)
  return {
    messages: [response] as BaseMessage[], // ✅ 显式转换
    llmCalls: (state.llmCalls ?? 0) + 1
  }
}
