import { MessagesState } from '../../state/messageState'
import { traceArtifact } from '../../../../log/trace/agentTraceEmitter'
import { advanceTurnLifecycle } from '@share/cache/AItype/states/turnLifecycle'
import { withTurnLifecycleDraft } from '../../state/turnWorkspace'
import { uniqueToolContextItems } from '../../state/toolContextCollection'

export async function toolContextReloadNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const pending = state.pendingToolContext ?? []
  const lifecycle = advanceTurnLifecycle(
    state.turnLifecycle ?? state.turnWorkspace?.draft.lifecycle ?? {
      phase: 'observing',
      revision: 0,
      updatedAt: new Date().toISOString()
    },
    'revising',
    { observationBatch: pending.map((item) => item.toolCallId).join(':') || undefined }
  )

  if (pending.length > 0) {
    traceArtifact('toolContextReloadNode', {
      title: '产物: 工具结果等待首次消费',
      summary: `保留 ${pending.length} 个工具 transcript，等待下一次模型完整消费`,
      data: {
        pendingCount: pending.length,
        activeTranscriptCount: state.activeToolTranscriptIds?.length ?? 0,
        pending: pending.map((item) => ({
          toolName: item.toolName,
          retention: item.retention,
          ok: item.ok,
          argsSummary: item.argsSummary,
          resultSummary: item.resultSummary
        }))
      }
    })
  }

  return {
    turnLifecycle: lifecycle,
    ...(state.turnWorkspace
      ? { turnWorkspace: withTurnLifecycleDraft(state.turnWorkspace, lifecycle) }
      : {}),
    // Promote the result before the next model step. The native transcript remains in
    // pendingToolContext until llmCall has consumed the paired AI/Tool messages.
    toolEvidenceContext: uniqueToolContextItems([
      ...(state.toolEvidenceContext ?? []),
      ...pending.filter((item) => item.retention === 'evidence' && item.ok !== false)
    ]),
    ephemeralToolContext: uniqueToolContextItems(
      pending.filter((item) => item.retention === 'ephemeral' || item.ok === false)
    )
  }
}
