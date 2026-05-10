import { RemoveMessage } from '@langchain/core/messages'
import { MessagesState, type ToolContextItem } from '../../state/messageState'
import {
  traceArtifact,
  traceDecision
} from '../../../../log/trace/agentTraceEmitter'

const MAX_EVIDENCE_ITEMS = 6
const MAX_EPHEMERAL_ITEMS = 6

const uniquePreserveLast = (items: ToolContextItem[]): ToolContextItem[] => {
  const byKey = new Map<string, ToolContextItem>()
  for (const item of items) {
    const key = `${item.toolName}:${item.argsSummary}:${item.resultSummary}`
    byKey.set(key, item)
  }
  return [...byKey.values()]
}

export async function toolContextReloadNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const pending = state.pendingToolContext ?? []
  const activeTranscriptIds = state.activeToolTranscriptIds ?? []
  const existingMessageIds = new Set(
    state.messages
      .map((message) => message.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  )

  const transcriptIdsToRemove = [
    ...(state.retainedToolTranscriptIds ?? []),
    ...activeTranscriptIds
  ].filter((id, index, ids) => ids.indexOf(id) === index && existingMessageIds.has(id))

  const evidenceItems = pending.filter(
    (item) => item.retention === 'evidence' && item.ok !== false
  )
  const ephemeralItems = pending.filter(
    (item) => item.retention === 'ephemeral' || item.ok === false
  )

  const nextEvidence = uniquePreserveLast([
    ...(state.toolEvidenceContext ?? []),
    ...evidenceItems
  ]).slice(-MAX_EVIDENCE_ITEMS)
  const nextEphemeral = ephemeralItems.slice(-MAX_EPHEMERAL_ITEMS)

  if (pending.length > 0) {
    traceArtifact('toolContextReloadNode', {
      title: '产物: 工具上下文重装',
      summary:
        `整理 ${pending.length} 个工具结果，` +
        `证据区 ${nextEvidence.length} 条，临时区 ${nextEphemeral.length} 条`,
      data: {
        pendingCount: pending.length,
        evidenceCount: nextEvidence.length,
        ephemeralCount: nextEphemeral.length,
        removedTranscriptCount: transcriptIdsToRemove.length,
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

  if (transcriptIdsToRemove.length > 0) {
    traceDecision('toolContextReloadNode', {
      title: '决策: 清理工具 transcript',
      summary: `移除 ${transcriptIdsToRemove.length} 条 tool-call/ToolMessage transcript`,
      data: {
        transcriptIdsToRemove
      }
    })
  }

  return {
    messages: transcriptIdsToRemove.map((id) => new RemoveMessage({ id })),
    toolEvidenceContext: nextEvidence,
    ephemeralToolContext: nextEphemeral,
    pendingToolContext: [],
    retainedToolTranscriptIds: [],
    activeToolTranscriptIds: []
  }
}
