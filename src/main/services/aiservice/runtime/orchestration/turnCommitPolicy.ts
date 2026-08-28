import type {
  MainAgentEventConsumer,
  MainAgentCommitTurnEffect
} from '@share/cache/AItype/states/taskLifecycleState'

export type TurnWorkspaceCommitPolicy = {
  commitMemorySlots: boolean
  commitPersona: boolean
  commitLifeState: boolean
}

export const resolveTurnWorkspaceCommitPolicy = (
  status: MainAgentCommitTurnEffect['status'],
  consumer: MainAgentEventConsumer
): TurnWorkspaceCommitPolicy => {
  if (status === 'failed') {
    return {
      commitMemorySlots: false,
      commitPersona: false,
      commitLifeState: false
    }
  }

  if (consumer === 'background_persona_stage_consumer') {
    return {
      commitMemorySlots: false,
      commitPersona: true,
      commitLifeState: true
    }
  }

  return {
    commitMemorySlots: true,
    commitPersona: true,
    commitLifeState: true
  }
}
