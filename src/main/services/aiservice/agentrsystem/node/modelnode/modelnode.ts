import { BaseMessage } from '@langchain/core/messages'
import { modelWithTool } from '../../modelwithtool/modelwithtool'
import { MessagesState } from '../../state/messageState'

export async function llmCall(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const response: BaseMessage = await modelWithTool.invoke(state.messages)
  return {
    messages: [response] as BaseMessage[], // ✅ 显式转换
    llmCalls: (state.llmCalls ?? 0) + 1
  }
}
