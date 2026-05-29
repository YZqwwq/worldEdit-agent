import { randomUUID } from 'node:crypto'
import { ToolMessage } from '@langchain/core/messages'
import { parseAgentToolResultEnvelope } from '../../../ai-utils/core/agentTool'
import {
  getMainAgentTools,
  getVisibleMainAgentToolEntryMap,
  resolveMainAgentToolActivationState
} from '../../../ai-utils/toolkits/mainAgentToolRegistry'
import { toolUsageStatsService } from '../../../ai-utils/toolkits/toolUsageStatsService'
import {
  traceArtifact,
  traceDecision,
  traceError,
  traceState
} from '../../../../log/trace/agentTraceEmitter'
import { MessagesState } from '../../state/messageState'
import type {
  PendingToolContextItem,
  ToolContextSourceRef
} from '../../state/messageState'

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
    return JSON.stringify(
      {
        toolName,
        message: 'Tool returned a non-standard result. A compact fallback is available.',
        fallbackPreview: stringifyCompact(fallbackResult, 300)
      },
      null,
      2
    )
  }

  const genericCompact = {
    ok: envelope.ok,
    toolName,
    message: envelope.message,
    error: envelope.error,
    contextRetention: envelope.meta.contextRetention,
    contextReloaded:
      envelope.meta.contextRetention === 'evidence'
        ? 'toolEvidenceContext'
        : envelope.meta.contextRetention === 'ephemeral'
          ? 'ephemeralToolContext'
          : 'none'
  }

  return JSON.stringify(genericCompact, null, 2)
}

const compact = (value: string, max = 900): string => {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ')
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

const stringifyCompact = (value: unknown, max = 900): string => {
  if (typeof value === 'string') return compact(value, max)
  try {
    return compact(JSON.stringify(value), max)
  } catch {
    return compact(String(value), max)
  }
}

const buildSourceRefs = (toolName: string, data: Record<string, unknown> | undefined): ToolContextSourceRef[] => {
  if (!data) return []

  if (toolName === 'search_recent_chinese_conversation' && Array.isArray(data.matches)) {
    return (data.matches as Array<Record<string, unknown>>).slice(0, 5).map((match) => ({
      type: 'message' as const,
      id: typeof match.messageId === 'number' ? match.messageId : undefined,
      title:
        typeof match.role === 'string'
          ? `${match.role}${typeof match.turnId === 'number' ? ` turn:${match.turnId}` : ''}`
          : undefined
    }))
  }

  if (toolName === 'official_web_search' && Array.isArray(data.sources)) {
    return (data.sources as Array<Record<string, unknown>>).slice(0, 5).map((source) => ({
      type: 'url' as const,
      title: typeof source.title === 'string' ? source.title : undefined,
      url: typeof source.url === 'string' ? source.url : undefined
    }))
  }

  return []
}

const buildResultSummary = (
  toolName: string,
  envelope: ReturnType<typeof parseAgentToolResultEnvelope>,
  fallbackResult: unknown
): string => {
  if (!envelope) {
    return stringifyCompact(fallbackResult)
  }

  const data =
    envelope.data && typeof envelope.data === 'object' ? (envelope.data as Record<string, unknown>) : undefined

  if (toolName === 'search_recent_chinese_conversation' && data) {
    const matches = Array.isArray(data.matches) ? (data.matches as Array<Record<string, unknown>>) : []
    const query = typeof data.query === 'string' ? data.query : ''
    const searchedTurnCount = typeof data.searchedTurnCount === 'number' ? data.searchedTurnCount : 0
    const searchedMessageCount = typeof data.searchedMessageCount === 'number' ? data.searchedMessageCount : 0
    const topMatches = matches
      .slice(0, 4)
      .map((match, index) => {
        const role = typeof match.role === 'string' ? match.role : 'unknown'
        const messageId = typeof match.messageId === 'number' ? `messageId=${match.messageId}` : ''
        const turnId = typeof match.turnId === 'number' ? `turnId=${match.turnId}` : ''
        const score = typeof match.score === 'number' ? `score=${match.score.toFixed(3)}` : ''
        const content = typeof match.content === 'string' ? compact(match.content, 220) : ''
        return `${index + 1}) ${[role, messageId, turnId, score].filter(Boolean).join(' ')}：${content}`
      })
      .join('\n')
    return compact(
      `中文对话回溯 query="${query}"，搜索 ${searchedTurnCount} 轮/${searchedMessageCount} 条消息，命中 ${matches.length} 条。\n${topMatches}`,
      1200
    )
  }

  if (toolName === 'official_web_search' && data) {
    const summary = typeof data.summary === 'string' ? data.summary : envelope.message
    const resultCount = typeof data.resultCount === 'number' ? data.resultCount : 0
    const sources = Array.isArray(data.sources)
      ? (data.sources as Array<Record<string, unknown>>)
          .slice(0, 4)
          .map((source) =>
            [source.title, source.url].filter((item) => typeof item === 'string' && item).join(' ')
          )
          .filter(Boolean)
      : []
    return compact(
      `联网搜索返回 ${resultCount} 条来源。结论：${summary}\n来源：${sources.join('；')}`,
      1200
    )
  }

  if (toolName === 'query_tool_catalog' && data) {
    const toolsets = Array.isArray(data.toolsets)
      ? (data.toolsets as Array<Record<string, unknown>>)
          .slice(0, 5)
          .map((toolset) => {
            const id = typeof toolset.id === 'string' ? toolset.id : 'unknown_toolset'
            const summary = typeof toolset.summary === 'string' ? toolset.summary : ''
            const toolCount = typeof toolset.toolCount === 'number' ? toolset.toolCount : 0
            return `${id}(${toolCount}个工具)：${summary}`
          })
      : []
    return compact(
      `工具底图查询返回 ${typeof data.count === 'number' ? data.count : toolsets.length} 个候选工具集。\n${toolsets.join('\n')}`,
      1200
    )
  }

  if (toolName === 'activate_toolset' && data) {
    const activatedToolsets = Array.isArray(data.activatedToolsets)
      ? data.activatedToolsets.filter((item): item is string => typeof item === 'string')
      : []
    const activatedTools = Array.isArray(data.activatedTools)
      ? data.activatedTools.filter((item): item is string => typeof item === 'string')
      : []
    const missingToolsets = Array.isArray(data.missingToolsets)
      ? data.missingToolsets.filter((item): item is string => typeof item === 'string')
      : []
    return compact(
      [
        `已激活工具集：${activatedToolsets.join(', ') || '无'}。`,
        `下一轮可见工具：${activatedTools.join(', ') || '无'}。`,
        missingToolsets.length > 0 ? `未找到工具集：${missingToolsets.join(', ')}` : ''
      ].join('\n'),
      1200
    )
  }

  if (envelope.ok === false) {
    return compact(envelope.error?.message || envelope.message || '工具返回失败。')
  }

  return compact(
    [
      envelope.receipt?.summary,
      envelope.message,
      envelope.data != null ? stringifyCompact(envelope.data, 700) : ''
    ]
      .filter(Boolean)
      .join('\n'),
    1200
  )
}

const createToolMessage = (input: {
  content: string
  toolCallId: string
  name?: string
  status?: 'success' | 'error'
}): ToolMessage =>
  new ToolMessage({
    id: randomUUID(),
    content: input.content,
    tool_call_id: input.toolCallId,
    name: input.name,
    status: input.status
  })

export async function toolNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
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
  const pendingToolContext: PendingToolContextItem[] = []
  const activeToolTranscriptIds = [
    typeof lastMessage.id === 'string' && lastMessage.id ? lastMessage.id : ''
  ].filter(Boolean)
  const toolPolicy = state.personaPolicy?.tool
  const toolActivationState = await resolveMainAgentToolActivationState(state)
  const tools = getMainAgentTools(toolActivationState)
  const toolEntries = getVisibleMainAgentToolEntryMap(toolActivationState)
  const executedTools: Array<Record<string, unknown>> = []
  const activatedToolsets: string[] = []
  const activatedTools: string[] = []
  const suppressedTools: string[] = []
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
        const content =
          `Tool "${toolCall.name}" requires user confirmation under current persona policy. ` +
          'Ask user to confirm before executing this sensitive action.'
        const toolMessage = createToolMessage({
          content,
          toolCallId: toolCall.id,
          name: toolCall.name,
          status: 'error'
        })
        toolMessages.push(toolMessage)
        if (toolMessage.id) activeToolTranscriptIds.push(toolMessage.id)
        pendingToolContext.push({
          id: randomUUID(),
          toolCallId: toolCall.id,
          transcriptMessageIds: [lastMessage.id, toolMessage.id].filter(
            (id): id is string => typeof id === 'string' && id.length > 0
          ),
          toolName: toolCall.name,
          retention: 'ephemeral',
          ok: false,
          argsSummary: stringifyCompact(toolCall.args ?? {}),
          resultSummary: content,
          createdAtLoop: state.llmCalls ?? 0
        })
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
        const content =
          `Tool "${toolCall.name}" is blocked by current risk policy. ` +
          'Please provide a safer alternative or ask user for explicit override.'
        const toolMessage = createToolMessage({
          content,
          toolCallId: toolCall.id,
          name: toolCall.name,
          status: 'error'
        })
        toolMessages.push(toolMessage)
        if (toolMessage.id) activeToolTranscriptIds.push(toolMessage.id)
        pendingToolContext.push({
          id: randomUUID(),
          toolCallId: toolCall.id,
          transcriptMessageIds: [lastMessage.id, toolMessage.id].filter(
            (id): id is string => typeof id === 'string' && id.length > 0
          ),
          toolName: toolCall.name,
          retention: 'ephemeral',
          ok: false,
          argsSummary: stringifyCompact(toolCall.args ?? {}),
          resultSummary: content,
          createdAtLoop: state.llmCalls ?? 0
        })
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
        const content = `Tool "${toolCall.name}" not found. Available tools: ${Object.keys(tools).join(', ')}`
        const toolMessage = createToolMessage({
          content,
          toolCallId: toolCall.id,
          name: toolCall.name,
          status: 'error'
        })
        toolMessages.push(toolMessage)
        if (toolMessage.id) activeToolTranscriptIds.push(toolMessage.id)
        pendingToolContext.push({
          id: randomUUID(),
          toolCallId: toolCall.id,
          transcriptMessageIds: [lastMessage.id, toolMessage.id].filter(
            (id): id is string => typeof id === 'string' && id.length > 0
          ),
          toolName: toolCall.name,
          retention: 'ephemeral',
          ok: false,
          argsSummary: stringifyCompact(toolCall.args ?? {}),
          resultSummary: content,
          createdAtLoop: state.llmCalls ?? 0
        })
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
      const toolEntry = toolEntries[toolCall.name]
      if (toolEntry?.turnCallLimit === 1 && envelope?.ok !== false) {
        suppressedTools.push(toolEntry.tool.name)
      }
      if (toolEntry && toolEntry.activationMode !== 'always') {
        try {
          await toolUsageStatsService.recordToolUse({
            toolName: toolCall.name,
            capabilityLayer: toolEntry.capabilityLayer
          })
        } catch (statsError) {
          console.warn(
            `Failed to record tool usage stats for "${toolCall.name}":`,
            statsError
          )
        }
      }
      const activatedToolsetsFromEnvelope =
        toolCall.name === 'activate_toolset' &&
        envelope?.data &&
        typeof envelope.data === 'object' &&
        Array.isArray((envelope.data as Record<string, unknown>).activatedToolsets)
          ? ((envelope.data as Record<string, unknown>).activatedToolsets as unknown[])
              .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
              .map((item) => item.trim())
          : []
      const activatedToolsFromEnvelope =
        toolCall.name === 'activate_toolset' &&
        envelope?.data &&
        typeof envelope.data === 'object' &&
        Array.isArray((envelope.data as Record<string, unknown>).activatedTools)
          ? ((envelope.data as Record<string, unknown>).activatedTools as unknown[])
              .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
              .map((item) => item.trim())
          : []
      activatedToolsets.push(...activatedToolsetsFromEnvelope)
      activatedTools.push(...activatedToolsFromEnvelope)
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
            : undefined,
        activatedToolsets:
          activatedToolsetsFromEnvelope.length > 0 ? activatedToolsetsFromEnvelope : undefined,
        activatedTools:
          activatedToolsFromEnvelope.length > 0 ? activatedToolsFromEnvelope : undefined,
        suppressedForRestOfTurn:
          toolEntry?.turnCallLimit === 1 && envelope?.ok !== false ? true : undefined
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
        (() => {
          const toolMessage = createToolMessage({
            content: buildToolMessageContent(toolCall.name, envelope, result),
            toolCallId: toolCall.id,
            name: toolCall.name
          })
          if (toolMessage.id) activeToolTranscriptIds.push(toolMessage.id)
          const retention =
            envelope?.ok === false ? 'ephemeral' : (tool.agentMetadata.contextRetention ?? 'ephemeral')
          if (retention !== 'none') {
            const data =
              envelope?.data && typeof envelope.data === 'object'
                ? (envelope.data as Record<string, unknown>)
                : undefined
            pendingToolContext.push({
              id: randomUUID(),
              toolCallId: toolCall.id,
              transcriptMessageIds: [lastMessage.id, toolMessage.id].filter(
                (id): id is string => typeof id === 'string' && id.length > 0
              ),
              toolName: toolCall.name,
              retention,
              ok: envelope?.ok ?? null,
              argsSummary: stringifyCompact(toolCall.args ?? {}),
              resultSummary: buildResultSummary(toolCall.name, envelope, result),
              createdAtLoop: state.llmCalls ?? 0,
              sourceRefs: buildSourceRefs(toolCall.name, data)
            })
          }
          return toolMessage
        })()
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
      const content = `Error executing tool "${toolCall.name}": ${error instanceof Error ? error.message : String(error)}`
      const toolMessage = createToolMessage({
        content,
        toolCallId: toolCall.id,
        name: toolCall.name,
        status: 'error'
      })
      toolMessages.push(toolMessage)
      if (toolMessage.id) activeToolTranscriptIds.push(toolMessage.id)
      pendingToolContext.push({
        id: randomUUID(),
        toolCallId: toolCall.id,
        transcriptMessageIds: [lastMessage.id, toolMessage.id].filter(
          (id): id is string => typeof id === 'string' && id.length > 0
        ),
        toolName: toolCall.name,
        retention: 'ephemeral',
        ok: false,
        argsSummary: stringifyCompact(toolCall.args ?? {}),
        resultSummary: content,
        createdAtLoop: state.llmCalls ?? 0
      })
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

  return {
    messages: toolMessages,
    pendingToolContext,
    activeToolTranscriptIds: [...new Set(activeToolTranscriptIds)],
    activeToolsets: [...new Set(activatedToolsets)],
    activeTools: [...new Set(activatedTools)],
    suppressedTools: [...new Set([...(state.suppressedTools ?? []), ...suppressedTools])]
  }
}
