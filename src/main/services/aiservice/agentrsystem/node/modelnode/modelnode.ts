import { randomUUID } from 'node:crypto'
import {
  AIMessage,
  AIMessageChunk,
  BaseMessage,
  HumanMessage,
  SystemMessage
} from '@langchain/core/messages'
import { getModelWithTool, normalizeModelResponse } from '../../modelwithtool/modelwithtool'
import { MessagesState } from '../../state/messageState'
import type { ConfiguredModelRuntime } from '../../../model-adapters/modelProviderAdapter'
import { readModelResponseChannels } from '../../../model-adapters/modelProviderAdapter'
import {
  emitAgentThought,
  traceArtifact,
  traceDecision,
  traceState
} from '../../../../log/trace/agentTraceEmitter'
import {
  replacePromptManifestScope
} from '../../../prompt/main_agent/shared/promptSections'
import {
  advanceTurnExecutionModelStep,
  createTurnExecutionLedger
} from '../../execution/turnExecutionLifecycle'
import { advanceTurnLifecycle } from '@share/cache/AItype/states/turnLifecycle'
import { withTurnLifecycleDraft } from '../../state/turnWorkspace'
import { contentToText } from '../../../messageoutput/transformRespones'
import {
  assertModelStepAvailable,
  buildInternalCognitionText,
  decideReasoningLoop
} from '../../execution/reasoningLoopPolicy'
import {
  createModelCallAbortScope,
  resolveMainAgentTimeoutMs
} from '../../execution/modelCallAbortScope'
import { buildReasoningRuntimeMessages } from './reasoningRuntimeMessages'
import { createThoughtProgressPublisher } from './thoughtProgressPublisher'

const getCurrentUserRequestPreview = (state: typeof MessagesState.State): string => {
  const message = state.messages
    .slice()
    .reverse()
    .find((item) => item instanceof HumanMessage && !item.additional_kwargs?.isHistory)
  const text = message ? contentToText(message.content).replace(/\s+/g, ' ').trim() : ''
  return text.length > 240 ? `${text.slice(0, 239).trimEnd()}…` : text
}

const CALL_LOCAL_PROMPT_SECTION_IDS = new Set([
  'turn-reasoning-contract',
  'turn-execution-ledger',
  'empty-response-recovery',
  'tool-evidence',
  'tool-ephemeral-status'
])

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
      input.onCognitionProgress?.(buildInternalCognitionText(streamingMode, channels))
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

export async function llmCall(
  state: typeof MessagesState.State,
  config?: { signal?: AbortSignal }
): Promise<Partial<typeof MessagesState.State>> {
  const ledger =
    state.turnExecutionLedger ?? createTurnExecutionLedger(getCurrentUserRequestPreview(state))
  assertModelStepAvailable(ledger.modelStep)
  const runtimePrompts = buildReasoningRuntimeMessages(state)
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
  traceState('llmCall', {
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
  const reasoningText = loopDecision.reasoningText
  const cognitionText = buildInternalCognitionText(mode, channels)
  const segment =
    cognitionText && mode
      ? {
          id: thoughtId,
          text: cognitionText,
          mode,
          modelStep,
          createdAt: new Date().toISOString(),
          followsObservation
        }
      : undefined
  if (segment) {
    thoughtProgress.publish(segment.text, { force: true })
  }
  const directive = loopDecision.directive
  const currentLifecycle = state.turnLifecycle ?? state.turnWorkspace?.draft.lifecycle
  const lifecycle = advanceTurnLifecycle(
    currentLifecycle,
    directive === 'execute_tools' ? 'observing' : (currentLifecycle?.phase ?? 'forming'),
    {
      observationBatch:
        directive === 'execute_tools'
          ? toolCalls.map((call) => call.id || call.name).join(':')
          : currentLifecycle?.observationBatch
    }
  )
  const responseForState = new AIMessage({
    content: response.content,
    additional_kwargs: { ...response.additional_kwargs, isInternalReasoning: true },
    response_metadata: response.response_metadata,
    tool_calls: response.tool_calls,
    invalid_tool_calls: response.invalid_tool_calls,
    id: response.id
  })
  traceArtifact('llmCall', {
    title: '产物: 推理文本',
    summary: reasoningText.slice(0, 120) || '(empty)',
    data: {
      mode: mode ?? 'unresolved',
      chars: reasoningText.length,
      followsObservation,
      visibleContentChars: channels.content.length,
      toolCallCount: toolCalls.length,
      consecutiveEmptyResponses: loopDecision.consecutiveEmptyResponses,
      firstTokenMs: streamed.firstTokenMs,
      totalMs: streamed.totalMs
    }
  })
  traceDecision('llmCall', {
    title: '决策: 推理循环路由',
    summary: directive,
    data: { directive, mode, toolCalls: toolCalls.map((call) => call.name) }
  })

  return {
    ...(loopDecision.isEmpty ? {} : { messages: [responseForState] }),
    llmCalls: (state.llmCalls ?? 0) + 1,
    ...(mode ? { reasoningMode: mode } : {}),
    consecutiveEmptyModelResponses: loopDecision.consecutiveEmptyResponses,
    ...(segment ? { reasoningSegments: [segment] } : {}),
    turnExecutionLedger: advanceTurnExecutionModelStep(ledger, toolCalls.length > 0),
    turnLifecycle: lifecycle,
    loopDirective: directive,
    pendingToolContext: [],
    ephemeralToolContext: [],
    activeToolTranscriptIds: [],
    promptSectionManifest: replacePromptManifestScope(
      state.promptSectionManifest ?? [],
      runtimePrompts.manifest,
      CALL_LOCAL_PROMPT_SECTION_IDS
    ),
    ...(state.turnWorkspace
      ? { turnWorkspace: withTurnLifecycleDraft(state.turnWorkspace, lifecycle) }
      : {})
  }
}
