import type { PersonaMetrics } from './personalState'

export interface PersonaSamplingPolicy {
  temperatureOffset: number
}

export interface PersonaToolPolicy {
  confirmBeforeSensitiveTools: boolean
  allowRiskyTools: boolean
}

export interface PersonaActionPolicy {
  autonomyDrive: number
  caution: number
  clarificationNeed: number
  evidenceNeed: number
  recallNeed: number
  writeConservatism: number
  toolPersistence: number
}

export interface PersonaScenePolicy {
  id: string
  label: string
  cognitiveDirections: string[]
  actionDirections: string[]
  actionBias: Partial<PersonaActionPolicy>
}

export interface PersonaPolicyMetrics {
  base: PersonaMetrics
  scene: PersonaMetrics
  effective: PersonaMetrics
}

export interface PersonaPolicy {
  generatedAt: string
  metrics: PersonaPolicyMetrics
  sampling: PersonaSamplingPolicy
  tool: PersonaToolPolicy
  action: PersonaActionPolicy
  scene?: PersonaScenePolicy
  signals: string[]
}
