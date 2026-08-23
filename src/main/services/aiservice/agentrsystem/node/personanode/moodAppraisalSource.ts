import type { MoodEventAppraisal } from '@share/cache/AItype/states/moodAssessment'
import type { MoodAppraisalPromptInput } from './moodAppraisalPrompt'

export const normalizeMoodAppraisalForSource = (
  appraisal: MoodEventAppraisal,
  eventSource: MoodAppraisalPromptInput['eventSource']
): MoodEventAppraisal =>
  eventSource === 'user'
    ? appraisal
    : {
        ...appraisal,
        userState: { mood: 'calm', valence: 0, confidence: 0 },
        relationshipImpact: 0
      }
