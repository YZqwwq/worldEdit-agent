import type { InteractionObservationType } from './interactionObservation'
import type { UserMoodState } from './memorySlots'

export type PersonaSignalCategory = 'autonomy' | 'verbosity' | 'risk' | 'formality'

export interface PersonaSignalRuleConfig {
  category: PersonaSignalCategory
  userSignal: string
  delta: number
  phrases: string[]
}

export interface PersonaMoodRuleConfig {
  mood: UserMoodState
  phrases: string[]
  confidence: number
  valence: number
}

export interface PersonaDecayConfig {
  sessionFactor: number
  transientFactor: number
}

export interface PersonaLayerWeightConfig {
  session: number
  transient: number
}

export interface PersonaLearningRateConfig {
  stableFromSignal: number
  sessionFromSignal: number
  transientFromInterrupt: number
  transientFromRevert: number
}

export interface MemorySlotConfig {
  userMoodRetentionObservations: number
  currentFocusLimit: number
  recentReferenceLimit: number
  preferencePromotionThreshold: number
}

export interface PersonaMemoryFeedbackConfig {
  preferenceStrength: number
  moodStrength: number
}

export interface PersonaTaskObservationEffectConfig {
  type: InteractionObservationType
  session?: Partial<Record<PersonaSignalCategory, number>>
  transient?: Partial<Record<PersonaSignalCategory, number>>
}

export interface PersonaConfig {
  decay: PersonaDecayConfig
  layerWeights: PersonaLayerWeightConfig
  learningRates: PersonaLearningRateConfig
  memoryFeedback: PersonaMemoryFeedbackConfig
  slot: MemorySlotConfig
  signalRules: PersonaSignalRuleConfig[]
  moodRules: PersonaMoodRuleConfig[]
  taskObservationEffects: PersonaTaskObservationEffectConfig[]
}
