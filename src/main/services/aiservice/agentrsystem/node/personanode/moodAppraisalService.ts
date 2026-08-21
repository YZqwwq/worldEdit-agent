import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import {
  MOOD_AGENCIES,
  MOOD_CONTROL_SIGNALS,
  MOOD_EVENT_KINDS,
  USER_MOOD_STATES,
  type MoodEventAppraisal
} from '@share/cache/AItype/states/moodAssessment'
import { contentToText } from '../../../messageoutput/transformRespones'
import { getQuickModel } from '../../modelwithtool/quick-base-model'
import { extractJsonObject } from './personaJsonUtils'
import { NEUTRAL_MOOD_APPRAISAL } from './emotionDynamicsCompiler'
import {
  buildMoodAppraisalPrompt,
  type MoodAppraisalPromptInput
} from './moodAppraisalPrompt'

export { buildMoodAppraisalPrompt } from './moodAppraisalPrompt'

const signedLevel = z.union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)])
const level = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])

const moodAppraisalSchema = z.object({
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

const inferMoodAppraisalWithModel = async (
  input: MoodAppraisalPromptInput
): Promise<MoodEventAppraisal> => {
  const quickModel = await getQuickModel()
  const response = await quickModel.invoke(
    [
      new SystemMessage('只返回符合指定结构的 JSON。'),
      new HumanMessage(buildMoodAppraisalPrompt(input))
    ],
    { signal: AbortSignal.timeout(12000) } as Record<string, unknown>
  )
  const jsonText = extractJsonObject(contentToText(response.content).trim())
  if (!jsonText) throw new Error('Mood appraisal model did not return valid JSON')
  return moodAppraisalSchema.parse(JSON.parse(jsonText))
}

export const inferMoodAppraisal = async (
  input: MoodAppraisalPromptInput
): Promise<MoodEventAppraisal> => {
  try {
    return await inferMoodAppraisalWithModel(input)
  } catch {
    return { ...NEUTRAL_MOOD_APPRAISAL }
  }
}
