import type {
  MoodCoreState,
  MoodAssessment,
  MoodEventAppraisal,
  MoodExpressionDelta,
  MoodExpressionModulation,
  MoodLabel,
  RelationshipEmotionState,
  ShortTermEmotionState,
  SlowMoodState
} from '@share/cache/AItype/states/moodAssessment'
import type { CharacterMoodBoundary } from '@share/cache/AItype/states/characterMoodBoundary'
import { clamp, roundSigned, roundUnit } from './personaMath'
import {
  DEFAULT_RELATIONSHIP,
  DEFAULT_SHORT_TERM,
  DEFAULT_SLOW_MOOD,
  constrainMoodCoreState,
  constrainMoodExpressionDelta,
  constrainMoodExpressionModulation,
  projectMoodLabels
} from './moodDynamicsBoundary'

export const NEUTRAL_MOOD_APPRAISAL: MoodEventAppraisal = {
  userState: {
    mood: 'calm',
    valence: 0,
    confidence: 0
  },
  eventKind: 'neutral',
  valence: 0,
  salience: 0,
  novelty: 0,
  futureProspect: 0,
  agency: 'unknown',
  normImpact: 0,
  relationshipImpact: 0,
  controlSignal: 'unknown',
  confidence: 0
}

interface CompileMoodAssessmentInput {
  appraisal: MoodEventAppraisal
  previousMood?: MoodAssessment | null | undefined
  nowIso: string
  boundary: CharacterMoodBoundary
}

type MoodDerivedProjection = Omit<
  MoodAssessment,
  'version' | 'generatedAt' | 'appraisal' | keyof MoodCoreState
>

const hoursBetween = (from: string | undefined, to: string): number => {
  if (!from) return 0
  const delta = Date.parse(to) - Date.parse(from)
  return Number.isFinite(delta) && delta > 0 ? delta / 3_600_000 : 0
}

const retention = (perTurn: number, elapsedHours: number, timeConstantHours: number): number =>
  clamp(perTurn * Math.exp(-elapsedHours / timeConstantHours), 0, 1)

const relax = (baseline: number, previous: number, ratio: number): number =>
  roundUnit(baseline + (previous - baseline) * ratio)

const blend = (from: number, to: number, ratio: number): number =>
  roundUnit(from + (to - from) * clamp(ratio, 0, 1))

const normalizeSigned = (value: number): number => clamp(value / 2, -1, 1)
const normalizeLevel = (value: number): number => clamp(value / 3, 0, 1)

const controlLevel = (appraisal: MoodEventAppraisal): number => {
  switch (appraisal.controlSignal) {
    case 'strengthened':
      return 0.9
    case 'unchanged':
      return 0.62
    case 'weakened':
      return 0.16
    default:
      return 0.5
  }
}

const activate = (baseline: number, amount: number): number =>
  roundUnit(baseline + clamp(amount, 0, 1) * (1 - baseline))

const buildShortTermTarget = (
  appraisal: MoodEventAppraisal,
  relationship: RelationshipEmotionState
): ShortTermEmotionState => {
  const positive = Math.max(0, normalizeSigned(appraisal.valence))
  const negative = Math.max(0, -normalizeSigned(appraisal.valence))
  const salience = normalizeLevel(appraisal.salience)
  const novelty = normalizeLevel(appraisal.novelty)
  const positiveFuture = Math.max(0, normalizeSigned(appraisal.futureProspect))
  const negativeFuture = Math.max(0, -normalizeSigned(appraisal.futureProspect))
  const normViolation = Math.max(0, -normalizeSigned(appraisal.normImpact))
  const relationshipLoss = Math.max(0, -normalizeSigned(appraisal.relationshipImpact))
  const hasExternalAgency = appraisal.agency === 'user' || appraisal.agency === 'other'
  const control = controlLevel(appraisal)
  const threat = appraisal.eventKind === 'threat' ? Math.max(0.45, negative) : negative * 0.35
  const obstacle = appraisal.eventKind === 'obstacle' ? 1 : 0
  const loss = appraisal.eventKind === 'loss' ? 1 : 0

  return {
    joy: activate(
      DEFAULT_SHORT_TERM.joy,
      positive * salience * (0.65 + positiveFuture * 0.35)
    ),
    interest: activate(
      DEFAULT_SHORT_TERM.interest,
      novelty * salience * (1 - threat * 0.45)
    ),
    surprise: activate(
      DEFAULT_SHORT_TERM.surprise,
      novelty * (0.45 + salience * 0.55)
    ),
    fear: activate(
      DEFAULT_SHORT_TERM.fear,
      threat * salience * (0.35 + (1 - control) * 0.65)
    ),
    anger: activate(
      DEFAULT_SHORT_TERM.anger,
      negative * salience * (hasExternalAgency ? 1 : 0.25) * (0.25 + control * 0.75)
    ),
    frustration: activate(
      DEFAULT_SHORT_TERM.frustration,
      negative * salience * (0.25 + obstacle * 0.75)
    ),
    sadness: activate(
      DEFAULT_SHORT_TERM.sadness,
      negative * salience * (0.25 + loss * 0.5 + negativeFuture * 0.25) * (1.1 - control * 0.4)
    ),
    disgust: activate(
      DEFAULT_SHORT_TERM.disgust,
      normViolation * salience * (appraisal.eventKind === 'norm_violation' ? 1 : 0.55)
    ),
    hurt: activate(
      DEFAULT_SHORT_TERM.hurt,
      relationshipLoss * salience * (0.45 + relationship.attachment * 0.3 + relationship.trust * 0.25)
    )
  }
}

const updateShortTerm = (
  appraisal: MoodEventAppraisal,
  previous: MoodAssessment | null | undefined,
  nowIso: string
): ShortTermEmotionState => {
  const elapsedHours = hoursBetween(previous?.generatedAt, nowIso)
  const continuity = {} as ShortTermEmotionState
  const previousState = previous?.shortTerm ?? DEFAULT_SHORT_TERM
  const keep = retention(0.7, elapsedHours, 8)
  for (const key of Object.keys(DEFAULT_SHORT_TERM) as Array<keyof ShortTermEmotionState>) {
    continuity[key] = relax(DEFAULT_SHORT_TERM[key], previousState[key], keep)
  }

  const target = buildShortTermTarget(appraisal, previous?.relationship ?? DEFAULT_RELATIONSHIP)
  const confidence = normalizeLevel(appraisal.confidence)
  const salience = normalizeLevel(appraisal.salience)
  const influence = confidence * (0.18 + salience * 0.52)
  const next = {} as ShortTermEmotionState
  for (const key of Object.keys(DEFAULT_SHORT_TERM) as Array<keyof ShortTermEmotionState>) {
    next[key] = blend(continuity[key], target[key], influence)
  }
  return next
}

const updateSlowMood = (
  appraisal: MoodEventAppraisal,
  shortTerm: ShortTermEmotionState,
  previous: MoodAssessment | null | undefined,
  nowIso: string
): SlowMoodState => {
  const elapsedHours = hoursBetween(previous?.generatedAt, nowIso)
  const previousState = previous?.slowMood ?? DEFAULT_SLOW_MOOD
  const keep = retention(0.94, elapsedHours, 120)
  const continuity = {} as SlowMoodState
  for (const key of Object.keys(DEFAULT_SLOW_MOOD) as Array<keyof SlowMoodState>) {
    continuity[key] = relax(DEFAULT_SLOW_MOOD[key], previousState[key], keep)
  }

  const salience = normalizeLevel(appraisal.salience)
  const control = controlLevel(appraisal)
  const negativeFuture = Math.max(0, -normalizeSigned(appraisal.futureProspect))
  const target: SlowMoodState =
    appraisal.eventKind === 'neutral'
      ? { ...DEFAULT_SLOW_MOOD }
      : {
          positiveTone: roundUnit(
            clamp(
              0.48 + shortTerm.joy * 0.42 - shortTerm.sadness * 0.26 - shortTerm.hurt * 0.12,
              0,
              1
            )
          ),
          tension: roundUnit(
            clamp(
              shortTerm.fear * 0.58 +
                shortTerm.surprise * 0.18 +
                shortTerm.frustration * 0.24,
              0,
              1
            )
          ),
          stress: roundUnit(
            clamp(
              shortTerm.frustration * 0.46 +
                shortTerm.fear * 0.3 +
                shortTerm.hurt * 0.14 +
                salience * 0.1,
              0,
              1
            )
          ),
          helplessness: roundUnit(
            clamp(
              (shortTerm.frustration * 0.4 +
                shortTerm.sadness * 0.36 +
                negativeFuture * 0.24) *
                (1 - control * 0.62),
              0,
              1
            )
          ),
          // 厌倦需要独立的重复/低投入证据，不能由普通 neutral 自动制造。
          boredom: DEFAULT_SLOW_MOOD.boredom
        }

  const influence = normalizeLevel(appraisal.confidence) * (0.06 + salience * 0.18)
  const next = {} as SlowMoodState
  for (const key of Object.keys(DEFAULT_SLOW_MOOD) as Array<keyof SlowMoodState>) {
    next[key] = blend(continuity[key], target[key], influence)
  }
  return next
}

const updateRelationship = (
  appraisal: MoodEventAppraisal,
  shortTerm: ShortTermEmotionState,
  previous: MoodAssessment | null | undefined,
  nowIso: string
): RelationshipEmotionState => {
  const elapsedHours = hoursBetween(previous?.generatedAt, nowIso)
  const previousState = previous?.relationship ?? DEFAULT_RELATIONSHIP
  const keep = retention(0.995, elapsedHours, 24 * 365)
  const next = {} as RelationshipEmotionState
  for (const key of Object.keys(DEFAULT_RELATIONSHIP) as Array<keyof RelationshipEmotionState>) {
    next[key] = relax(DEFAULT_RELATIONSHIP[key], previousState[key], keep)
  }

  const impact = normalizeSigned(appraisal.relationshipImpact)
  const norm = normalizeSigned(appraisal.normImpact)
  const confidence = normalizeLevel(appraisal.confidence)
  const salience = normalizeLevel(appraisal.salience)
  const weight = confidence * salience
  const negativeWeight = impact < 0 ? 1.35 : 1

  next.trust = roundUnit(next.trust + impact * 0.045 * weight * negativeWeight)
  next.affinity = roundUnit(next.affinity + impact * 0.05 * weight)
  next.respect = roundUnit(next.respect + (impact * 0.025 + norm * 0.035) * weight)
  next.attachment = roundUnit(next.attachment + Math.max(0, impact) * 0.018 * weight)
  next.resentment = roundUnit(
    next.resentment + (shortTerm.hurt * 0.04 + shortTerm.anger * 0.025) * Math.max(0, -impact) * weight - Math.max(0, impact) * 0.025 * weight
  )
  return next
}

const deriveIntensity = (
  shortTerm: ShortTermEmotionState,
  slowMood: SlowMoodState
): number => {
  const deltas = [
    ...(Object.keys(DEFAULT_SHORT_TERM) as Array<keyof ShortTermEmotionState>).map(
      (key) => shortTerm[key] - DEFAULT_SHORT_TERM[key]
    ),
    ...(Object.keys(DEFAULT_SLOW_MOOD) as Array<keyof SlowMoodState>).map(
      (key) => slowMood[key] - DEFAULT_SLOW_MOOD[key]
    )
  ]
  const rms = Math.sqrt(deltas.reduce((sum, delta) => sum + delta * delta, 0) / deltas.length)
  return roundUnit(rms * 2)
}

const deriveExpressionDelta = (
  shortTerm: ShortTermEmotionState,
  slowMood: SlowMoodState
): MoodExpressionDelta => ({
  verbosity: roundSigned(
    clamp(
      (shortTerm.joy - DEFAULT_SHORT_TERM.joy) * 0.06 +
        (shortTerm.interest - DEFAULT_SHORT_TERM.interest) * 0.08 -
        (shortTerm.frustration - DEFAULT_SHORT_TERM.frustration) * 0.1 -
        (slowMood.stress - DEFAULT_SLOW_MOOD.stress) * 0.08,
      -0.18,
      0.18
    )
  ),
  formality: roundSigned(
    clamp(
      (slowMood.tension - DEFAULT_SLOW_MOOD.tension) * 0.08 +
        (shortTerm.frustration - DEFAULT_SHORT_TERM.frustration) * 0.05 -
        (shortTerm.joy - DEFAULT_SHORT_TERM.joy) * 0.035,
      -0.18,
      0.18
    )
  )
})

const deriveExpressionModulation = (
  shortTerm: ShortTermEmotionState,
  slowMood: SlowMoodState,
  relationship: RelationshipEmotionState
): MoodExpressionModulation => ({
  relationalCloseness: roundUnit(
    0.42 + relationship.affinity * 0.24 + relationship.trust * 0.08 - shortTerm.hurt * 0.12 - relationship.resentment * 0.1
  ),
  warmth: roundUnit(
    0.4 + slowMood.positiveTone * 0.18 + relationship.affinity * 0.12 - shortTerm.frustration * 0.12 - shortTerm.disgust * 0.08
  ),
  contraction: roundUnit(
    0.56 + slowMood.tension * 0.18 + slowMood.stress * 0.16 + shortTerm.frustration * 0.12 - shortTerm.joy * 0.08
  ),
  imaginativeOpenness: roundUnit(
    0.34 + shortTerm.interest * 0.28 + shortTerm.joy * 0.14 - slowMood.tension * 0.16 - slowMood.stress * 0.14
  ),
  contextFirstTendency: roundUnit(
    0.28 + slowMood.tension * 0.22 + shortTerm.frustration * 0.16 + shortTerm.surprise * 0.1
  )
})

const MOOD_DESCRIPTIONS: Record<MoodLabel, string> = {
  calm: '状态平稳，保持自然、克制而可信的在场方式。',
  joy: '当前有轻度正向打开，更愿意温和地承接和推进。',
  interest: '当前探索兴趣较强，注意力自然靠近话题本身。',
  surprise: '当前出现意外感，需要先吸收变化再继续判断。',
  fear: '当前感受到威胁或不确定，倾向更谨慎地确认边界。',
  anger: '当前边界维护倾向上升，但表达仍需克制而不攻击。',
  frustration: '当前有受阻感，倾向收束表达并减少无效重复。',
  sadness: '当前有损失和低落感，表达会更安静、克制。',
  disgust: '当前排斥感上升，倾向保持清楚距离与判断边界。',
  hurt: '当前关系性受伤感上升，需要保留温度同时维护边界。',
  tension: '当前持续紧张，倾向提高检查和澄清需求。',
  stress: '当前交流压力较高，倾向优先处理核心问题。',
  helplessness: '当前掌控感偏低，倾向承认不确定并寻找替代方向。',
  boredom: '当前投入感较低，表达保持简洁，不额外制造热度。'
}

const deriveMoodProjection = (
  state: MoodCoreState,
  boundary: CharacterMoodBoundary
): MoodDerivedProjection => {
  const labels = projectMoodLabels(state.shortTerm, state.slowMood, boundary)
  return {
    ...labels,
    intensity: deriveIntensity(state.shortTerm, state.slowMood),
    narrative: MOOD_DESCRIPTIONS[labels.primaryEmotion],
    expressionDelta: constrainMoodExpressionDelta(
      deriveExpressionDelta(state.shortTerm, state.slowMood),
      boundary
    ),
    expressionModulation: constrainMoodExpressionModulation(
      deriveExpressionModulation(state.shortTerm, state.slowMood, state.relationship),
      boundary
    )
  }
}

export const compileMoodAssessment = (input: CompileMoodAssessmentInput): MoodAssessment => {
  const rawShortTerm = updateShortTerm(input.appraisal, input.previousMood, input.nowIso)
  const rawSlowMood = updateSlowMood(input.appraisal, rawShortTerm, input.previousMood, input.nowIso)
  const rawRelationship = updateRelationship(
    input.appraisal,
    rawShortTerm,
    input.previousMood,
    input.nowIso
  )
  const state = constrainMoodCoreState(
    {
      shortTerm: rawShortTerm,
      slowMood: rawSlowMood,
      relationship: rawRelationship
    },
    input.boundary
  )

  return {
    version: 2,
    generatedAt: input.nowIso,
    appraisal: input.appraisal,
    ...state,
    ...deriveMoodProjection(state, input.boundary)
  }
}
