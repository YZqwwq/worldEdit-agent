import type { PersonaMetrics } from './personalState'

export interface PersonaSamplingPolicy {
  temperatureOffset: number
}

export interface PersonaDescriptiveContext {
  internalState: string
  attention: string
  relationship: string
  expression: string
}

export type CognitiveClarificationPolicy = 'proceed_when_clear' | 'clarify_material_ambiguity'
export type CognitiveEvidencePolicy = 'use_available_context' | 'verify_before_concluding'
export type CognitiveRecallPolicy = 'recall_on_demand' | 'recall_when_relevant'
export type CognitivePersistencePolicy = 'stop_and_report_gap' | 'try_one_alternative'
export type CognitiveWritingPolicy = 'normal' | 'verify_scope_and_result'

// 本轮认知选择的语义倾向。它不是权限，也不是人格数值。
export interface PersonaCognitivePolicy {
  clarification: CognitiveClarificationPolicy
  evidence: CognitiveEvidencePolicy
  recall: CognitiveRecallPolicy
  persistence: CognitivePersistencePolicy
  writing: CognitiveWritingPolicy
}

export interface PersonaSceneWorkMode {
  id: string
  label: string
  whenToUse: string
  directions: string[]
}

export interface PersonaScenePolicy {
  id: string
  label: string
  cognitiveDirections: string[]
  workModes?: PersonaSceneWorkMode[]
}

export interface PersonaPolicyMetrics {
  base: PersonaMetrics
  effective: PersonaMetrics
}

export interface PersonaPolicy {
  generatedAt: string
  metrics: PersonaPolicyMetrics
  sampling: PersonaSamplingPolicy
  cognition: PersonaCognitivePolicy
  scene?: PersonaScenePolicy
  signals: string[]
  descriptiveContext: PersonaDescriptiveContext
}
