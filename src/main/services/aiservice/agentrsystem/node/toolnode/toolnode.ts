import { ToolMessage } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { tools } from '../../modelwithtool/tool'

const isSensitiveTool = (toolName: string): boolean =>
  /(delete|remove|edit|write|exec|shell|run|modify|replace|purge)/i.test(toolName)

const isRiskyTool = (toolName: string): boolean =>
  /(delete|remove|edit|write|exec|shell|run|modify|replace|purge|http|request|call)/i.test(toolName)

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
  const toolPolicy = state.personaPolicy?.tool
  // 遍历工具组执行调用
  for (const toolCall of msg.tool_calls) {
    if (
      toolPolicy?.confirmBeforeSensitiveTools &&
      isSensitiveTool(toolCall.name)
    ) {
      if (toolCall.id) {
        toolMessages.push(
          new ToolMessage({
            content:
              `Tool "${toolCall.name}" requires user confirmation under current persona policy. ` +
              'Ask user to confirm before executing this sensitive action.',
            tool_call_id: toolCall.id,
            status: 'error'
          })
        )
      }
      continue
    }

    if (toolPolicy && !toolPolicy.allowRiskyTools && isRiskyTool(toolCall.name)) {
      if (toolCall.id) {
        toolMessages.push(
          new ToolMessage({
            content:
              `Tool "${toolCall.name}" is blocked by current risk policy. ` +
              'Please provide a safer alternative or ask user for explicit override.',
            tool_call_id: toolCall.id,
            status: 'error'
          })
        )
      }
      continue
    }

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
