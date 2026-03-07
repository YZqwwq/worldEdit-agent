import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { memoryManager } from '../../manager/memory/MemoryManager'
import { contentToText } from '../../../messageoutput/transformRespones'

export async function memoryNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const messages = state.messages
  
  // 策略：找到本轮对话中的 User 消息和 AI 消息并保存
  // 这里的假设是：memoryNode 在一轮对话的末尾运行
  
  const userMsg = messages.slice().reverse().find(
    m => m instanceof HumanMessage && !m.additional_kwargs?.isHistory
  )
  if (userMsg && typeof userMsg.content === 'string') {
    await memoryManager.addMessage('user', userMsg.content)
  }

  const aiMsg = messages.slice().reverse().find(
    m =>
      (m instanceof AIMessage || m.constructor.name === 'AIMessageChunk' || (m as any)._getType?.() === 'ai') &&
      !m.additional_kwargs?.isHistory
  )
  
  if (aiMsg) {
    const contentStr = contentToText(aiMsg.content)
    if (contentStr && contentStr.length > 0) {
      await memoryManager.addMessage('ai', contentStr)
    }
  }

  return {}
}
