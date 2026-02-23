import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { tools } from '../../modelwithtool/tool'

export async function toolNode(
  state: typeof MessagesState.State
): Promise<{ messages: ToolMessage[] }> {
  const lastMessage = state.messages[state.messages.length - 1]

  // Check if message has tool_calls - relax instanceof check to handle AIMessageChunk or version mismatches
  // Use _getType() as seen in shouldContinue.ts or check constructor name
  const isAIMessage = (lastMessage as any)._getType?.() === 'ai' || lastMessage.constructor.name === 'AIMessage' || lastMessage.constructor.name === 'AIMessageChunk'
  
  if (!isAIMessage) {
    return { messages: [] }
  }

  // Cast to any to access tool_calls if types don't align
  const msg = lastMessage as any

  if (!msg.tool_calls?.length) {
    return { messages: [] }
  }

  const toolMessages: ToolMessage[] = []
  // 遍历工具组执行调用
  for (const toolCall of msg.tool_calls) {
    // ✅ 改进：工具不存在时返回错误消息，而不是静默跳过
    const tool = tools[toolCall.name]
    if (!tool) {
      if (toolCall.id) {
        toolMessages.push(
          new ToolMessage({
            content: `Tool "${toolCall.name}" not found. Available tools: ${Object.keys(tools).join(', ')}`,
            tool_call_id: toolCall.id,
            status: 'error'
          })
        )
      }
      continue
    }

    if (!toolCall.id) {
      console.warn('Tool call missing id, skipping')
      continue
    }

    try {
      // 暂时使用 any 后续添加类型守卫
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (tool as any).invoke(toolCall.args)
      toolMessages.push(
        new ToolMessage({
          content: String(result),
          tool_call_id: toolCall.id,
          name: toolCall.name
        })
      )
    } catch (error) {
      // ✅ 错误信息返回给 LLM，而不是静默失败
      toolMessages.push(
        new ToolMessage({
          content: `Error executing tool "${toolCall.name}": ${error instanceof Error ? error.message : String(error)}`,
          tool_call_id: toolCall.id,
          status: 'error'
        })
      )
    }
  }

  return { messages: toolMessages }
}
