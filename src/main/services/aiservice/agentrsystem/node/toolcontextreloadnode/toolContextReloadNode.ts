import { MessagesState } from '../../state/messageState'
import { traceArtifact } from '../../../../log/trace/agentTraceEmitter'

export async function toolContextReloadNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const pending = state.pendingToolContext ?? []

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
    // The transcript is consumed by llmCall before any lifecycle migration or cleanup.
    ephemeralToolContext: []
  }
}
