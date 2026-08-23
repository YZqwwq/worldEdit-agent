import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { MoodEventAppraisal } from '@share/cache/AItype/states/moodAssessment'
import { contentToText } from '../../../messageoutput/transformRespones'
import { getQuickModel } from '../../modelwithtool/quick-base-model'
import { extractJsonObject } from './personaJsonUtils'
import {
  buildMoodAppraisalPrompt,
  type MoodAppraisalPromptInput
} from './moodAppraisalPrompt'
import { normalizeMoodAppraisalForSource } from './moodAppraisalSource'
import { parseMoodAppraisal } from './moodAppraisalContract'

export { buildMoodAppraisalPrompt } from './moodAppraisalPrompt'

const inferMoodAppraisalWithModel = async (
  input: MoodAppraisalPromptInput
): Promise<MoodEventAppraisal> => {
  const quickModel = await getQuickModel()
  const response = await quickModel.invoke(
    [
      new SystemMessage('只返回符合指定结构的 JSON。'),
      new HumanMessage(buildMoodAppraisalPrompt(input))
    ]
  )
  const jsonText = extractJsonObject(contentToText(response.content).trim())
  if (!jsonText) throw new Error('Mood appraisal model did not return valid JSON')
  const appraisal = parseMoodAppraisal(JSON.parse(jsonText))
  return normalizeMoodAppraisalForSource(appraisal, input.eventSource)
}

export const inferMoodAppraisal = async (
  input: MoodAppraisalPromptInput
): Promise<MoodEventAppraisal> => inferMoodAppraisalWithModel(input)
