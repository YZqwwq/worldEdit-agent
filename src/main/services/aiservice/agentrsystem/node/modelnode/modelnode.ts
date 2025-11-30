import { BaseMessage, SystemMessage } from '@langchain/core/messages'
import { modelWithTool } from '../../modelwithtool/modelwithtool'
import { MessagesState } from '../../state/messageState'

export async function llmCall(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const response: BaseMessage = await modelWithTool.invoke([
    new SystemMessage(
      'You are a helpful assistant tasked with performing arithmetic on a set of inputs.'
    ),
    ...state.messages
  ])
  return {
    messages: [response] as BaseMessage[], // ✅ 显式转换
    llmCalls: (state.llmCalls ?? 0) + 1
  }
}
