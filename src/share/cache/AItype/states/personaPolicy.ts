import type { PersonaMetrics } from './personalState'

export interface PersonaSamplingPolicy {
  temperature: number
  topP: number
  maxTokens: number
}

export interface PersonaToolPolicy {
  confirmBeforeSensitiveTools: boolean
  allowRiskyTools: boolean
}

export interface PersonaMemoryPolicy {
  archiveThreshold: number
  shortTermLimit: number
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

export interface PersonaPolicyMetrics {
  base: PersonaMetrics
  effective: PersonaMetrics
}

export interface PersonaPolicy {
  generatedAt: string
  metrics: PersonaPolicyMetrics
  sampling: PersonaSamplingPolicy
  tool: PersonaToolPolicy
  action: PersonaActionPolicy
  memory: PersonaMemoryPolicy
  signals: string[]
}
