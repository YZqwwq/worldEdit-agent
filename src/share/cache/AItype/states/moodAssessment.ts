export type StageMood = 'flat' | 'pleased' | 'excited' | 'tense' | 'frustrated' | 'fearful'
export type MoodHorizon = 'transient' | 'session'

export interface MoodParameterDelta {
  autonomy: number
  verbosity: number
  risk: number
  formality: number
}

export interface MoodModulationProfile {
  relationalCloseness: number
  expressiveWarmth: number
  containment: number
  imaginativeOpenness: number
  clarificationNeed: number
}

export interface MoodAssessmentSources {
  userMood?: string
  conversationMode?: string
  interactionState?: string
  signals: string[]
}

export interface MoodAssessment {
  generatedAt: string
  stageMood: StageMood
  intensity: number
  confidence: number
  valence: number
  arousal: number
  horizon: MoodHorizon
  behavioralNarrative: string
  delta: MoodParameterDelta
  modulation: MoodModulationProfile
  sources: MoodAssessmentSources
}
