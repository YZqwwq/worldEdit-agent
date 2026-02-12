import { BaseMessage, SystemMessage, AIMessage } from '@langchain/core/messages'
import { modelWithTool } from '../../modelwithtool/modelwithtool'
import { MessagesState } from '../../state/messageState'

// Helper to fix missing tool_calls from proxy response (Gemini/OpenAI compatible)
function fixToolCalls(response: BaseMessage): BaseMessage {
  if (!(response instanceof AIMessage)) return response
  
  // If tool_calls is already present, do nothing
  if (response.tool_calls && response.tool_calls.length > 0) return response

  const metadata = response.response_metadata
  if (!metadata || !metadata.output || !Array.isArray(metadata.output)) return response

  const toolCalls: any[] = []
  for (const item of metadata.output) {
    // Check for "function_call" type which some proxies return instead of tool_calls mapping
    if (item.type === 'function_call' || item.type === 'tool_call') {
      try {
        const args = typeof item.arguments === 'string' 
          ? JSON.parse(item.arguments) 
          : item.arguments
          
        toolCalls.push({
          name: item.name,
          args: args,
          id: item.call_id || item.id || `call_${Math.random().toString(36).substring(2, 10)}`,
          type: 'tool_call'
        })
      } catch (e) {
        console.warn('Failed to parse tool arguments:', e)
      }
    }
  }

  if (toolCalls.length > 0) {
    // Create new AIMessage with populated tool_calls
    return new AIMessage({
      content: response.content,
      additional_kwargs: response.additional_kwargs,
      response_metadata: response.response_metadata,
      tool_calls: toolCalls,
      id: response.id
    })
  }

  return response
}

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

  let response: BaseMessage = await modelWithTool.invoke(sortedMessages)
  
  // Fix tool calls if missing
  response = fixToolCalls(response)

  return {
    messages: [response] as BaseMessage[], // ✅ 显式转换
    llmCalls: (state.llmCalls ?? 0) + 1
  }
}
