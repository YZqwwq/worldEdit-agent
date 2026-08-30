import {
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type StoredMessage
} from '@langchain/core/messages'
import type { MessagesState } from '../../agentrsystem/state/messageState'
import type { MainAgentReadyToCommitCandidate } from '@share/cache/AItype/states/turnWorkspace'
import type { TurnWorkspace } from '@share/cache/AItype/states/turnWorkspace'

export type MainAgentResumePoint =
  | 'instantPerceptionNode'
  | 'contextNode'
  | 'cognitionNode'
  | 'expressionNode'
  | 'expressionToolNode'
  | 'outputGuardNode'
  | 'toolNode'
  | 'toolContextReloadNode'
  | 'memoryNode'

type PersistedTurnGraphSnapshot = {
  messages: StoredMessage[]
  state: Record<string, unknown>
}

const normalizeTurnWorkspace = (value: unknown): TurnWorkspace | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const workspace = value as TurnWorkspace
  if (!workspace.draft || typeof workspace.draft !== 'object') return undefined
  const legacyLifeState = {
    narrative: '',
    revision: 0,
    updatedAt: '',
    sourceTurnId: null
  }
  return {
    ...workspace,
    base: {
      ...workspace.base,
      lifeState: workspace.base?.lifeState ?? legacyLifeState
    },
    draft: {
      ...workspace.draft,
      durableToolReceipts: Array.isArray(workspace.draft.durableToolReceipts)
        ? workspace.draft.durableToolReceipts
        : []
    }
  }
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
  if (
    !parsed ||
    !Array.isArray(parsed.messages) ||
    !parsed.state ||
    typeof parsed.state !== 'object'
  ) {
    throw new Error('Turn version contains an invalid graph snapshot.')
  }
  const state = parsed.state as Partial<typeof MessagesState.State>
  return {
    ...state,
    turnWorkspace: normalizeTurnWorkspace(state.turnWorkspace),
    messages: mapStoredMessagesToChatMessages(parsed.messages),
    resumeFromNode: resumePoint
  }
}

export const readCompletedActionKeys = (snapshotJson: string): string[] => {
  const parsed = JSON.parse(snapshotJson) as PersistedTurnGraphSnapshot
  const ledger = parsed?.state?.turnExecutionLedger
  if (
    !ledger ||
    typeof ledger !== 'object' ||
    !Array.isArray((ledger as { actions?: unknown[] }).actions)
  ) {
    return []
  }
  return (ledger as { actions: Array<Record<string, unknown>> }).actions
    .filter((action) => ['accepted', 'completed', 'partial'].includes(String(action.status || '')))
    .map((action) => String(action.invocationFingerprint || action.actionId || ''))
    .filter(Boolean)
}

export const serializeReadyToCommitCandidate = (
  candidate: MainAgentReadyToCommitCandidate
): string => JSON.stringify(candidate)

export const deserializeReadyToCommitCandidate = (
  snapshotJson: string
): MainAgentReadyToCommitCandidate => {
  const candidate = JSON.parse(snapshotJson) as Partial<MainAgentReadyToCommitCandidate>
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.eventId !== 'string' ||
    typeof candidate.turnId !== 'number' ||
    typeof candidate.sessionId !== 'string' ||
    !['chat_runtime', 'task_notification_consumer'].includes(String(candidate.consumer)) ||
    candidate.status !== 'completed' ||
    !candidate.workspace ||
    typeof candidate.workspace !== 'object' ||
    !candidate.finalResponse ||
    typeof candidate.finalResponse.content !== 'string' ||
    !candidate.finalResponse.content.trim()
  ) {
    throw new Error('Turn version contains an invalid ready-to-commit candidate.')
  }
  if (
    candidate.workspace.eventId !== candidate.eventId ||
    candidate.workspace.turnId !== candidate.turnId ||
    candidate.workspace.sessionId !== candidate.sessionId
  ) {
    throw new Error('Ready-to-commit candidate identity does not match its workspace.')
  }
  return {
    ...(candidate as MainAgentReadyToCommitCandidate),
    workspace: normalizeTurnWorkspace(candidate.workspace)!
  }
}
