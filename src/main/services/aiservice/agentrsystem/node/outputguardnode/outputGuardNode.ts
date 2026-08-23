import { MessagesState } from '../../state/messageState'
import { createFinalResponse, withTurnLifecycleDraft } from '../../state/turnWorkspace'
import { advanceTurnLifecycle } from '@share/cache/AItype/states/turnLifecycle'
import { traceArtifact, traceDecision } from '../../../../log/trace/agentTraceEmitter'

const FORBIDDEN_WRAPPERS = [/^<\/?(?:think|reasoning)>/i, /^```(?:reasoning|thinking)/i]

export async function outputGuardNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const candidate = state.finalContentCandidate
  const content = candidate?.content.trim() ?? ''
  if (!candidate || !content) throw new Error('outputGuardNode requires a non-empty final content candidate.')
  if (FORBIDDEN_WRAPPERS.some((pattern) => pattern.test(content))) {
    throw new Error('Final content contains an internal reasoning wrapper.')
  }
  let lifecycle = state.turnLifecycle ?? state.turnWorkspace?.draft.lifecycle
  if (lifecycle?.phase !== 'ready') lifecycle = advanceTurnLifecycle(lifecycle, 'ready')
  lifecycle = advanceTurnLifecycle(lifecycle, 'expressing')
  const finalResponse = createFinalResponse({ messageId: candidate.messageId, content })
  traceDecision('outputGuardNode', {
    title: '决策: 最终输出边界', summary: `accepted (${candidate.source})`,
    data: { source: candidate.source, chars: content.length }
  })
  traceArtifact('outputGuardNode', {
    title: '产物: 用户可见回答', summary: content.slice(0, 120), data: { chars: content.length }
  })
  return {
    finalResponse,
    turnLifecycle: lifecycle,
    ...(state.turnWorkspace ? { turnWorkspace: withTurnLifecycleDraft(state.turnWorkspace, lifecycle) } : {})
  }
}
