import type { MemorySlotSnapshot } from './memorySlots'
import type { PersonaState } from './personalState'
import type { InteractionObservationSnapshot } from './interactionObservation'
import type { ToolChangeSetSummary } from './toolEffect'
import type { TurnLifecycleState } from './turnLifecycle'
import type { SelfCoreSnapshot } from './selfCore'

export type TurnWorkspaceMemoryMessage = {
  role: 'user' | 'ai'
  content: string
}

export type MainAgentFinalResponse = {
  messageId: string
  content: string
}

export type TurnWorkspaceDurableToolReceipt = {
  receiptId?: string
  changeSetId?: string
  toolCallId: string
  effectKey?: string
  toolName: string
  operation: string
  subject?: {
    type: string
    id?: string
    label?: string
  }
  completion: 'complete' | 'partial' | 'failed'
  completionState: 'accepted' | 'running' | 'awaiting_input' | 'completed' | 'failed'
  effectStatus?: 'planned' | 'completed' | 'failed' | 'aborted' | 'unknown'
  beforeRevision?: number
  afterRevision?: number
  beforeRef?: string
  afterRef?: string
  summary: string
  retryable: boolean
  evidenceRef?: string
  diffRef?: string
  resultRef?: string
  payload?: Record<string, unknown>
  persistedAt: string
}

export type TurnWorkspace = {
  eventId: string
  turnId: number
  sessionId: string
  runId: string
  base: {
    memorySlots: MemorySlotSnapshot
    persona: PersonaState | null
    selfCore?: SelfCoreSnapshot | null
    identityAnchor?: {
      prompt: string
      capturedAt: string
      coreId?: string
      coreRevision?: number
    }
  }
  draft: {
    memorySlots?: MemorySlotSnapshot
    persona?: PersonaState
    memoryMessages: TurnWorkspaceMemoryMessage[]
    successfulToolNames: string[]
    durableToolReceipts: TurnWorkspaceDurableToolReceipt[]
    changeSet?: ToolChangeSetSummary
    observations: InteractionObservationSnapshot[]
    lifecycle?: TurnLifecycleState
  }
}

export type MainAgentGraphTurnResult = {
  workspace: TurnWorkspace
  finalResponse?: MainAgentFinalResponse
}

export type MainAgentReadyToCommitCandidate = {
  schemaVersion: 1
  eventId: string
  turnId: number
  sessionId: string
  consumer: 'chat_runtime' | 'task_notification_consumer'
  status: 'completed'
  workspace: TurnWorkspace
  finalResponse: MainAgentFinalResponse
}

export type MainAgentInterruptionRecord = {
  reason: 'user_interrupted' | 'runtime_reset'
  interruptedAt: string
  sourceVersionId?: number
  resumePoint?: string
}
