import { BaseMessage, SystemMessage } from '@langchain/core/messages'
import { modelWithTool } from '../../modelwithtool/modelwithtool'
import { MessagesState } from '../../state/messageState'

export async function llmCall(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  // 动态调整消息顺序：确保 SystemMessage 位于首位，历史消息位于中间，当前用户输入位于最后
  // ContextNode 可能将 SystemMessage 和历史消息追加到了末尾，这里进行一次重排序
  const messages = [...state.messages]
  
  // 1. 提取 System Message
  const systemMsg = messages.find(m => m instanceof SystemMessage)
  
  const sortedMessages: BaseMessage[] = []
  
  // 添加 System
  if (systemMsg) sortedMessages.push(systemMsg)
  
  // 添加历史 (带 isHistory 标记的)
  const historyMsgs = messages.filter(m => m.additional_kwargs?.isHistory)
  sortedMessages.push(...historyMsgs)
  
  // 添加当前交互 (不带 isHistory 标记且非 System)
  const currentMsgs = messages.filter(m => 
    !(m instanceof SystemMessage) && 
    !m.additional_kwargs?.isHistory
  )
  sortedMessages.push(...currentMsgs)

  const response: BaseMessage = await modelWithTool.invoke(sortedMessages)
  return {
    messages: [response] as BaseMessage[], // ✅ 显式转换
    llmCalls: (state.llmCalls ?? 0) + 1
  }
}
