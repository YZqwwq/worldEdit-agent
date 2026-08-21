import type { MoodEventAppraisal } from '@share/cache/AItype/states/moodAssessment'
import type { UserMoodSlot } from '@share/cache/AItype/states/memorySlots'

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const projectUserMoodSlot = (
  appraisal: MoodEventAppraisal,
  input: { observationId: number; retentionObservations: number; nowIso: string }
): UserMoodSlot => {
  const confidence = clamp(appraisal.userState.confidence, 0, 1)
  if (confidence < 0.45) {
    return {
      confidence: 0,
      updatedAt: input.nowIso
    }
  }

  return {
    current_mood: appraisal.userState.mood,
    valence: clamp(appraisal.userState.valence, -1, 1),
    confidence,
    updatedAt: input.nowIso,
    expiresAfterObservationId:
      input.observationId + Math.max(1, Math.round(input.retentionObservations))
  }
}
