import type { PersonaMetrics } from './personalState'

export interface PersonaSamplingPolicy {
  temperatureOffset: number
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

export interface PersonaSceneWorkMode {
  id: string
  label: string
  whenToUse: string
  directions: string[]
}

export interface PersonaSceneExpressionBias {
  longFormDelivery: 'default' | 'prefer_independent_content'
}

export interface PersonaScenePolicy {
  id: string
  label: string
  cognitiveDirections: string[]
  workModes?: PersonaSceneWorkMode[]
  expressionBias?: PersonaSceneExpressionBias
  actionBias: Partial<PersonaActionPolicy>
}

export interface PersonaPolicyMetrics {
  base: PersonaMetrics
  effective: PersonaMetrics
}

export interface PersonaPolicy {
  generatedAt: string
  metrics: PersonaPolicyMetrics
  sampling: PersonaSamplingPolicy
  action: PersonaActionPolicy
  scene?: PersonaScenePolicy
  signals: string[]
}
