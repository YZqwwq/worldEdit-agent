import { MessagesState } from '../../state/messageState'
import { AIMessage } from '@langchain/core/messages'
import { createFinalResponse } from '../../state/turnWorkspace'
import { advanceTurnLifecycle } from '@share/cache/AItype/states/turnLifecycle'
import { traceArtifact, traceDecision } from '../../../../log/trace/agentTraceEmitter'
import { contentToText } from '../../../messageoutput/transformRespones'

const FORBIDDEN_WRAPPERS = [/^<\/?(?:think|reasoning)>/i, /^```(?:reasoning|thinking)/i]

const findFinalCandidateMessage = (state: typeof MessagesState.State, messageId: string) =>
  [...(state.messages ?? [])]
    .reverse()
    .find(
      (message) =>
        message.id === messageId &&
        (message instanceof AIMessage ||
          message.constructor.name === 'AIMessageChunk' ||
          (message as { _getType?: () => string })._getType?.() === 'ai')
    ) as AIMessage | undefined

export const assertFinalOutputConsistency = (state: typeof MessagesState.State): void => {
  const candidate = state.finalContentCandidate
  const content = candidate?.content.trim() ?? ''
  if (!candidate || !content) {
    throw new Error('outputGuardNode requires a non-empty final content candidate.')
  }
  if (FORBIDDEN_WRAPPERS.some((pattern) => pattern.test(content))) {
    throw new Error('Final content contains an internal reasoning wrapper.')
  }
  if ((candidate as { source?: string }).source !== 'final_composition') {
    throw new Error('Final content must be produced by the final composition boundary.')
  }
  if ((state.pendingToolContext?.length ?? 0) > 0) {
    throw new Error(
      'Final content cannot be accepted before pending tool observations are consumed.'
    )
  }
  if (!state.turnExecutionLedger || state.turnExecutionLedger.modelStep < 1) {
    throw new Error('Final content requires a model execution record.')
  }
  if (state.turnExecutionLedger.phase !== 'answering') {
    throw new Error('Final content cannot be accepted while the execution ledger is still acting.')
  }

  const message = findFinalCandidateMessage(state, candidate.messageId)
  if (!message) {
    throw new Error('Final content candidate does not reference an AI message in this turn.')
  }
  if (message.additional_kwargs?.isInternalReasoning) {
    throw new Error('An internal reasoning message cannot become the final response.')
  }
  if ((message.tool_calls?.length ?? 0) > 0) {
    throw new Error('A message that still requests tools cannot become the final response.')
  }
  if (contentToText(message.content).trim() !== content) {
    throw new Error('Final content candidate does not match its source message.')
  }
  if (
    candidate.committedLifeNarrative &&
    state.turnWorkspace?.draft.lifeState?.narrative.trim() !==
      candidate.committedLifeNarrative.trim()
  ) {
    throw new Error('Final life-state candidate does not match the Turn workspace draft.')
  }
}

export async function outputGuardNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  assertFinalOutputConsistency(state)
  const candidate = state.finalContentCandidate!
  const content = candidate.content.trim()
  let lifecycle = state.turnLifecycle
  if (lifecycle?.phase !== 'ready' && lifecycle?.phase !== 'expressing') {
    lifecycle = advanceTurnLifecycle(lifecycle, 'ready')
  }
  if (lifecycle?.phase !== 'expressing') {
    lifecycle = advanceTurnLifecycle(lifecycle, 'expressing')
  }
  const finalResponse = createFinalResponse({ messageId: candidate.messageId, content })
  traceDecision('outputGuardNode', {
    title: '决策: 最终输出边界',
    summary: `accepted (${candidate.source})`,
    data: { source: candidate.source, chars: content.length }
  })
  traceArtifact('outputGuardNode', {
    title: '产物: 用户可见回答',
    summary: content.slice(0, 120),
    data: { chars: content.length }
  })
  return {
    finalResponse,
    turnLifecycle: lifecycle,
    ...(state.turnWorkspace ? { turnWorkspace: state.turnWorkspace } : {})
  }
}
