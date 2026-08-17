import type { CharacterMoodBoundary, MoodRange } from '@share/cache/AItype/states/characterMoodBoundary'
import type {
  MoodAssessment,
  MoodCoreState,
  MoodExpressionDelta,
  MoodExpressionModulation,
  MoodLabel,
  RelationshipEmotionState,
  ShortTermEmotionState,
  SlowMoodState
} from '@share/cache/AItype/states/moodAssessment'
import { clamp, roundTo, roundUnit } from './personaMath'

export const DEFAULT_SHORT_TERM: ShortTermEmotionState = {
  joy: 0.12,
  interest: 0.22,
  surprise: 0.05,
  fear: 0.08,
  anger: 0.04,
  frustration: 0.1,
  sadness: 0.06,
  disgust: 0.03,
  hurt: 0.05
}

export const DEFAULT_SLOW_MOOD: SlowMoodState = {
  positiveTone: 0.55,
  tension: 0.18,
  stress: 0.16,
  helplessness: 0.08,
  boredom: 0.12
}

export const DEFAULT_RELATIONSHIP: RelationshipEmotionState = {
  trust: 0.58,
  affinity: 0.52,
  respect: 0.65,
  attachment: 0.4,
  resentment: 0.05
}

export const FAMILA_CHARACTER_MOOD_BOUNDARY: CharacterMoodBoundary = {
  baseline: {
    preferredPrimary: 'calm',
    presence: 'contained_stable',
    shortTerm: DEFAULT_SHORT_TERM,
    slowMood: DEFAULT_SLOW_MOOD,
    relationship: DEFAULT_RELATIONSHIP
  },
  shortTermBounds: {
    joy: { min: 0.03, max: 0.82 },
    interest: { min: 0.08, max: 0.86 },
    surprise: { min: 0.01, max: 0.72 },
    fear: { min: 0.02, max: 0.68 },
    anger: { min: 0.01, max: 0.48 },
    frustration: { min: 0.03, max: 0.72 },
    sadness: { min: 0.02, max: 0.62 },
    disgust: { min: 0.01, max: 0.5 },
    hurt: { min: 0.02, max: 0.64 }
  },
  slowMoodBounds: {
    positiveTone: { min: 0.2, max: 0.82 },
    tension: { min: 0.05, max: 0.7 },
    stress: { min: 0.04, max: 0.72 },
    helplessness: { min: 0.02, max: 0.58 },
    boredom: { min: 0.03, max: 0.66 }
  },
  relationshipBounds: {
    trust: { min: 0.25, max: 0.82 },
    affinity: { min: 0.32, max: 0.76 },
    respect: { min: 0.38, max: 0.86 },
    attachment: { min: 0.2, max: 0.7 },
    resentment: { min: 0.01, max: 0.48 }
  },
  expressionModulationBounds: {
    relationalCloseness: { min: 0.42, max: 0.74 },
    warmth: { min: 0.4, max: 0.72 },
    contraction: { min: 0.58, max: 0.92 },
    imaginativeOpenness: { min: 0.3, max: 0.72 },
    contextFirstTendency: { min: 0.2, max: 0.82 }
  },
  expressionDeltaBounds: {
    verbosity: { min: -0.1, max: 0.12 },
    formality: { min: -0.06, max: 0.1 }
  },
  suppressedLabels: ['anger'],
  hardRules: [
    '不投射攻击性',
    '不滑向戏剧化表演',
    '不因为短时靠近而失去边界',
    '在压力下仍保持平静收束',
    '负向情绪可以收短但不能变刺',
    '正向情绪可以变松但不能失稳'
  ]
}

const clampWithRange = (value: number, range: MoodRange): number =>
  roundTo(clamp(value, range.min, range.max))

const downgradeSuppressedLabel = (label: MoodLabel): MoodLabel =>
  label === 'anger' ? 'frustration' : label

export const projectMoodLabels = (
  shortTerm: ShortTermEmotionState,
  slowMood: SlowMoodState,
  boundary?: CharacterMoodBoundary
): Pick<MoodAssessment, 'primaryEmotion' | 'secondaryEmotion'> => {
  const candidates: Array<[MoodLabel, number]> = [
    ['joy', shortTerm.joy + Math.max(0, slowMood.positiveTone - 0.5) * 0.35],
    ['interest', shortTerm.interest],
    ['surprise', shortTerm.surprise],
    ['fear', shortTerm.fear],
    ['anger', shortTerm.anger],
    ['frustration', shortTerm.frustration],
    ['sadness', shortTerm.sadness],
    ['disgust', shortTerm.disgust],
    ['hurt', shortTerm.hurt],
    ['tension', slowMood.tension],
    ['stress', slowMood.stress],
    ['helplessness', slowMood.helplessness],
    ['boredom', slowMood.boredom]
  ]
  candidates.sort((left, right) => right[1] - left[1])

  const [firstLabel, firstScore] = candidates[0]
  if (firstScore < 0.34) return { primaryEmotion: 'calm' }

  const primaryEmotion = boundary?.suppressedLabels.includes(firstLabel)
    ? downgradeSuppressedLabel(firstLabel)
    : firstLabel
  const second = candidates.find(([label, score]) => {
    const projected = boundary?.suppressedLabels.includes(label)
      ? downgradeSuppressedLabel(label)
      : label
    return projected !== primaryEmotion && score >= 0.3 && firstScore - score <= 0.18
  })

  return {
    primaryEmotion,
    secondaryEmotion: second
      ? boundary?.suppressedLabels.includes(second[0])
        ? downgradeSuppressedLabel(second[0])
        : second[0]
      : undefined
  }
}

export const constrainMoodCoreState = (
  state: MoodCoreState,
  boundary: CharacterMoodBoundary
): MoodCoreState => {
  const shortTerm = { ...state.shortTerm }
  const slowMood = { ...state.slowMood }
  const relationship = { ...state.relationship }

  for (const key of Object.keys(shortTerm) as Array<keyof ShortTermEmotionState>) {
    shortTerm[key] = clampWithRange(shortTerm[key], boundary.shortTermBounds[key])
  }
  for (const key of Object.keys(slowMood) as Array<keyof SlowMoodState>) {
    slowMood[key] = clampWithRange(slowMood[key], boundary.slowMoodBounds[key])
  }
  for (const key of Object.keys(relationship) as Array<keyof RelationshipEmotionState>) {
    relationship[key] = clampWithRange(relationship[key], boundary.relationshipBounds[key])
  }

  return { shortTerm, slowMood, relationship }
}

export const constrainMoodExpressionDelta = (
  delta: MoodExpressionDelta,
  boundary: CharacterMoodBoundary
): MoodExpressionDelta => ({
    verbosity: clampWithRange(
      delta.verbosity,
      boundary.expressionDeltaBounds.verbosity
    ),
    formality: clampWithRange(
      delta.formality,
      boundary.expressionDeltaBounds.formality
    )
  })

export const constrainMoodExpressionModulation = (
  modulation: MoodExpressionModulation,
  boundary: CharacterMoodBoundary
): MoodExpressionModulation => ({
    relationalCloseness: clampWithRange(
      modulation.relationalCloseness,
      boundary.expressionModulationBounds.relationalCloseness
    ),
    warmth: clampWithRange(
      modulation.warmth,
      boundary.expressionModulationBounds.warmth
    ),
    contraction: clampWithRange(
      modulation.contraction,
      boundary.expressionModulationBounds.contraction
    ),
    imaginativeOpenness: clampWithRange(
      modulation.imaginativeOpenness,
      boundary.expressionModulationBounds.imaginativeOpenness
    ),
    contextFirstTendency: clampWithRange(
      modulation.contextFirstTendency,
      boundary.expressionModulationBounds.contextFirstTendency
    )
  })

export const normalizeMoodLevel = roundUnit
