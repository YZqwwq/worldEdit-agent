import type { MemorySlotSnapshot } from '@share/cache/AItype/states/memorySlots'
import type { PersonaState } from '@share/cache/AItype/states/personalState'
import type {
  MainAgentFinalResponse,
  TurnWorkspace
} from '@share/cache/AItype/states/turnWorkspace'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export const createTurnWorkspace = (input: {
  eventId: string
  turnId: number
  sessionId: string
  runId: string
  memorySlots: MemorySlotSnapshot
  persona: PersonaState | null
}): TurnWorkspace => ({
  eventId: input.eventId,
  turnId: input.turnId,
  sessionId: input.sessionId,
  runId: input.runId,
  base: {
    memorySlots: clone(input.memorySlots),
    persona: input.persona ? clone(input.persona) : null
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
        (item) => item.toolCallId !== receipt.toolCallId
      ),
      clone(receipt)
    ]
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

export const createFinalResponse = (input: {
  messageId: string
  content: string
}): MainAgentFinalResponse => ({
  messageId: input.messageId,
  content: input.content
})
