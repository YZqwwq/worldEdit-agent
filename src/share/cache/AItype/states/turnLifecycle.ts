export const TURN_INTERNAL_PHASE_VALUES = [
  'forming',
  'observing',
  'revising',
  'ready',
  'expressing',
  'completed',
  'interrupted'
] as const

export type TurnInternalPhase = (typeof TURN_INTERNAL_PHASE_VALUES)[number]

export type AgentLoopDirective = 'deliberate' | 'execute_tools' | 'express'

export type TurnLifecycleState = {
  phase: TurnInternalPhase
  revision: number
  observationBatch?: string
  revisedObservationBatch?: string
  updatedAt: string
}

const TRANSITIONS: Record<TurnInternalPhase, readonly TurnInternalPhase[]> = {
  forming: ['forming', 'observing', 'ready', 'interrupted'],
  observing: ['observing', 'revising', 'interrupted'],
  revising: ['revising', 'observing', 'ready', 'interrupted'],
  ready: ['ready', 'expressing', 'interrupted'],
  expressing: ['expressing', 'completed', 'interrupted'],
  completed: ['completed'],
  interrupted: ['interrupted']
}

export const canAdvanceTurnInternalPhase = (
  from: TurnInternalPhase,
  to: TurnInternalPhase
): boolean => TRANSITIONS[from].includes(to)

export const advanceTurnLifecycle = (
  current: TurnLifecycleState | undefined,
  phase: TurnInternalPhase,
  options?: { observationBatch?: string; revisedObservationBatch?: string }
): TurnLifecycleState => {
  const previous = current ?? {
    phase: 'forming' as const,
    revision: 0,
    updatedAt: new Date().toISOString()
  }
  if (!canAdvanceTurnInternalPhase(previous.phase, phase)) {
    throw new Error(`Invalid turn internal phase transition: ${previous.phase} -> ${phase}`)
  }
  return {
    phase,
    revision: phase === previous.phase ? previous.revision : previous.revision + 1,
    observationBatch: options?.observationBatch ?? previous.observationBatch,
    revisedObservationBatch:
      options?.revisedObservationBatch ?? previous.revisedObservationBatch,
    updatedAt: new Date().toISOString()
  }
}
