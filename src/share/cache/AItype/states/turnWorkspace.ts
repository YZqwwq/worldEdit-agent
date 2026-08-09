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
    observations: InteractionObservationSnapshot[]
  }
}

export type MainAgentGraphTurnResult = {
  workspace: TurnWorkspace
  finalResponse?: MainAgentFinalResponse
}
