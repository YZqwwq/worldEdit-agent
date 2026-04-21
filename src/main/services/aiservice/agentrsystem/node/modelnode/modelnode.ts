import { BaseMessage, SystemMessage, AIMessage, AIMessageChunk } from '@langchain/core/messages'
import { getModelWithTool, normalizeModelResponse } from '../../modelwithtool/modelwithtool'
import { MessagesState } from '../../state/messageState'
import type { ConfiguredModelRuntime } from '../../../model-adapters/modelProviderAdapter'
import {
  traceArtifact,
  traceDecision,
  traceState
} from '../../../../log/trace/agentTraceEmitter'

function combineSignals(signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const validSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal))
  if (validSignals.length === 0) {
    return undefined
  }
  if (validSignals.length === 1) {
    return validSignals[0]
  }

  const controller = new AbortController()
  const onAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort()
    }
    for (const signal of validSignals) {
      signal.removeEventListener('abort', onAbort)
    }
  }

  for (const signal of validSignals) {
    if (signal.aborted) {
      onAbort()
      break
    }
    signal.addEventListener('abort', onAbort, { once: true })
  }

  return controller.signal
}

export async function llmCall(
  state: typeof MessagesState.State,
  config?: { signal?: AbortSignal }
): Promise<Partial<typeof MessagesState.State>> {
  // 动态调整消息顺序：确保 SystemMessage 位于首位，历史消息位于中间，当前用户输入位于最后
  // ContextNode 可能将 SystemMessage 和历史消息追加到了末尾，这里进行一次重排序
  const messages = [...state.messages]
  
  // 1. 提取所有 System Message (包括 Persona 和 Anchors)
  const systemMsgs = messages.filter(m => m instanceof SystemMessage)
  
  const sortedMessages: BaseMessage[] = []
  
  // 添加 System
  sortedMessages.push(...systemMsgs)
  
  // 添加历史 (带 isHistory 标记的)
  const historyMsgs = messages.filter(m => m.additional_kwargs?.isHistory)
  sortedMessages.push(...historyMsgs)
  
  // 添加当前交互 (不带 isHistory 标记且非 System)
  const currentMsgs = messages.filter(m => 
    !(m instanceof SystemMessage) && 
    !m.additional_kwargs?.isHistory
  )
  sortedMessages.push(...currentMsgs)

  let response: BaseMessage
  let runtime: ConfiguredModelRuntime | undefined
  let finalChunk: AIMessageChunk | undefined
  let timedOut = false
  let firstChunkAt: number | undefined
  const startedAt = Date.now()
  const timeoutController = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    const configured = await getModelWithTool()
    const modelWithTool = configured.runnable
    runtime = configured.runtime
    const timeoutMs = Math.max(
      10000,
      Number(runtime.effectiveOptions.mainAgentTimeoutMs) || 60000
    )
    timeout = setTimeout(() => {
      timedOut = true
      timeoutController.abort()
    }, timeoutMs)
    const combinedSignal = combineSignals([config?.signal, timeoutController.signal])
    const callOptions: Record<string, unknown> = {
      signal: combinedSignal
    }
    if (state.personaPolicy?.sampling) {
      callOptions.temperature = state.personaPolicy.sampling.temperature
      callOptions.topP = state.personaPolicy.sampling.topP
      callOptions.maxTokens = state.personaPolicy.sampling.maxTokens
    }
    traceState('llmCall', {
      title: '状态: llmCall 调用参数',
      summary: `system=${systemMsgs.length}，history=${historyMsgs.length}，current=${currentMsgs.length}`,
      data: {
        sampling: {
          temperature: callOptions.temperature,
          topP: callOptions.topP,
          maxTokens: callOptions.maxTokens
        },
        messageCounts: {
          system: systemMsgs.length,
          history: historyMsgs.length,
          current: currentMsgs.length
        },
        timeoutMs
      }
    })
    const preparedMessages = await runtime.familyAdapter.prepareMessages(sortedMessages, runtime)
    const stream = await modelWithTool.stream(preparedMessages, callOptions as any)
    for await (const chunk of stream) {
      if (!firstChunkAt) {
        firstChunkAt = Date.now()
      }
      if (!finalChunk) {
        finalChunk = chunk as AIMessageChunk
      } else {
        finalChunk = finalChunk.concat(chunk as AIMessageChunk)
      }
    }
  } catch (error: any) {
    if (error.name === 'AbortError' || timeoutController.signal.aborted || config?.signal?.aborted) {
      if (timedOut && !finalChunk) {
        throw new Error('模型超时，未收到回复。')
      }
    } else {
      if (timeout) {
        clearTimeout(timeout)
      }
      throw error
    }
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }

  const rawResponse =
    finalChunk || new AIMessage({ content: '模型未返回可用内容。' })
  response = rawResponse instanceof AIMessage
    ? rawResponse
    : new AIMessage({
        content: rawResponse.content,
        additional_kwargs: rawResponse.additional_kwargs,
        response_metadata: rawResponse.response_metadata,
        id: rawResponse.id
      })

  if (runtime) {
    const normalizedResponse = normalizeModelResponse(runtime, response)
    if (normalizedResponse !== response) {
      traceDecision('llmCall', {
        title: '决策: llmCall 响应归一化',
        summary: 'provider 响应经过 family adapter 归一化',
        data: {
          normalized: true
        }
      })
    }
    response = normalizedResponse
  }

  const responseContent =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
  traceArtifact('llmCall', {
    title: '产物: llmCall 响应',
    summary: (response as AIMessage).tool_calls?.length
      ? `生成 ${((response as AIMessage).tool_calls?.length) || 0} 个工具调用`
      : `生成文本 ${responseContent.slice(0, 60) || '(empty)'}`,
    data: {
      firstTokenMs: firstChunkAt ? firstChunkAt - startedAt : undefined,
      totalMs: Date.now() - startedAt,
      toolCallCount: (response as AIMessage).tool_calls?.length || 0,
      responsePreview: responseContent.slice(0, 240),
      timedOut
    }
  })

  return {
    messages: [response] as BaseMessage[], // ✅ 显式转换
    llmCalls: (state.llmCalls ?? 0) + 1
  }
}
