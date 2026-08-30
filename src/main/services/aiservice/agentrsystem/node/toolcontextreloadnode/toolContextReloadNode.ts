import { MessagesState } from '../../state/messageState'
import { traceArtifact } from '../../../../log/trace/agentTraceEmitter'
import { advanceTurnLifecycle } from '@share/cache/AItype/states/turnLifecycle'
import { uniqueToolContextItems } from '../../state/toolContextCollection'

export async function toolContextReloadNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const pending = state.pendingToolContext ?? []
  let lifecycle = state.turnLifecycle ?? {
    phase: 'observing' as const,
    revision: 0,
    updatedAt: new Date().toISOString()
  }
  if (state.activeToolPhase === 'expression') {
    if (lifecycle.phase === 'forming') lifecycle = advanceTurnLifecycle(lifecycle, 'ready')
    if (lifecycle.phase !== 'expressing') {
      lifecycle = advanceTurnLifecycle(lifecycle, 'expressing')
    }
  } else {
    lifecycle = advanceTurnLifecycle(lifecycle, 'revising')
  }

  if (pending.length > 0) {
    traceArtifact('toolContextReloadNode', {
      title: '产物: 工具结果等待首次消费',
      summary: `保留 ${pending.length} 个工具 transcript，等待下一次模型完整消费`,
      data: {
        pendingCount: pending.length,
        activeTranscriptCount: pending.reduce(
          (count, item) => count + item.transcriptMessageIds.length,
          0
        ),
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
    ...(state.turnWorkspace ? { turnWorkspace: state.turnWorkspace } : {}),
    // Promote the result before the next model step. The native transcript remains in
    // pendingToolContext until cognitionNode has consumed the paired AI/Tool messages.
    toolEvidenceContext: uniqueToolContextItems([
      ...(state.toolEvidenceContext ?? []),
      ...pending.filter((item) => item.retention === 'evidence' && item.ok !== false)
    ]),
    ephemeralToolContext: uniqueToolContextItems(
      pending.filter((item) => item.retention === 'ephemeral' || item.ok === false)
    )
  }
}
