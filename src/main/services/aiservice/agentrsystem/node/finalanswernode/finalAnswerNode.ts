import { randomUUID } from 'node:crypto'
import { AIMessage, AIMessageChunk } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { getConfiguredModelRuntime } from '../../modelwithtool/model'
import { contentToText } from '../../../messageoutput/transformRespones'
import { traceArtifact, traceState } from '../../../../log/trace/agentTraceEmitter'
import { advanceTurnLifecycle } from '@share/cache/AItype/states/turnLifecycle'
import { withTurnLifecycleDraft } from '../../state/turnWorkspace'
import { buildFinalCompositionMessages } from './finalComposition'

export async function finalAnswerNode(
  state: typeof MessagesState.State,
  config?: { signal?: AbortSignal }
): Promise<Partial<typeof MessagesState.State>> {
  const runtime = await getConfiguredModelRuntime()
  const messages = buildFinalCompositionMessages(state)
  const prepared = await runtime.familyAdapter.prepareMessages(messages, runtime)
  const options: Record<string, unknown> = { signal: config?.signal }
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
  const stream = await runtime.model.stream(prepared, options as any)
  for await (const current of stream)
    chunk = chunk ? chunk.concat(current as AIMessageChunk) : (current as AIMessageChunk)
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
