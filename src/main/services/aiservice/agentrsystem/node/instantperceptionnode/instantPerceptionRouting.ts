import type { MainAgentBackgroundPersonaStagePayload } from '@share/cache/AItype/states/taskLifecycleState'

export const shouldBypassInteractivePerception = (
  backgroundPersonaStage: MainAgentBackgroundPersonaStagePayload | undefined
): boolean => backgroundPersonaStage !== undefined
