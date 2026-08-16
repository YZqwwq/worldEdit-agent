import type {
  MoodExpressionDelta,
  MoodExpressionModulation,
  MoodLabel,
  RelationshipEmotionState,
  ShortTermEmotionState,
  SlowMoodState
} from './moodAssessment'

export interface MoodRange {
  min: number
  max: number
}

export interface CharacterMoodBaseline {
  preferredPrimary: 'calm'
  presence: 'contained_stable'
  shortTerm: ShortTermEmotionState
  slowMood: SlowMoodState
  relationship: RelationshipEmotionState
}

export interface CharacterMoodBoundary {
  baseline: CharacterMoodBaseline
  shortTermBounds: { [K in keyof ShortTermEmotionState]: MoodRange }
  slowMoodBounds: { [K in keyof SlowMoodState]: MoodRange }
  relationshipBounds: { [K in keyof RelationshipEmotionState]: MoodRange }
  expressionModulationBounds: { [K in keyof MoodExpressionModulation]: MoodRange }
  expressionDeltaBounds: { [K in keyof MoodExpressionDelta]: MoodRange }
  suppressedLabels: MoodLabel[]
  hardRules: string[]
}
