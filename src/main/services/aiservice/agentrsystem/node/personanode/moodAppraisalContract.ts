import { z } from 'zod'
import {
  MOOD_AGENCIES,
  MOOD_CONTROL_SIGNALS,
  MOOD_EVENT_KINDS,
  USER_MOOD_STATES,
  type AppraisalLevel,
  type MoodEventAppraisal,
  type SignedAppraisalLevel
} from '@share/cache/AItype/states/moodAssessment'

const quantize = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)))

// Models naturally express intensity continuously. Quantize once at the
// appraisal boundary so the emotion dynamics can keep a stable discrete scale.
const signedLevel = z.coerce
  .number()
  .finite()
  .transform((value): SignedAppraisalLevel => quantize(value, -2, 2) as SignedAppraisalLevel)
const level = z.coerce
  .number()
  .finite()
  .transform((value): AppraisalLevel => quantize(value, 0, 3) as AppraisalLevel)

export const moodAppraisalSchema = z.object({
  userState: z.object({
    mood: z.enum(USER_MOOD_STATES),
    valence: z.number().finite().min(-1).max(1),
    confidence: z.number().finite().min(0).max(1)
  }),
  eventKind: z.enum(MOOD_EVENT_KINDS),
  valence: signedLevel,
  salience: level,
  novelty: level,
  futureProspect: signedLevel,
  agency: z.enum(MOOD_AGENCIES),
  normImpact: signedLevel,
  relationshipImpact: signedLevel,
  controlSignal: z.enum(MOOD_CONTROL_SIGNALS),
  confidence: level
})

export const parseMoodAppraisal = (value: unknown): MoodEventAppraisal =>
  moodAppraisalSchema.parse(value)
