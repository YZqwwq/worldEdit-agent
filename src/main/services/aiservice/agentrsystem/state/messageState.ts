import { Annotation, messagesStateReducer } from '@langchain/langgraph'
import { BaseMessage } from '@langchain/core/messages'
import type { PersonaPolicy } from '@share/cache/AItype/states/personaPolicy'
import type { TaskLifecycleState } from '@share/cache/AItype/states/taskLifecycleState'
import type { ExpressionPromptProfileState } from '@share/cache/AItype/states/expressionPromptProfile'
import type { WorldEntityType } from '@share/cache/worldbuilding/worldbuilding'
import type { AgentToolContextRetention, AgentToolPhase } from '../../ai-utils/core/agentTool'
import type { AgentWorkspaceContext } from '@share/cache/AItype/states/agentWorkspaceContext'
import type { TurnExecutionLedger } from '../execution/turnExecutionLifecycle'
import type {
  MainAgentFinalResponse,
  TurnWorkspace
} from '@share/cache/AItype/states/turnWorkspace'
import type { MainAgentResumePoint } from '../../runtime/version/turnVersionSnapshot'
import type {
  AgentLoopDirective,
  TurnLifecycleState
} from '@share/cache/AItype/states/turnLifecycle'
import type { TurnInput } from '@share/cache/AItype/states/turnInput'
import type {
  CognitionDraft,
  FinalContentCandidate,
  ReasoningChannelMode
} from '@share/cache/AItype/states/reasoningChannel'

export type ToolContextSourceRef = {
  type: 'message' | 'url' | 'entity' | 'document' | 'task' | 'tool' | 'unknown'
  id?: string | number
  title?: string
  url?: string
  entityType?: WorldEntityType
  worldId?: string
  revision?: number
}

export type ToolContextItem = {
  id: string
  toolCallId?: string
  supersessionKey?: string
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

export const MessagesState = Annotation.Root({
  turnInput: Annotation<TurnInput | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  resumeFromNode: Annotation<MainAgentResumePoint | undefined>({
    reducer: (_x, y) => y,
    default: () => undefined
  }),
  // 消息状态
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => []
  }),
  personaPolicy: Annotation<PersonaPolicy | undefined>({
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
  workspaceContext: Annotation<AgentWorkspaceContext | undefined>({
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
  toolCallCounts: Annotation<Record<string, number>>({
    reducer: (x, y) => y ?? x ?? {},
    default: () => ({})
  }),
  turnExecutionLedger: Annotation<TurnExecutionLedger | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  reasoningMode: Annotation<ReasoningChannelMode | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  consecutiveEmptyModelResponses: Annotation<number>({
    reducer: (_x, y) => y,
    default: () => 0
  }),
  cognitionDraft: Annotation<CognitionDraft | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  finalContentCandidate: Annotation<FinalContentCandidate | undefined>({
    reducer: (_x, y) => y,
    default: () => undefined
  }),
  turnLifecycle: Annotation<TurnLifecycleState | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  loopDirective: Annotation<AgentLoopDirective | undefined>({
    reducer: (_x, y) => y,
    default: () => undefined
  }),
  activeToolPhase: Annotation<AgentToolPhase>({
    reducer: (_x, y) => y ?? 'cognition',
    default: () => 'cognition'
  }),
  turnWorkspace: Annotation<TurnWorkspace | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  finalResponse: Annotation<MainAgentFinalResponse | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  })
})
