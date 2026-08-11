import {
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type StoredMessage
} from '@langchain/core/messages'
import type { MessagesState } from '../../agentrsystem/state/messageState'

export type MainAgentResumePoint =
  | 'instantPerceptionNode'
  | 'contextNode'
  | 'llmCall'
  | 'toolNode'
  | 'toolContextReloadNode'
  | 'memoryNode'

type PersistedTurnGraphSnapshot = {
  messages: StoredMessage[]
  state: Record<string, unknown>
}

export const serializeTurnGraphState = (state: typeof MessagesState.State): string => {
  const { messages, ...rest } = state
  return JSON.stringify({
    messages: mapChatMessagesToStoredMessages(messages),
    state: rest
  } satisfies PersistedTurnGraphSnapshot)
}

export const deserializeTurnGraphState = (
  snapshotJson: string,
  resumePoint: MainAgentResumePoint
): Partial<typeof MessagesState.State> => {
  const parsed = JSON.parse(snapshotJson) as PersistedTurnGraphSnapshot
  if (!parsed || !Array.isArray(parsed.messages) || !parsed.state || typeof parsed.state !== 'object') {
    throw new Error('Turn version contains an invalid graph snapshot.')
  }
  return {
    ...(parsed.state as Partial<typeof MessagesState.State>),
    messages: mapStoredMessagesToChatMessages(parsed.messages),
    resumeFromNode: resumePoint
  }
}

export const readCompletedActionKeys = (snapshotJson: string): string[] => {
  const parsed = JSON.parse(snapshotJson) as PersistedTurnGraphSnapshot
  const ledger = parsed?.state?.turnExecutionLedger
  if (!ledger || typeof ledger !== 'object' || !Array.isArray((ledger as { actions?: unknown[] }).actions)) {
    return []
  }
  return (ledger as { actions: Array<Record<string, unknown>> }).actions
    .filter((action) => ['accepted', 'completed', 'partial'].includes(String(action.status || '')))
    .map((action) => String(action.invocationFingerprint || action.actionId || ''))
    .filter(Boolean)
}
