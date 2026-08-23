import { randomUUID } from 'node:crypto'
import { AIMessage, AIMessageChunk, BaseMessage, SystemMessage } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { getConfiguredModelRuntime } from '../../modelwithtool/model'
import { contentToText } from '../../../messageoutput/transformRespones'
import { traceArtifact, traceState } from '../../../../log/trace/agentTraceEmitter'
import { advanceTurnLifecycle } from '@share/cache/AItype/states/turnLifecycle'
import { withTurnLifecycleDraft } from '../../state/turnWorkspace'

export async function finalAnswerNode(
  state: typeof MessagesState.State,
  config?: { signal?: AbortSignal }
): Promise<Partial<typeof MessagesState.State>> {
  const runtime = await getConfiguredModelRuntime()
  const boundary = new SystemMessage([
    '现在结束内部思考，直接回答用户。此前本轮的 assistant 文本是内部思考结果，不是需要续写或解释给用户的草稿。',
    '保留其中已经形成的判断与必要依据，用稳定人格自己的声音自然地说出来。不要展示分析步骤、结构字段、工具过程或“根据以上思考”等元话语。',
    state.expressionProfile?.prompt ?? '',
    '默认简洁：能用一两段说清就不要扩成完整评论；只有用户明确需要展开或问题确实复杂时才增加篇幅。',
    '不要引入此前思考和 observation 中没有的新事实。只输出最终回答正文。'
  ].filter(Boolean).join('\n'))
  const source = [...state.messages]
  const messages: BaseMessage[] = [
    ...source.filter((message) => message instanceof SystemMessage),
    boundary,
    ...source.filter((message) => !(message instanceof SystemMessage))
  ]
  const prepared = await runtime.familyAdapter.prepareMessages(messages, runtime)
  const options: Record<string, unknown> = { signal: config?.signal }
  const temperature = Number(runtime.effectiveOptions.temperature)
  if (Number.isFinite(temperature)) options.temperature = Math.min(1.2, Math.max(0, temperature))
  const maxTokens = Number(runtime.effectiveOptions.mainAgentMaxTokens)
  if (Number.isFinite(maxTokens) && maxTokens > 0) options.maxTokens = Math.min(Math.round(maxTokens), 1200)

  traceState('finalAnswerNode', {
    title: '状态: 最终回答通道',
    summary: `reasoningSegments=${state.reasoningSegments?.length ?? 0}`,
    data: { expressionProfile: state.expressionProfile?.id, reasoningMode: state.reasoningMode }
  })
  let chunk: AIMessageChunk | undefined
  const stream = await runtime.model.stream(prepared, options as any)
  for await (const current of stream) chunk = chunk ? chunk.concat(current as AIMessageChunk) : current as AIMessageChunk
  const content = chunk ? contentToText(chunk.content).trim() : ''
  if (!content) throw new Error('finalAnswerNode returned empty content')
  const message = new AIMessage({ content, id: randomUUID() })
  const currentLifecycle = state.turnLifecycle ?? state.turnWorkspace?.draft.lifecycle
  const lifecycle = advanceTurnLifecycle(currentLifecycle, 'ready')
  traceArtifact('finalAnswerNode', {
    title: '产物: 最终回答候选', summary: content.slice(0, 120), data: { chars: content.length }
  })
  return {
    messages: [message],
    finalContentCandidate: { messageId: message.id!, content, source: 'final_composition' },
    turnLifecycle: lifecycle,
    ...(state.turnWorkspace ? { turnWorkspace: withTurnLifecycleDraft(state.turnWorkspace, lifecycle) } : {})
  }
}
