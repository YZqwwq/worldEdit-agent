export const MOOD_EVENT_KINDS = [
  'gain',
  'loss',
  'obstacle',
  'threat',
  'novelty',
  'norm_violation',
  'relationship_event',
  'neutral'
] as const

export type MoodEventKind = (typeof MOOD_EVENT_KINDS)[number]

export const MOOD_AGENCIES = ['self', 'user', 'other', 'environment', 'mixed', 'unknown'] as const
export type MoodAgency = (typeof MOOD_AGENCIES)[number]

export const MOOD_CONTROL_SIGNALS = ['unknown', 'strengthened', 'unchanged', 'weakened'] as const
export type MoodControlSignal = (typeof MOOD_CONTROL_SIGNALS)[number]

export type SignedAppraisalLevel = -2 | -1 | 0 | 1 | 2
export type AppraisalLevel = 0 | 1 | 2 | 3

export interface MoodEventAppraisal {
  eventKind: MoodEventKind
  valence: SignedAppraisalLevel
  salience: AppraisalLevel
  novelty: AppraisalLevel
  futureProspect: SignedAppraisalLevel
  agency: MoodAgency
  normImpact: SignedAppraisalLevel
  relationshipImpact: SignedAppraisalLevel
  controlSignal: MoodControlSignal
  confidence: AppraisalLevel
}

export interface ShortTermEmotionState {
  joy: number
  interest: number
  surprise: number
  fear: number
  anger: number
  frustration: number
  sadness: number
  disgust: number
  hurt: number
}

export interface SlowMoodState {
  positiveTone: number
  tension: number
  stress: number
  helplessness: number
  boredom: number
}

export interface RelationshipEmotionState {
  trust: number
  affinity: number
  respect: number
  attachment: number
  resentment: number
}

export type MoodLabel =
  | 'calm'
  | keyof ShortTermEmotionState
  | 'tension'
  | 'stress'
  | 'helplessness'
  | 'boredom'

export interface MoodExpressionDelta {
  verbosity: number
  formality: number
}

export interface MoodExpressionModulation {
  relationalCloseness: number
  warmth: number
  contraction: number
  imaginativeOpenness: number
  contextFirstTendency: number
}

export interface MoodCoreState {
  shortTerm: ShortTermEmotionState
  slowMood: SlowMoodState
  relationship: RelationshipEmotionState
}

export interface MoodAssessment extends MoodCoreState {
  version: 2
  generatedAt: string
  appraisal: MoodEventAppraisal
  primaryEmotion: MoodLabel
  secondaryEmotion?: MoodLabel
  intensity: number
  narrative: string
  expressionDelta: MoodExpressionDelta
  expressionModulation: MoodExpressionModulation
}
