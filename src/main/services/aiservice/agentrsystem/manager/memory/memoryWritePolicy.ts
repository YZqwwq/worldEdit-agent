import type { InteractionObservationSnapshot } from '@share/cache/AItype/states/interactionObservation'
import type { MemorySlotSnapshot } from '@share/cache/AItype/states/memorySlots'
import type { PersonaConfig } from '@share/cache/AItype/states/personaConfig'

const updateMoodSlotFromObservation = (
  slots: MemorySlotSnapshot,
  observation: InteractionObservationSnapshot,
  config: PersonaConfig
): void => {
  const updatedAt = observation.createdAt
  if (observation.type === 'user_interrupt') {
    slots.user_mood = {
      current_mood: 'impatient',
      confidence: 0.72,
      valence: -0.22,
      updatedAt,
      expiresAfterObservationId: observation.id + config.slot.userMoodRetentionObservations
    }
  } else if (observation.type === 'task_failed') {
    slots.user_mood = {
      current_mood: 'uncertain',
      confidence: 0.55,
      valence: -0.18,
      updatedAt,
      expiresAfterObservationId: observation.id + config.slot.userMoodRetentionObservations
    }
  } else if (observation.type === 'task_completed') {
    slots.user_mood = {
      current_mood: 'positive',
      confidence: 0.48,
      valence: 0.16,
      updatedAt,
      expiresAfterObservationId: observation.id + config.slot.userMoodRetentionObservations
    }
  }
}

export const createDefaultMemorySlots = (): MemorySlotSnapshot => ({
  conversation_state: {},
  user_mood: {
    confidence: 0
  },
  ai_mood: {},
  world_focus: {
    confidence: 0,
    status: 'none'
  },
  scene_perception: {
    primaryDomain: 'unknown',
    referenceDomains: [],
    continuity: 'uncertain',
    currentSceneStillActive: false,
    appWorldbuildingDiscussionRelated: false,
    appWorldbuildingInstanceRelated: false,
    shouldRunWorldFocus: false,
    shouldInjectHistoricalWorldFocus: false,
    confidence: 0,
    reason: 'not_initialized',
    evidence: [],
    source: 'sceneNode'
  },
  lastObservationId: 0
})

export const applyObservationToMemorySlots = (
  slots: MemorySlotSnapshot,
  observation: InteractionObservationSnapshot,
  config: PersonaConfig
): MemorySlotSnapshot => {
  const next: MemorySlotSnapshot = {
    conversation_state: {
      ...slots.conversation_state
    },
    user_mood: {
      ...slots.user_mood
    },
    ai_mood: {
      ...slots.ai_mood
    },
    world_focus: {
      ...slots.world_focus
    },
    scene_perception: {
      ...slots.scene_perception
    },
    lastObservationId: observation.id
  }

  updateMoodSlotFromObservation(next, observation, config)

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
