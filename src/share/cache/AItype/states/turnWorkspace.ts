import type { MemorySlotSnapshot } from './memorySlots'
import type { PersonaState } from './personalState'
import type { InteractionObservationSnapshot } from './interactionObservation'

export type TurnWorkspaceMemoryMessage = {
  role: 'user' | 'ai'
  content: string
}

export type MainAgentFinalResponse = {
  messageId: string
  content: string
}

export type TurnWorkspaceDurableToolReceipt = {
  toolCallId: string
  toolName: string
  operation: string
  subject?: {
    type: string
    id?: string
    label?: string
  }
  completion: 'complete' | 'partial' | 'failed'
  completionState: 'accepted' | 'running' | 'awaiting_input' | 'completed' | 'failed'
  summary: string
  retryable: boolean
  evidenceRef?: string
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
  }
  draft: {
    memorySlots?: MemorySlotSnapshot
    persona?: PersonaState
    memoryMessages: TurnWorkspaceMemoryMessage[]
    successfulToolNames: string[]
    durableToolReceipts: TurnWorkspaceDurableToolReceipt[]
    observations: InteractionObservationSnapshot[]
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
  consumer: 'chat_runtime'
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
