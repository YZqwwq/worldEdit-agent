import type { InteractionObservationSnapshot } from '@share/cache/AItype/states/interactionObservation'
import type {
  ConversationMode,
  InteractionState,
  MemorySlotSnapshot,
  UserMoodState
} from '@share/cache/AItype/states/memorySlots'
import type { PersonaConfig } from '@share/cache/AItype/states/personaConfig'

const trimText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const inferMoodFromText = (
  text: string,
  config: PersonaConfig
): { mood?: UserMoodState; confidence: number; valence: number } => {
  const normalized = text.trim().toLowerCase()
  if (!normalized) {
    return { confidence: 0, valence: 0 }
  }

  for (const rule of config.moodRules) {
    if (rule.phrases.some((phrase) => normalized.includes(phrase.trim().toLowerCase()))) {
      return {
        mood: rule.mood,
        confidence: rule.confidence,
        valence: rule.valence
      }
    }
  }

  return {
    confidence: 0,
    valence: 0
  }
}

const inferConversationMode = (
  observation: InteractionObservationSnapshot,
  text: string
): ConversationMode | undefined => {
  const normalized = text.toLowerCase()
  if (observation.type.startsWith('task_')) {
    return 'co_creation'
  }
  if (/(上班|工作|公司|职场|项目|任务|需求|汇报)/.test(normalized)) {
    return 'work'
  }
  if (/(世界观|角色|设定|剧情|名字|人设|扩写|润色|创作)/.test(normalized)) {
    return 'co_creation'
  }
  if (/(为什么|怎么|是否|能不能|可以吗|\?|？)/.test(normalized)) {
    return 'q_and_a'
  }
  if (/(聊聊|陪我|心情|难受|累|迷茫|焦虑|失落|想说说)/.test(normalized)) {
    return 'companion'
  }
  if (normalized) {
    return 'casual'
  }
  return undefined
}

const inferInteractionState = (
  observation: InteractionObservationSnapshot,
  text: string
): InteractionState | undefined => {
  const normalized = text.toLowerCase()
  if (/(帮我分析|分析一下|怎么办|该怎么做|建议|方案)/.test(normalized)) {
    return 'problem_solving'
  }
  if (/(一起想|脑暴|头脑风暴|发散|构思)/.test(normalized)) {
    return 'brainstorming'
  }
  if (/(我想聊聊|想说说|听我说|倾诉|有点难受|有点烦)/.test(normalized)) {
    return 'listening'
  }
  if (/(我觉得|想来|也许|是不是|好像)/.test(normalized)) {
    return 'reflecting'
  }
  if (observation.type === 'task_completed' || observation.type === 'task_cancelled') {
    return 'catching_up'
  }
  return undefined
}

const updateMoodSlotFromObservation = (
  slots: MemorySlotSnapshot,
  observation: InteractionObservationSnapshot,
  config: PersonaConfig
): void => {
  const updatedAt = observation.createdAt
  const text =
    trimText(observation.payload.text) ||
    trimText(observation.payload.message) ||
    trimText(observation.summary)

  let mood = inferMoodFromText(text, config)

  if (observation.type === 'user_interrupt') {
    mood = {
      mood: 'impatient',
      confidence: 0.72,
      valence: -0.22
    }
  } else if (observation.type === 'task_failed') {
    mood = {
      mood: 'uncertain',
      confidence: 0.55,
      valence: -0.18
    }
  } else if (observation.type === 'task_completed') {
    mood = {
      mood: 'positive',
      confidence: 0.48,
      valence: 0.16
    }
  }

  if (!mood.mood) {
    return
  }

  slots.user_mood = {
    current_mood: mood.mood,
    valence: mood.valence,
    confidence: mood.confidence,
    updatedAt,
    expiresAfterObservationId: observation.id + config.slot.userMoodRetentionObservations
  }
}

const updateConversationStateFromObservation = (
  slots: MemorySlotSnapshot,
  observation: InteractionObservationSnapshot
): void => {
  const updatedAt = observation.createdAt
  const taskTitle = trimText(observation.payload.taskTitle)
  const summary =
    trimText(observation.payload.summary) ||
    trimText(observation.payload.message) ||
    trimText(observation.payload.text) ||
    trimText(observation.summary)

  const mode = inferConversationMode(observation, `${taskTitle} ${summary}`)
  if (mode) {
    slots.conversation_state.conversation_mode = mode
  }

  const interactionState = inferInteractionState(observation, summary)
  if (interactionState) {
    slots.conversation_state.interaction_state = interactionState
  }

  slots.conversation_state.updatedAt = updatedAt
}

export const createDefaultMemorySlots = (): MemorySlotSnapshot => ({
  conversation_state: {},
  user_mood: {
    confidence: 0
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
    lastObservationId: observation.id
  }

  updateMoodSlotFromObservation(next, observation, config)
  updateConversationStateFromObservation(next, observation)

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
