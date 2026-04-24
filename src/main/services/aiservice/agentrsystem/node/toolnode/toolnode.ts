import { ToolMessage } from '@langchain/core/messages'
import { parseAgentToolResultEnvelope } from '../../../ai-utils/core/agentTool'
import { getMainAgentTools } from '../../../ai-utils/toolkits/mainAgentToolRegistry'
import {
  traceArtifact,
  traceDecision,
  traceError,
  traceState
} from '../../../../log/trace/agentTraceEmitter'
import { MessagesState } from '../../state/messageState'

const isSensitiveTool = (toolName: string): boolean =>
  /(delete|remove|edit|write|exec|shell|run|modify|replace|purge)/i.test(toolName)

const isRiskyTool = (toolName: string): boolean =>
  /(delete|remove|edit|write|exec|shell|run|modify|replace|purge|http|request|call)/i.test(toolName)

const buildToolMessageContent = (
  toolName: string,
  envelope: ReturnType<typeof parseAgentToolResultEnvelope>,
  fallbackResult: unknown
): string => {
  if (!envelope) {
    return String(fallbackResult)
  }

  const data =
    envelope.data && typeof envelope.data === 'object' ? (envelope.data as Record<string, unknown>) : null

  if (toolName === 'official_web_search' && data) {
    const compact = {
      ok: envelope.ok,
      toolName,
      message: envelope.message,
      data: {
        summary: typeof data.summary === 'string' ? data.summary : '',
        usedSearch: data.usedSearch === true,
        searchMode: data.searchMode === 'forced' ? 'forced' : null,
        hasStructuredSources: data.hasStructuredSources === true,
        resultCount:
          typeof data.resultCount === 'number' && Number.isFinite(data.resultCount)
            ? data.resultCount
            : 0,
        sources: Array.isArray(data.sources)
          ? (data.sources as Array<Record<string, unknown>>).map((item) => ({
              title: typeof item.title === 'string' ? item.title : '',
              url: typeof item.url === 'string' ? item.url : ''
            }))
          : []
      }
    }

    return JSON.stringify(compact, null, 2)
  }

  const genericCompact = {
    ok: envelope.ok,
    toolName,
    message: envelope.message,
    error: envelope.error,
    data: data ?? envelope.data ?? null
  }

  return JSON.stringify(genericCompact, null, 2)
}

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
  const tools = getMainAgentTools()
  const executedTools: Array<Record<string, unknown>> = []
  // 遍历工具组执行调用
  for (const toolCall of msg.tool_calls) {
    traceState('toolNode', {
      title: `状态: toolNode 调用 ${toolCall.name}`,
      summary: `准备调用 ${toolCall.name}`,
      data: {
        toolName: toolCall.name,
        toolCallId: toolCall.id ?? null,
        args: toolCall.args ?? {}
      }
    })

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
      traceDecision('toolNode', {
        title: `决策: toolNode 拦截 ${toolCall.name}`,
        summary: `${toolCall.name} 需要用户确认，已拦截`,
        data: {
          toolName: toolCall.name,
          toolCallId: toolCall.id ?? null,
          reason: 'confirm_before_sensitive_tools',
          args: toolCall.args ?? {}
        }
      })
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
      traceDecision('toolNode', {
        title: `决策: toolNode 拦截 ${toolCall.name}`,
        summary: `${toolCall.name} 被当前风险策略阻止`,
        data: {
          toolName: toolCall.name,
          toolCallId: toolCall.id ?? null,
          reason: 'risk_policy_blocked',
          args: toolCall.args ?? {}
        }
      })
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
      traceError('toolNode', new Error(`Tool "${toolCall.name}" not found.`), {
        title: `异常: toolNode ${toolCall.name}`,
        summary: `${toolCall.name} 不存在`,
        data: {
          toolName: toolCall.name,
          toolCallId: toolCall.id ?? null,
          args: toolCall.args ?? {},
          availableTools: Object.keys(tools)
        }
      })
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
      const envelope = parseAgentToolResultEnvelope(result)
      const envelopeData =
        envelope?.data && typeof envelope.data === 'object' ? envelope.data : undefined
      executedTools.push({
        name: toolCall.name,
        ok: envelope?.ok ?? null,
        message: envelope?.message ?? null,
        receipt: envelope?.receipt?.summary ?? null,
        searchMode:
          typeof envelope?.data === 'object' &&
          envelope?.data &&
          'searchMode' in envelope.data
            ? (envelope.data as any).searchMode
            : undefined,
        hasStructuredSources:
          typeof envelope?.data === 'object' &&
          envelope?.data &&
          'hasStructuredSources' in envelope.data
            ? Boolean((envelope.data as any).hasStructuredSources)
            : undefined,
        resultCount:
          typeof envelope?.data === 'object' &&
          envelope?.data &&
          'resultCount' in envelope.data &&
          Number.isFinite((envelope.data as any).resultCount)
            ? (envelope.data as any).resultCount
            : undefined,
        usedSearch:
          typeof envelope?.data === 'object' &&
          envelope?.data &&
          'usedSearch' in envelope.data
            ? Boolean((envelope.data as any).usedSearch)
            : undefined
      })
      traceArtifact('toolNode', {
        title: `产物: toolNode ${toolCall.name} 返回`,
        summary:
          envelope?.ok === false
            ? `${toolCall.name} 返回失败：${envelope.error?.message || envelope.message}`
            : `${toolCall.name} 已返回结果`,
        data: {
          toolName: toolCall.name,
          toolCallId: toolCall.id,
          args: toolCall.args ?? {},
          ok: envelope?.ok ?? null,
          message: envelope?.message ?? null,
          error: envelope?.error ?? null,
          receipt: envelope?.receipt ?? null,
          nextSuggestions: envelope?.nextSuggestions ?? [],
          meta: envelope?.meta ?? null,
          data: envelopeData ?? result
        }
      })
      toolMessages.push(
        new ToolMessage({
          content: buildToolMessageContent(toolCall.name, envelope, result),
          tool_call_id: toolCall.id,
          name: toolCall.name
        })
      )
    } catch (error) {
      // ✅ 错误信息返回给 LLM，而不是静默失败
      traceError('toolNode', error, {
        title: `异常: toolNode ${toolCall.name}`,
        summary: `${toolCall.name} 执行失败`,
        data: {
          toolName: toolCall.name,
          toolCallId: toolCall.id,
          args: toolCall.args ?? {}
        }
      })
      toolMessages.push(
        new ToolMessage({
          content: `Error executing tool "${toolCall.name}": ${error instanceof Error ? error.message : String(error)}`,
          tool_call_id: toolCall.id,
          status: 'error'
        })
      )
    }
  }

  traceDecision('toolNode', {
    title: '决策: toolNode 工具调用',
    summary: `收到 ${msg.tool_calls.length} 个工具调用`,
    data: {
      toolCallCount: msg.tool_calls.length,
      toolNames: msg.tool_calls.map((toolCall: { name: string }) => toolCall.name)
    }
  })

  if (executedTools.length > 0) {
    traceArtifact('toolNode', {
      title: '产物: toolNode 执行结果',
      summary: executedTools
        .map((item) => {
          const name = String(item.name || 'unknown_tool')
          const isForcedSearch = item.usedSearch === true && item.searchMode === 'forced'
          const hasStructuredSources = item.hasStructuredSources === true
          if (isForcedSearch) {
            if (hasStructuredSources && typeof item.resultCount === 'number') {
              return `${name}，已执行强制联网搜索，返回 ${item.resultCount} 条结构化来源`
            }
            return `${name}，已执行强制联网搜索，但未返回结构化来源`
          }

          const resultCount =
            typeof item.resultCount === 'number' ? `，命中 ${item.resultCount} 条结果` : ''
          const usedSearch = item.usedSearch === true ? '，已调用联网搜索' : ''
          return `${name}${usedSearch}${resultCount}`
        })
        .join('；'),
      data: {
        executedTools
      }
    })
  }

  return { messages: toolMessages }
}
