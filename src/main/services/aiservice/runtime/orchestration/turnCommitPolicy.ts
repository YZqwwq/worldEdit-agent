import type {
  MainAgentEventConsumer,
  MainAgentCommitTurnEffect
} from '@share/cache/AItype/states/taskLifecycleState'

export type TurnWorkspaceCommitPolicy = {
  commitMemorySlots: boolean
  commitPersona: boolean
}

export const resolveTurnWorkspaceCommitPolicy = (
  status: MainAgentCommitTurnEffect['status'],
  consumer: MainAgentEventConsumer
): TurnWorkspaceCommitPolicy => {
  if (status !== 'completed') {
    return {
      commitMemorySlots: false,
      commitPersona: false
    }
  }

  if (consumer === 'background_persona_stage_consumer') {
    return {
      commitMemorySlots: false,
      commitPersona: true
    }
  }

  return {
    commitMemorySlots: true,
    commitPersona: true
  }
}
