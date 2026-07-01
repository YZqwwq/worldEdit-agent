import { Annotation, messagesStateReducer } from '@langchain/langgraph'
import { BaseMessage } from '@langchain/core/messages'
import type { PersonaPolicy } from '@share/cache/AItype/states/personaPolicy'
import type { MoodAssessment } from '@share/cache/AItype/states/moodAssessment'
import type {
  MainAgentBackgroundPersonaStagePayload,
  TaskLifecycleState
} from '@share/cache/AItype/states/taskLifecycleState'
import type { ExpressionPromptProfileState } from '@share/cache/AItype/states/expressionPromptProfile'
import type { WorldEntityType } from '@share/cache/worldbuilding/worldbuilding'
import type { AgentToolContextRetention } from '../../ai-utils/core/agentTool'

export type ToolContextSourceRef = {
  type: 'message' | 'url' | 'entity' | 'task' | 'tool' | 'unknown'
  id?: string | number
  title?: string
  url?: string
}

export type ToolContextItem = {
  id: string
  toolName: string
  retention: AgentToolContextRetention
  ok: boolean | null
  argsSummary: string
  resultSummary: string
  createdAtLoop: number
  sourceRefs?: ToolContextSourceRef[]
}

export type PendingToolContextItem = ToolContextItem & {
  toolCallId: string
  transcriptMessageIds: string[]
}

export type WorldFocusContext = {
  worldId: string
  worldName: string
  focusType: WorldEntityType
  entityId: string
  entityName: string
  confidence: number
  impression?: {
    status: 'available' | 'missing' | 'stale' | 'insufficient'
    found: boolean
    structuredText?: string
    updatedAt?: string
    latestNarrativeUpdatedAt?: string
    narrativeDocumentCount?: number
    narrativeReadableCharacters?: number
    reason?: string
    generatedThisTurn?: boolean
  }
}

export type InstantPerceptionDetectorStatus = {
  status: 'fulfilled' | 'rejected'
  durationMs: number
  producedStateKeys: string[]
  errorMessage?: string
}

export type InstantPerceptionSnapshot = {
  mode: 'parallel_dag'
  startedAt: string
  completedAt: string
  durationMs: number
  detectors: {
    worldFocus: InstantPerceptionDetectorStatus
    persona: InstantPerceptionDetectorStatus
  }
  warnings: string[]
}

export const MessagesState = Annotation.Root({
  // 消息状态
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => []
  }),
  llmCalls: Annotation<number | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  personaPolicy: Annotation<PersonaPolicy | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  moodAssessment: Annotation<MoodAssessment | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  expressionProfile: Annotation<ExpressionPromptProfileState | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  taskLifecycle: Annotation<TaskLifecycleState | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  backgroundPersonaStage: Annotation<MainAgentBackgroundPersonaStagePayload | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  worldFocusContext: Annotation<WorldFocusContext | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  instantPerception: Annotation<InstantPerceptionSnapshot | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  toolEvidenceContext: Annotation<ToolContextItem[]>({
    reducer: (_x, y) => y ?? [],
    default: () => []
  }),
  ephemeralToolContext: Annotation<ToolContextItem[]>({
    reducer: (_x, y) => y ?? [],
    default: () => []
  }),
  pendingToolContext: Annotation<PendingToolContextItem[]>({
    reducer: (_x, y) => y ?? [],
    default: () => []
  }),
  retainedToolTranscriptIds: Annotation<string[]>({
    reducer: (_x, y) => y ?? [],
    default: () => []
  }),
  activeToolTranscriptIds: Annotation<string[]>({
    reducer: (_x, y) => y ?? [],
    default: () => []
  }),
  activeToolsets: Annotation<string[]>({
    reducer: (x, y) => {
      const merged = new Set<string>(x ?? [])
      for (const item of y ?? []) {
        if (typeof item === 'string' && item.trim()) {
          merged.add(item.trim())
        }
      }
      return [...merged]
    },
    default: () => []
  }),
  activeTools: Annotation<string[]>({
    reducer: (x, y) => {
      const merged = new Set<string>(x ?? [])
      for (const item of y ?? []) {
        if (typeof item === 'string' && item.trim()) {
          merged.add(item.trim())
        }
      }
      return [...merged]
    },
    default: () => []
  }),
  quickToolsets: Annotation<string[]>({
    reducer: (_x, y) => y ?? [],
    default: () => []
  }),
  quickTools: Annotation<string[]>({
    reducer: (_x, y) => y ?? [],
    default: () => []
  }),
  suppressedTools: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
    default: () => []
  })
})
