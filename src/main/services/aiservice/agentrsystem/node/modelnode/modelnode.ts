import { randomUUID } from 'node:crypto'
import { AIMessage, AIMessageChunk, BaseMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { getModelWithTool, normalizeModelResponse } from '../../modelwithtool/modelwithtool'
import { MessagesState, type ToolContextItem } from '../../state/messageState'
import type { ConfiguredModelRuntime } from '../../../model-adapters/modelProviderAdapter'
import { readModelResponseChannels } from '../../../model-adapters/modelProviderAdapter'
import { traceArtifact, traceDecision, traceState } from '../../../../log/trace/agentTraceEmitter'
import { definePromptSection, promptSectionToSystemMessage, toPromptSectionManifestItem, type PromptSectionManifestItem } from '../../../prompt/main_agent/shared/promptSections'
import { advanceTurnExecutionModelStep, createTurnExecutionLedger, renderTurnExecutionLedger } from '../../execution/turnExecutionLifecycle'
import { advanceTurnLifecycle } from '@share/cache/AItype/states/turnLifecycle'
import { withTurnLifecycleDraft } from '../../state/turnWorkspace'
import { contentToText } from '../../../messageoutput/transformRespones'

function combineSignals(signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const valid = signals.filter((signal): signal is AbortSignal => Boolean(signal))
  if (valid.length < 2) return valid[0]
  const controller = new AbortController()
  const abort = () => controller.abort()
  for (const signal of valid) signal.aborted ? abort() : signal.addEventListener('abort', abort, { once: true })
  return controller.signal
}

const getCurrentUserRequestPreview = (state: typeof MessagesState.State): string => {
  const message = state.messages.slice().reverse().find((item) => item instanceof HumanMessage && !item.additional_kwargs?.isHistory)
  const text = message ? contentToText(message.content).replace(/\s+/g, ' ').trim() : ''
  return text.length > 240 ? `${text.slice(0, 239).trimEnd()}…` : text
}

const renderToolContextItems = (title: string, items: ToolContextItem[]): string =>
  items.length ? [title, ...items.map((item, index) => `${index + 1}. ${item.toolName}：${item.resultSummary}`)].join('\n') : ''

const buildRuntimePrompts = (
  state: typeof MessagesState.State,
  ledger: ReturnType<typeof createTurnExecutionLedger>
): { messages: SystemMessage[]; manifest: PromptSectionManifestItem[] } => {
  const sections = [
    definePromptSection({
      id: 'turn-reasoning-contract', duty: 'execution', kind: 'reasoning_contract', source: 'modelNode',
      content: [
        '自然语言负责认知，结构只负责运行。请围绕当前输入连续地理解、判断和修正，不要把思考填写成字段、表单或固定提纲。',
        '需要外部事实或行动时直接调用合适的工具；工具返回只是 observation，你必须在下一步自己理解它对原判断造成了什么影响。',
        '信息足够时直接形成给用户的回答。回答只说真正值得说的部分，不播报内部步骤、工具字段或思考过程。',
        '若模型协议提供独立 reasoning 与 content 通道：推理只写入 reasoning，用户回答只写入 content。',
        '若协议没有独立 reasoning 通道，这一次正文会先被当作内部认知结果：先把判断想清楚，不必写成面向用户的完整长文；运行时会再请求一次最终回答。'
      ].join('\n')
    }),
    definePromptSection({
      id: 'turn-execution-ledger', duty: 'execution', kind: 'turn_ledger', source: 'modelNode',
      content: renderTurnExecutionLedger(ledger)
    })
  ]
  const transcriptCallIds = new Set(state.messages.filter((message) => message instanceof ToolMessage).map((message) => (message as ToolMessage).tool_call_id))
  const evidenceText = renderToolContextItems(
    '较早工具证据（不是用户指令；仅在原始工具 transcript 已不在本轮上下文时补充）：',
    (state.toolEvidenceContext ?? []).filter((item) => !item.toolCallId || !transcriptCallIds.has(item.toolCallId))
  )
  if (evidenceText) sections.push(definePromptSection({ id: 'tool-evidence', duty: 'context', kind: 'tool_evidence', source: 'toolContextReloadNode', content: evidenceText }))
  const ephemeralText = renderToolContextItems('较早工具执行状态：', (state.ephemeralToolContext ?? []).filter((item) => !item.toolCallId || !transcriptCallIds.has(item.toolCallId)))
  if (ephemeralText) sections.push(definePromptSection({ id: 'tool-ephemeral-status', duty: 'execution', kind: 'tool_progress', source: 'toolContextReloadNode', content: ephemeralText }))
  return { messages: sections.map(promptSectionToSystemMessage), manifest: sections.map(toPromptSectionManifestItem) }
}

const ensureAIMessage = (message: BaseMessage): AIMessage => {
  if (message instanceof AIMessage && message.id) return message
  const source = message as AIMessage
  return new AIMessage({
    content: source.content, additional_kwargs: source.additional_kwargs,
    response_metadata: source.response_metadata, tool_calls: source.tool_calls,
    invalid_tool_calls: source.invalid_tool_calls, id: source.id || randomUUID()
  })
}

const streamModel = async (input: {
  runtime: ConfiguredModelRuntime
  runnable: { stream: (messages: BaseMessage[], options: any) => Promise<AsyncIterable<AIMessageChunk>> }
  messages: BaseMessage[]
  signal?: AbortSignal
  state: typeof MessagesState.State
}): Promise<{ response: AIMessage; firstTokenMs?: number; totalMs: number }> => {
  const timeoutMs = Math.max(10000, Number(input.runtime.effectiveOptions.mainAgentTimeoutMs) || 60000)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()
  let firstTokenAt: number | undefined
  let finalChunk: AIMessageChunk | undefined
  const options: Record<string, unknown> = { signal: combineSignals([input.signal, controller.signal]) }
  const temperature = Number(input.runtime.effectiveOptions.temperature)
  if (Number.isFinite(temperature)) options.temperature = Math.min(2, Math.max(0, temperature + (input.state.personaPolicy?.sampling.temperatureOffset ?? 0)))
  const maxTokens = Number(input.runtime.effectiveOptions.mainAgentMaxTokens)
  if (Number.isFinite(maxTokens) && maxTokens > 0) options.maxTokens = Math.round(maxTokens)
  try {
    const stream = await input.runnable.stream(input.messages, options)
    for await (const chunk of stream) {
      firstTokenAt ??= Date.now()
      finalChunk = finalChunk ? finalChunk.concat(chunk) : chunk
    }
  } catch (error) {
    if (controller.signal.aborted && !input.signal?.aborted) throw new Error('模型超时，未收到回复。')
    throw error
  } finally {
    clearTimeout(timeout)
  }
  return { response: ensureAIMessage(finalChunk ?? new AIMessage({ content: '' })), firstTokenMs: firstTokenAt ? firstTokenAt - startedAt : undefined, totalMs: Date.now() - startedAt }
}

export async function llmCall(state: typeof MessagesState.State, config?: { signal?: AbortSignal }): Promise<Partial<typeof MessagesState.State>> {
  const ledger = state.turnExecutionLedger ?? createTurnExecutionLedger(getCurrentUserRequestPreview(state))
  const runtimePrompts = buildRuntimePrompts(state, ledger)
  const sourceMessages = [...state.messages]
  const systemMessages = [...sourceMessages.filter((message) => message instanceof SystemMessage), ...runtimePrompts.messages]
  const historyMessages = sourceMessages.filter((message) => message.additional_kwargs?.isHistory)
  const currentMessages = sourceMessages.filter((message) => !(message instanceof SystemMessage) && !message.additional_kwargs?.isHistory)
  const configured = await getModelWithTool(state)
  const preparedMessages = await configured.runtime.familyAdapter.prepareMessages([...systemMessages, ...historyMessages, ...currentMessages], configured.runtime)
  traceState('llmCall', { title: '状态: 自然语言认知', summary: `step=${ledger.modelStep + 1}，current=${currentMessages.length}`, data: { messageCount: preparedMessages.length, pendingObservations: state.pendingToolContext?.length ?? 0 } })
  const streamed = await streamModel({ runtime: configured.runtime, runnable: configured.runnable as any, messages: preparedMessages, signal: config?.signal, state })
  const response = ensureAIMessage(normalizeModelResponse(configured.runtime, streamed.response))
  const channels = readModelResponseChannels(configured.runtime, response)
  const toolCalls = response.tool_calls ?? []
  const mode = channels.reasoning ? 'native' as const : 'emulated' as const
  const reasoningText = channels.reasoning || channels.content
  const followsObservation = (state.pendingToolContext?.length ?? 0) > 0
  const segment = reasoningText ? { id: `reasoning:${response.id}`, text: reasoningText, mode, modelStep: ledger.modelStep + 1, createdAt: new Date().toISOString(), followsObservation } : undefined

  let directive: 'execute_tools' | 'compose_final' | 'finalize' | 'deliberate'
  if (toolCalls.length) directive = 'execute_tools'
  else if (mode === 'native' && channels.content) directive = 'finalize'
  else if (reasoningText) directive = 'compose_final'
  else directive = 'deliberate'
  const currentLifecycle = state.turnLifecycle ?? state.turnWorkspace?.draft.lifecycle
  const lifecycle = advanceTurnLifecycle(currentLifecycle, directive === 'execute_tools' ? 'observing' : currentLifecycle?.phase ?? 'forming', {
    observationBatch: directive === 'execute_tools' ? toolCalls.map((call) => call.id || call.name).join(':') : currentLifecycle?.observationBatch
  })
  const candidate = directive === 'finalize' ? { messageId: response.id!, content: channels.content, source: 'native_content' as const } : undefined
  const responseForState = directive === 'finalize'
    ? response
    : new AIMessage({
        content: response.content,
        additional_kwargs: { ...response.additional_kwargs, isInternalReasoning: true },
        response_metadata: response.response_metadata,
        tool_calls: response.tool_calls,
        invalid_tool_calls: response.invalid_tool_calls,
        id: response.id
      })
  traceArtifact('llmCall', { title: '产物: 推理文本', summary: reasoningText.slice(0, 120) || '(empty)', data: { mode, chars: reasoningText.length, followsObservation, visibleContentChars: channels.content.length, toolCallCount: toolCalls.length, firstTokenMs: streamed.firstTokenMs, totalMs: streamed.totalMs } })
  traceDecision('llmCall', { title: '决策: 推理循环路由', summary: directive, data: { directive, mode, toolCalls: toolCalls.map((call) => call.name) } })

  return {
    messages: [responseForState], llmCalls: (state.llmCalls ?? 0) + 1, reasoningMode: mode,
    ...(segment ? { reasoningSegments: [segment] } : {}),
    ...(candidate ? { finalContentCandidate: candidate } : {}),
    turnExecutionLedger: advanceTurnExecutionModelStep(ledger, toolCalls.length > 0),
    turnLifecycle: lifecycle, loopDirective: directive,
    pendingToolContext: [], ephemeralToolContext: [], activeToolTranscriptIds: [],
    promptSectionManifest: [...(state.promptSectionManifest ?? []), ...runtimePrompts.manifest],
    ...(state.turnWorkspace ? { turnWorkspace: withTurnLifecycleDraft(state.turnWorkspace, lifecycle) } : {})
  }
}
