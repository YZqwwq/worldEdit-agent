import type {
  MainAgentBackgroundPersonaStagePayload,
  MainAgentTaskEvent
} from './taskLifecycleState'

type TurnInputBase = {
  content: string
  occurredAt: string
}

export type TurnInput =
  | (TurnInputBase & { kind: 'user_message'; source: 'user' })
  | (TurnInputBase & {
      kind: 'task_notification'
      source: 'subagent'
      taskEvent: MainAgentTaskEvent
    })
  | (TurnInputBase & {
      kind: 'background_persona_stage'
      source: 'system'
      backgroundStage: MainAgentBackgroundPersonaStagePayload
    })
