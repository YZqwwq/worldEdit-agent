import type { MoodModulationProfile, MoodParameterDelta, StageMood } from './moodAssessment'

export interface CharacterMoodRange {
  min: number
  max: number
}

export interface CharacterMoodBaseline {
  restingStageMood: 'flat'
  preferredPositiveBand: 'pleased'
  defaultPresence: 'restrained_stable'
}

export interface CharacterMoodBoundary {
  baseline: CharacterMoodBaseline
  stageCaps: Record<StageMood, CharacterMoodRange>
  modulationBounds: {
    [K in keyof MoodModulationProfile]: CharacterMoodRange
  }
  deltaBounds: {
    [K in keyof MoodParameterDelta]: CharacterMoodRange
  }
  hardRules: string[]
}
