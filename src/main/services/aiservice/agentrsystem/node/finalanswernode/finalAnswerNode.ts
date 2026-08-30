import { randomUUID } from 'node:crypto'
import { AIMessage, AIMessageChunk } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { getModelWithTool } from '../../modelwithtool/modelwithtool'
import { contentToText } from '../../../messageoutput/transformRespones'
import {
  traceArtifact,
  traceState
} from '../../../../log/trace/agentTraceEmitter'
import { emitAgentTurnPhase } from '../../../runtime/agentRuntimeOutput'
import { advanceTurnLifecycle } from '@share/cache/AItype/states/turnLifecycle'
import { withLifeStateDraft } from '../../state/turnWorkspace'
import { buildFinalCompositionMessages } from './finalComposition'
import {
  createModelCallAbortScope,
  resolveMainAgentTimeoutMs
} from '../../execution/modelCallAbortScope'
import { parseFinalCompositionEnvelope } from './finalCompositionEnvelope'
import { advanceTurnExecutionModelStep } from '../../execution/turnExecutionLifecycle'

export async function expressionNode(
  state: typeof MessagesState.State,
  config?: { signal?: AbortSignal }
): Promise<Partial<typeof MessagesState.State>> {
  emitAgentTurnPhase({ phase: 'finalizing', label: '正在打字' })
  const configured = await getModelWithTool(state, 'expression')
  const runtime = configured.runtime
  const messages = buildFinalCompositionMessages(state)
  const prepared = await runtime.familyAdapter.prepareMessages(messages, runtime)
  const abortScope = createModelCallAbortScope({
    timeoutMs: resolveMainAgentTimeoutMs(runtime),
    externalSignal: config?.signal
  })
  const options: Record<string, unknown> = { signal: abortScope.signal }
  const temperature = Number(runtime.effectiveOptions.temperature)
  if (Number.isFinite(temperature)) {
    options.temperature = Math.min(
      2,
      Math.max(0, temperature + (state.personaPolicy?.sampling.temperatureOffset ?? 0))
    )
  }
  const maxTokens = Number(runtime.effectiveOptions.mainAgentMaxTokens)
  if (Number.isFinite(maxTokens) && maxTokens > 0) options.maxTokens = Math.round(maxTokens)

  traceState('expressionNode', {
    title: '状态: 最终回答通道',
    summary: `cognitionDraft=${state.cognitionDraft ? 'present' : 'empty'}`,
    data: { expressionProfile: state.expressionProfile?.id, reasoningMode: state.reasoningMode, hasCognitionDraft: Boolean(state.cognitionDraft) }
  })
  let chunk: AIMessageChunk | undefined
  try {
    const stream = await configured.runnable.stream(prepared, options as any)
    for await (const current of stream)
      chunk = chunk ? chunk.concat(current as AIMessageChunk) : (current as AIMessageChunk)
    if (abortScope.signal.aborted) {
      throw config?.signal?.reason ?? abortScope.signal.reason ?? new Error('model_call_aborted')
    }
  } catch (error) {
    if (abortScope.didTimeout() && !config?.signal?.aborted)
      throw new Error('最终回答生成超时，未收到完整回复。')
    throw error
  } finally {
    abortScope.dispose()
  }
  const response = chunk ? chunk : new AIMessageChunk({ content: '' })
  const toolCalls = response.tool_calls ?? []
  if (toolCalls.length > 0) {
    const message = new AIMessage({
      content: response.content,
      additional_kwargs: { ...response.additional_kwargs, isExpressionToolRequest: true },
      response_metadata: response.response_metadata,
      tool_calls: response.tool_calls,
      invalid_tool_calls: response.invalid_tool_calls,
      id: randomUUID()
    })
    let lifecycle = state.turnLifecycle
    // Enter the expression phase only once. After an expression-tool round,
    // toolContextReloadNode keeps the lifecycle at `expressing`; re-entering
    // expressionNode must not rewind it to `ready`.
    if (!lifecycle) {
      lifecycle = advanceTurnLifecycle(lifecycle, 'ready')
    }
    if (lifecycle.phase === 'forming' || lifecycle.phase === 'revising') {
      lifecycle = advanceTurnLifecycle(lifecycle, 'ready')
    }
    if (lifecycle.phase === 'ready') {
      lifecycle = advanceTurnLifecycle(lifecycle, 'expressing')
    } else if (lifecycle.phase !== 'expressing') {
      throw new Error(`Invalid expression lifecycle phase: ${lifecycle.phase}`)
    }
    return {
      messages: [message],
      activeToolPhase: 'expression',
      loopDirective: 'compose_expression_tools',
      turnLifecycle: lifecycle
    }
  }
  const rawContent = contentToText(response.content).trim()
  if (!rawContent) throw new Error('expressionNode returned empty content')
  const parsed = parseFinalCompositionEnvelope(rawContent)
  const content = parsed.reply
  if (!content) throw new Error('expressionNode returned an empty reply')
  const message = new AIMessage({ content, id: randomUUID() })
  let lifecycle = state.turnLifecycle
  if (lifecycle?.phase !== 'ready' && lifecycle?.phase !== 'expressing') {
    lifecycle = advanceTurnLifecycle(lifecycle, 'ready')
  }
  if (lifecycle?.phase !== 'expressing') {
    lifecycle = advanceTurnLifecycle(lifecycle, 'expressing')
  }
  traceArtifact('expressionNode', {
    title: '产物: 最终回答候选',
    summary: content.slice(0, 120),
    data: { chars: content.length, hasLifeState: Boolean(parsed.committedLifeNarrative) }
  })
  let turnWorkspace = state.turnWorkspace
  if (turnWorkspace && parsed.committedLifeNarrative) {
    turnWorkspace = withLifeStateDraft(turnWorkspace, {
      narrative: parsed.committedLifeNarrative,
      sourceTurnId: turnWorkspace.turnId
    })
  }
  return {
    messages: [message],
    finalContentCandidate: {
      messageId: message.id!,
      content,
      source: 'final_composition',
      committedLifeNarrative: parsed.committedLifeNarrative || undefined
    },
    loopDirective: 'complete_expression',
    activeToolPhase: 'expression',
    // The expression model has now consumed the tool transcript that was
    // reloaded before this pass; do not let outputGuard reject a valid reply
    // as if an observation were still pending.
    pendingToolContext: [],
    ...(state.turnExecutionLedger
      ? { turnExecutionLedger: advanceTurnExecutionModelStep(state.turnExecutionLedger, false) }
      : {}),
    turnLifecycle: lifecycle,
    ...(turnWorkspace ? { turnWorkspace } : {})
  }
}
