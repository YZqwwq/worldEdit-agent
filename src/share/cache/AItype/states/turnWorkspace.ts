import type { MemorySlotSnapshot } from './memorySlots'
import type { PersonaState } from './personalState'
import type { InteractionObservationSnapshot } from './interactionObservation'
import type { ToolChangeSetSummary } from './toolEffect'
import type { TurnLifecycleState } from './turnLifecycle'
import type { SelfExperienceDraft, TurnExperienceIntent } from './selfModel'

export type ExpressionAffect =
  | 'natural'
  | 'bright'
  | 'tender'
  | 'melancholic'
  | 'concerned'
  | 'tense'
  | 'firm'
  | 'irritated'

export type TurnWorkspaceMemoryMessage = {
  role: 'user' | 'ai'
  content: string
}

export type MainAgentFinalResponse = {
  messageId: string
  content: string
}

export type TurnCognitiveState = {
  objective: string
  understanding: string
  selfPosition?: string
  personalMeaning?: string
  provisionalStance?: string
  knowledgeGap?: string
  nextObservationGoal?: string
  lastEvidenceImpact?: 'supports' | 'refines' | 'contradicts' | 'insufficient' | 'irrelevant'
  previousUnderstanding?: string
  evidenceRefs: string[]
  unresolvedQuestions: string[]
  phase: 'forming' | 'observing' | 'revising' | 'ready'
  revision: number
  updatedAt: string
}

export type ResponseOrientation = {
  mode: 'conversation' | 'answer' | 'opinion' | 'result' | 'clarification'
  coreResponse: string
  selfPosition: string
  personalMeaning?: string
  expressionAffect: ExpressionAffect
  stance?: string
  basis?: string[]
  relationalIntent?:
    | 'share_reaction'
    | 'answer_directly'
    | 'challenge'
    | 'support'
    | 'invite_discussion'
    | 'report_result'
  selectedPoints: string[]
  uncertainty?: string
  depth: 'brief' | 'normal' | 'expanded'
  experienceIntent?: TurnExperienceIntent
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
    identityAnchor?: {
      prompt: string
      capturedAt: string
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
    cognitiveState?: TurnCognitiveState
    responseOrientation?: ResponseOrientation
    lifecycle?: TurnLifecycleState
    selfExperience?: SelfExperienceDraft
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
