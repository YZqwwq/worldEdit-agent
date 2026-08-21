import type { InteractionObservationSnapshot } from '@share/cache/AItype/states/interactionObservation'
import type { MemorySlotSnapshot } from '@share/cache/AItype/states/memorySlots'

export const createDefaultMemorySlots = (): MemorySlotSnapshot => ({
  user_mood: {
    confidence: 0
  },
  ai_mood: {},
  lastObservationId: 0
})

export const applyObservationToMemorySlots = (
  slots: MemorySlotSnapshot,
  observation: InteractionObservationSnapshot
): MemorySlotSnapshot => {
  const next: MemorySlotSnapshot = {
    user_mood: {
      ...slots.user_mood
    },
    ai_mood: {
      ...slots.ai_mood
    },
    lastObservationId: observation.id
  }

  if (
    next.user_mood.expiresAfterObservationId &&
    next.user_mood.expiresAfterObservationId <= observation.id
  ) {
    next.user_mood = {
      confidence: 0
    }
  }

  return next
}
