import type { MemorySlotSnapshot } from '@share/cache/AItype/states/memorySlots'
import type { PersonaState } from '@share/cache/AItype/states/personalState'
import type {
  MainAgentFinalResponse,
  TurnWorkspace
} from '@share/cache/AItype/states/turnWorkspace'
import type { ToolChangeSetSummary } from '@share/cache/AItype/states/toolEffect'
import type { TurnLifecycleState } from '@share/cache/AItype/states/turnLifecycle'
import type { SelfCoreSnapshot } from '@share/cache/AItype/states/selfCore'
import type {
  AgentLifeStateCandidate,
  AgentLifeStateSnapshot
} from '@share/cache/AItype/states/agentLifeState'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export const createTurnWorkspace = (input: {
  eventId: string
  turnId: number
  sessionId: string
  runId: string
  memorySlots: MemorySlotSnapshot
  persona: PersonaState | null
  selfCore?: SelfCoreSnapshot | null
  lifeState?: AgentLifeStateSnapshot
}): TurnWorkspace => ({
  eventId: input.eventId,
  turnId: input.turnId,
  sessionId: input.sessionId,
  runId: input.runId,
  base: {
    memorySlots: clone(input.memorySlots),
    persona: input.persona ? clone(input.persona) : null,
    selfCore: input.selfCore ? clone(input.selfCore) : null,
    lifeState: clone(
      input.lifeState ?? {
        narrative: '',
        revision: 0,
        updatedAt: '',
        sourceTurnId: null
      }
    )
  },
  draft: {
    memoryMessages: [],
    successfulToolNames: [],
    durableToolReceipts: [],
    observations: []
  }
})

export const getEffectiveMemorySlots = (workspace: TurnWorkspace): MemorySlotSnapshot =>
  clone(workspace.draft.memorySlots ?? workspace.base.memorySlots)

export const getEffectivePersona = (workspace: TurnWorkspace): PersonaState | null => {
  const persona = workspace.draft.persona ?? workspace.base.persona
  return persona ? clone(persona) : null
}

export const getEffectiveSelfCore = (workspace: TurnWorkspace): SelfCoreSnapshot | null => {
  const core = workspace.base.selfCore
  return core ? clone(core) : null
}

export const getEffectiveLifeState = (workspace: TurnWorkspace): AgentLifeStateSnapshot => {
  const candidate = workspace.draft.lifeState
  if (!candidate) return clone(workspace.base.lifeState)
  return {
    narrative: candidate.narrative,
    revision: workspace.base.lifeState.revision + 1,
    updatedAt: workspace.base.lifeState.updatedAt,
    sourceTurnId: candidate.sourceTurnId
  }
}

export const withLifeStateDraft = (
  workspace: TurnWorkspace,
  candidate: AgentLifeStateCandidate
): TurnWorkspace => ({
  ...workspace,
  draft: {
    ...workspace.draft,
    lifeState: clone(candidate)
  }
})

export const withSelfCoreSnapshot = (
  workspace: TurnWorkspace,
  selfCore: SelfCoreSnapshot
): TurnWorkspace => {
  if (workspace.base.selfCore) return workspace
  return {
    ...workspace,
    base: {
      ...workspace.base,
      selfCore: clone(selfCore)
    }
  }
}

export const withIdentityAnchorSnapshot = (
  workspace: TurnWorkspace,
  prompt: string,
  source?: { coreId: string; coreRevision: number }
): TurnWorkspace => {
  if (workspace.base.identityAnchor) return workspace
  return {
    ...workspace,
    base: {
      ...workspace.base,
      identityAnchor: {
        prompt,
        capturedAt: new Date().toISOString(),
        coreId: source?.coreId,
        coreRevision: source?.coreRevision
      }
    }
  }
}

export const withMemorySlotsDraft = (
  workspace: TurnWorkspace,
  memorySlots: MemorySlotSnapshot
): TurnWorkspace => ({
  ...workspace,
  draft: {
    ...workspace.draft,
    memorySlots: clone(memorySlots)
  }
})

export const withPersonaDraft = (
  workspace: TurnWorkspace,
  persona: PersonaState
): TurnWorkspace => ({
  ...workspace,
  draft: {
    ...workspace.draft,
    persona: clone(persona)
  }
})

export const withMemoryMessagesDraft = (
  workspace: TurnWorkspace,
  messages: TurnWorkspace['draft']['memoryMessages']
): TurnWorkspace => ({
  ...workspace,
  draft: {
    ...workspace.draft,
    memoryMessages: messages.map((message) => ({ ...message }))
  }
})

export const withSuccessfulToolUse = (
  workspace: TurnWorkspace,
  toolName: string
): TurnWorkspace => ({
  ...workspace,
  draft: {
    ...workspace.draft,
    successfulToolNames: [...new Set([...workspace.draft.successfulToolNames, toolName])]
  }
})

export const withDurableToolReceipt = (
  workspace: TurnWorkspace,
  receipt: TurnWorkspace['draft']['durableToolReceipts'][number]
): TurnWorkspace => ({
  ...workspace,
  draft: {
    ...workspace.draft,
    durableToolReceipts: [
      ...(workspace.draft.durableToolReceipts ?? []).filter(
        (item) =>
          (item.receiptId ?? `${item.toolCallId}:${item.effectKey ?? 'primary'}`) !==
          (receipt.receiptId ?? `${receipt.toolCallId}:${receipt.effectKey ?? 'primary'}`)
      ),
      clone(receipt)
    ]
  }
})

export const withToolChangeSetSummary = (
  workspace: TurnWorkspace,
  changeSet: ToolChangeSetSummary
): TurnWorkspace => ({
  ...workspace,
  draft: {
    ...workspace.draft,
    changeSet: clone(changeSet)
  }
})

export const withObservationDraft = (
  workspace: TurnWorkspace,
  observation: TurnWorkspace['draft']['observations'][number]
): TurnWorkspace => ({
  ...workspace,
  draft: {
    ...workspace.draft,
    observations: [...workspace.draft.observations, clone(observation)]
  }
})

export const withTurnLifecycleDraft = (
  workspace: TurnWorkspace,
  lifecycle: TurnLifecycleState
): TurnWorkspace => ({
  ...workspace,
  draft: {
    ...workspace.draft,
    lifecycle: clone(lifecycle)
  }
})

export const createFinalResponse = (input: {
  messageId: string
  content: string
}): MainAgentFinalResponse => ({
  messageId: input.messageId,
  content: input.content
})
