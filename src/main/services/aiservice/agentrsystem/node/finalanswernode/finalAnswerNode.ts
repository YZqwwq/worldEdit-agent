import { randomUUID } from 'node:crypto'
import { AIMessage, AIMessageChunk } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { getConfiguredModelRuntime } from '../../modelwithtool/model'
import { contentToText } from '../../../messageoutput/transformRespones'
import {
  emitAgentTurnPhase,
  traceArtifact,
  traceState
} from '../../../../log/trace/agentTraceEmitter'
import { advanceTurnLifecycle } from '@share/cache/AItype/states/turnLifecycle'
import { withTurnLifecycleDraft } from '../../state/turnWorkspace'
import { buildFinalCompositionMessages } from './finalComposition'
import {
  createModelCallAbortScope,
  resolveMainAgentTimeoutMs
} from '../../execution/modelCallAbortScope'

export async function finalAnswerNode(
  state: typeof MessagesState.State,
  config?: { signal?: AbortSignal }
): Promise<Partial<typeof MessagesState.State>> {
  emitAgentTurnPhase({ phase: 'finalizing', label: '正在整理回答' })
  const runtime = await getConfiguredModelRuntime()
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

  traceState('finalAnswerNode', {
    title: '状态: 最终回答通道',
    summary: `reasoningSegments=${state.reasoningSegments?.length ?? 0}`,
    data: { expressionProfile: state.expressionProfile?.id, reasoningMode: state.reasoningMode }
  })
  let chunk: AIMessageChunk | undefined
  try {
    const stream = await runtime.model.stream(prepared, options as any)
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
  const content = chunk ? contentToText(chunk.content).trim() : ''
  if (!content) throw new Error('finalAnswerNode returned empty content')
  const message = new AIMessage({ content, id: randomUUID() })
  const currentLifecycle = state.turnLifecycle ?? state.turnWorkspace?.draft.lifecycle
  const lifecycle = advanceTurnLifecycle(currentLifecycle, 'ready')
  traceArtifact('finalAnswerNode', {
    title: '产物: 最终回答候选',
    summary: content.slice(0, 120),
    data: { chars: content.length }
  })
  return {
    messages: [message],
    finalContentCandidate: { messageId: message.id!, content, source: 'final_composition' },
    turnLifecycle: lifecycle,
    ...(state.turnWorkspace
      ? { turnWorkspace: withTurnLifecycleDraft(state.turnWorkspace, lifecycle) }
      : {})
  }
}
