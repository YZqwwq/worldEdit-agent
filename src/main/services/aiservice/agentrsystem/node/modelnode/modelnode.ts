import { randomUUID } from 'node:crypto'
import {
  AIMessage,
  AIMessageChunk,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage
} from '@langchain/core/messages'
import { getModelWithTool, normalizeModelResponse } from '../../modelwithtool/modelwithtool'
import { MessagesState } from '../../state/messageState'
import type { ConfiguredModelRuntime } from '../../../model-adapters/modelProviderAdapter'
import { readModelResponseChannels } from '../../../model-adapters/modelProviderAdapter'
import {
  traceArtifact,
  traceDecision,
  traceState
} from '../../../../log/trace/agentTraceEmitter'
import { getTraceContext } from '../../../../log/trace/agentTraceRuntime'
import { persistAgentTraceArtifact } from '../../../../log/trace/agentTraceStore'
import { emitAgentThought } from '../../../runtime/agentRuntimeOutput'
import {
  advanceTurnExecutionModelStep,
  createTurnExecutionLedger
} from '../../execution/turnExecutionLifecycle'
import { advanceTurnLifecycle } from '@share/cache/AItype/states/turnLifecycle'
import { contentToText } from '../../../messageoutput/transformRespones'
import {
  assertModelStepAvailable,
  decideReasoningLoop
} from '../../execution/reasoningLoopPolicy'
import { appendCognitionDraftText, type CognitionDraft } from '@share/cache/AItype/states/reasoningChannel'
import {
  createModelCallAbortScope,
  resolveMainAgentTimeoutMs
} from '../../execution/modelCallAbortScope'
import { buildReasoningRuntimeMessages } from './reasoningRuntimeMessages'
import { resolvePromptOverride } from '../../../prompt/promptOverrideStore'
import { savePromptRuntimeSnapshot } from '../../../prompt/promptRuntimeSnapshotStore'
import { createThoughtProgressPublisher } from './thoughtProgressPublisher'

const getCurrentUserRequestPreview = (state: typeof MessagesState.State): string => {
  const message = state.messages
    .slice()
    .reverse()
    .find((item) => item instanceof HumanMessage && !item.additional_kwargs?.isHistory)
  const text = message ? contentToText(message.content).replace(/\s+/g, ' ').trim() : ''
  return text.length > 240 ? `${text.slice(0, 239).trimEnd()}…` : text
}

const ensureAIMessage = (message: BaseMessage): AIMessage => {
  if (message instanceof AIMessage && message.id) return message
  const source = message as AIMessage
  return new AIMessage({
    content: source.content,
    additional_kwargs: source.additional_kwargs,
    response_metadata: source.response_metadata,
    tool_calls: source.tool_calls,
    invalid_tool_calls: source.invalid_tool_calls,
    id: source.id || randomUUID()
  })
}

const streamModel = async (input: {
  runtime: ConfiguredModelRuntime
  runnable: {
    stream: (messages: BaseMessage[], options: any) => Promise<AsyncIterable<AIMessageChunk>>
  }
  messages: BaseMessage[]
  signal?: AbortSignal
  state: typeof MessagesState.State
  onCognitionProgress?: (text: string) => void
}): Promise<{ response: AIMessage; firstTokenMs?: number; totalMs: number }> => {
  const abortScope = createModelCallAbortScope({
    timeoutMs: resolveMainAgentTimeoutMs(input.runtime),
    externalSignal: input.signal
  })
  const startedAt = Date.now()
  let firstTokenAt: number | undefined
  let finalChunk: AIMessageChunk | undefined
  const options: Record<string, unknown> = {
    signal: abortScope.signal
  }
  const temperature = Number(input.runtime.effectiveOptions.temperature)
  if (Number.isFinite(temperature))
    options.temperature = Math.min(
      2,
      Math.max(0, temperature + (input.state.personaPolicy?.sampling.temperatureOffset ?? 0))
    )
  const maxTokens = Number(input.runtime.effectiveOptions.mainAgentMaxTokens)
  if (Number.isFinite(maxTokens) && maxTokens > 0) options.maxTokens = Math.round(maxTokens)
  try {
    const stream = await input.runnable.stream(input.messages, options)
    for await (const chunk of stream) {
      firstTokenAt ??= Date.now()
      finalChunk = finalChunk ? finalChunk.concat(chunk) : chunk
      const channels = readModelResponseChannels(input.runtime, finalChunk)
      const streamingMode =
        input.state.reasoningMode ??
        (channels.reasoning
          ? 'native'
          : input.runtime.reasoningProtocol === 'native'
            ? 'native'
            : 'emulated')
      // Both protocols feed the dedicated thought surface while streaming.
      // In emulated mode this is still the private cognition draft; the
      // projection does not make it part of the persisted user reply.
      const thoughtText =
        streamingMode === 'native' ? channels.reasoning.trim() : channels.content.trim()
      if (thoughtText) input.onCognitionProgress?.(thoughtText)
    }
    if (abortScope.signal.aborted) {
      throw input.signal?.reason ?? abortScope.signal.reason ?? new Error('model_call_aborted')
    }
  } catch (error) {
    if (abortScope.didTimeout() && !input.signal?.aborted)
      throw new Error('模型超时，未收到回复。')
    throw error
  } finally {
    abortScope.dispose()
  }
  return {
    response: ensureAIMessage(finalChunk ?? new AIMessage({ content: '' })),
    firstTokenMs: firstTokenAt ? firstTokenAt - startedAt : undefined,
    totalMs: Date.now() - startedAt
  }
}

export async function cognitionNode(
  state: typeof MessagesState.State,
  config?: { signal?: AbortSignal }
): Promise<Partial<typeof MessagesState.State>> {
  const ledger =
    state.turnExecutionLedger ?? createTurnExecutionLedger(getCurrentUserRequestPreview(state))
  assertModelStepAvailable(ledger.modelStep)
  const runtimePrompts = buildReasoningRuntimeMessages(state, {
    reasoningContract: await resolvePromptOverride('reasoning-contract', '')
  })
  const sourceMessages = [...state.messages]
  const systemMessages = [
    ...sourceMessages.filter((message) => message instanceof SystemMessage),
    ...runtimePrompts.systemMessages
  ]
  const historyMessages = sourceMessages.filter((message) => message.additional_kwargs?.isHistory)
  const currentMessages = sourceMessages.filter(
    (message) => !(message instanceof SystemMessage) && !message.additional_kwargs?.isHistory
  )
  const configured = await getModelWithTool(state)
  const thoughtId = `reasoning:${randomUUID()}`
  const modelStep = ledger.modelStep + 1
  const followsObservation = (state.pendingToolContext?.length ?? 0) > 0
  const thoughtProgress = createThoughtProgressPublisher({
    thoughtId,
    sequence: modelStep,
    followsToolResult: followsObservation,
    emit: emitAgentThought
  })
  const preparedMessages = await configured.runtime.familyAdapter.prepareMessages(
    [
      ...systemMessages,
      ...historyMessages,
      ...runtimePrompts.contextMessages,
      ...currentMessages
    ],
    configured.runtime
  )
  try {
    await savePromptRuntimeSnapshot({
      source: 'runtime',
      capturedAt: new Date().toISOString(),
      modelStep,
      model: configured.runtime.effectiveOptions.model,
      profile: configured.runtime.profile,
      reasoningProtocol: configured.runtime.reasoningProtocol,
      messages: preparedMessages.map((message) => ({
        type: message.constructor.name,
        content: message.content,
        additionalKwargs: message.additional_kwargs,
        toolCalls: message instanceof AIMessage ? message.tool_calls : undefined,
        toolCallId: message instanceof ToolMessage ? message.tool_call_id : undefined,
        name: message.name
      }))
    })
  } catch (error) {
    console.warn('[prompt-inspection] failed to persist cognition prompt snapshot', error)
  }
  if (process.env.WORLDEDIT_AGENT_CAPTURE_FULL_PROMPT === '1') {
    const capturedPrompt = {
      model: configured.runtime.effectiveOptions.model,
      profile: configured.runtime.profile,
      reasoningProtocol: configured.runtime.reasoningProtocol,
      messages: preparedMessages.map((message) => ({
        type: message.constructor.name,
        content:
          typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
        additional_kwargs: message.additional_kwargs
      }))
    }
    const traceContext = getTraceContext()
    const capturePath = traceContext
      ? persistAgentTraceArtifact({
          runId: traceContext.runId,
          artifactId: `cognition-prompt-step-${modelStep}`,
          extension: 'json',
          content: JSON.stringify(capturedPrompt, null, 2)
        })
      : undefined
    traceArtifact('cognitionNode', {
      scope: 'loop',
      modelStep,
      title: '测试捕获: cognitionNode 全量模型入参',
      summary: `捕获 ${preparedMessages.length} 条消息，可从 artifact 回放`,
      data: {
        model: capturedPrompt.model,
        profile: capturedPrompt.profile,
        reasoningProtocol: capturedPrompt.reasoningProtocol,
        messageCount: preparedMessages.length,
        capturePath: capturePath ?? null,
        messages: capturedPrompt.messages
      }
    })
  }
  traceState('cognitionNode', {
    scope: 'loop',
    status: 'started',
    modelStep,
    title: '状态: 自然语言认知',
    summary: `step=${ledger.modelStep + 1}，current=${currentMessages.length}`,
    data: {
      messageCount: preparedMessages.length,
      pendingObservations: state.pendingToolContext?.length ?? 0
    }
  })
  const streamed = await streamModel({
    runtime: configured.runtime,
    runnable: configured.runnable as any,
    messages: preparedMessages,
    signal: config?.signal,
    state,
    onCognitionProgress: (text) => thoughtProgress.publish(text)
  })
  const response = ensureAIMessage(normalizeModelResponse(configured.runtime, streamed.response))
  const channels = readModelResponseChannels(configured.runtime, response)
  const toolCalls = response.tool_calls ?? []
  const loopDecision = decideReasoningLoop({
    lockedMode: state.reasoningMode,
    preference: configured.runtime.reasoningProtocol,
    response: {
      reasoning: channels.reasoning,
      content: channels.content,
      toolCallCount: toolCalls.length
    },
    previousConsecutiveEmptyResponses: state.consecutiveEmptyModelResponses
  })
  const mode = loopDecision.mode
  const nativeReasoningText = loopDecision.nativeReasoningText
  const internalDraft = loopDecision.internalDraft
  // Project the current cognition stream to the dedicated thought UI for both
  // protocols. In emulated mode the model's content is still an internal
  // cognition draft; exposing it here does not make it part of the user reply
  // or the persisted chat message.
  const cognitionText = nativeReasoningText || (mode === 'emulated' ? internalDraft : '')
  if (cognitionText) thoughtProgress.publish(cognitionText, { force: true })
  const directive = loopDecision.directive
  const currentLifecycle = state.turnLifecycle
  const lifecycle = advanceTurnLifecycle(
    currentLifecycle,
    directive === 'execute_tools' ? 'observing' : (currentLifecycle?.phase ?? 'forming')
  )
  const responseForState = new AIMessage({
    content: response.content,
    additional_kwargs: { ...response.additional_kwargs, isInternalReasoning: true },
    response_metadata: response.response_metadata,
    tool_calls: response.tool_calls,
    invalid_tool_calls: response.invalid_tool_calls,
    id: response.id
  })
  const cognitionDraft: CognitionDraft | undefined =
    mode === 'emulated' && internalDraft
      ? {
          text: appendCognitionDraftText(state.cognitionDraft?.text, internalDraft),
          mode,
          modelStep,
          followsObservation,
          createdAt: new Date().toISOString()
        }
      : undefined
  traceArtifact('cognitionNode', {
    scope: 'loop',
    status: 'completed',
    modelStep,
    title: '产物: 推理文本',
    summary: (nativeReasoningText || internalDraft).slice(0, 120) || '(empty)',
    data: {
      mode: mode ?? 'unresolved',
      chars: (nativeReasoningText || internalDraft).length,
      followsObservation,
      visibleContentChars: channels.content.length,
      toolCallCount: toolCalls.length,
      consecutiveEmptyResponses: loopDecision.consecutiveEmptyResponses,
      firstTokenMs: streamed.firstTokenMs,
      totalMs: streamed.totalMs
    }
  })
  traceDecision('cognitionNode', {
    scope: 'loop',
    modelStep,
    title: '决策: 推理循环路由',
    summary: directive,
    data: { directive, mode, toolCalls: toolCalls.map((call) => call.name) }
  })

  return {
    ...(toolCalls.length > 0 ? { messages: [responseForState] } : {}),
    ...(mode ? { reasoningMode: mode } : {}),
    consecutiveEmptyModelResponses: loopDecision.consecutiveEmptyResponses,
    cognitionDraft,
    turnExecutionLedger: advanceTurnExecutionModelStep(ledger, toolCalls.length > 0),
    turnLifecycle: lifecycle,
    loopDirective: directive,
    pendingToolContext: [],
    ephemeralToolContext: [],
    ...(state.turnWorkspace ? { turnWorkspace: state.turnWorkspace } : {})
  }
}

export const llmCall = cognitionNode
