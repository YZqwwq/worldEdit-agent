import type {
  ConversationMode,
  InteractionState,
  MemorySlotSnapshot,
  SceneDomain,
  ScenePerceptionSlot
} from '@share/cache/AItype/states/memorySlots'

const mapSceneDomainToConversationMode = (domain: SceneDomain): ConversationMode | undefined => {
  switch (domain) {
    case 'app_worldbuilding':
    case 'general_creative':
      return 'worldbuilding'
    case 'practical_support':
      return 'practical_support'
    case 'daily_life':
      return 'daily_life'
    case 'knowledge_query':
    case 'external_media':
      return 'knowledge_query'
    case 'relational_intimacy':
      return 'relational_intimacy'
    case 'unknown':
    default:
      return undefined
  }
}

const mapSceneDomainToInteractionState = (
  domain: SceneDomain,
  previous?: InteractionState
): InteractionState | undefined => {
  switch (domain) {
    case 'app_worldbuilding':
    case 'general_creative':
    case 'practical_support':
      return 'working'
    case 'daily_life':
      return previous === 'teasing' ? 'teasing' : 'casual_chat'
    case 'knowledge_query':
    case 'external_media':
      return 'deep_talk'
    case 'relational_intimacy':
      return previous === 'teasing' ? 'teasing' : 'emotional_sharing'
    case 'unknown':
    default:
      return undefined
  }
}

export const buildConversationStateFromScenePerception = (
  scenePerception: ScenePerceptionSlot | undefined,
  previous?: MemorySlotSnapshot['conversation_state']
): MemorySlotSnapshot['conversation_state'] | undefined => {
  if (!scenePerception) {
    return undefined
  }

  if (scenePerception.confidence < 0.6 || scenePerception.primaryDomain === 'unknown') {
    return {
      updatedAt: scenePerception.updatedAt ?? new Date().toISOString()
    }
  }

  const conversationMode = mapSceneDomainToConversationMode(scenePerception.primaryDomain)
  const interactionState = mapSceneDomainToInteractionState(
    scenePerception.primaryDomain,
    previous?.interaction_state
  )

  if (!conversationMode && !interactionState) {
    return undefined
  }

  return {
    ...previous,
    conversation_mode: conversationMode ?? previous?.conversation_mode,
    interaction_state: interactionState ?? previous?.interaction_state,
    updatedAt: new Date().toISOString()
  }
}

export const applyScenePerceptionToMemorySlots = (
  slots: MemorySlotSnapshot
): MemorySlotSnapshot => {
  const conversationState = buildConversationStateFromScenePerception(
    slots.scene_perception,
    slots.conversation_state
  )
  if (!conversationState) {
    return slots
  }

  return {
    ...slots,
    conversation_state: conversationState
  }
}
