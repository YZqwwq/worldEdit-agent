import {
  isConversationMode,
  isInteractionState,
  isSceneContinuity,
  isSceneDomain,
  type WorldFocusItem,
  type WorldFocusItemRole,
  type WorldFocusItemSource,
  type WorldFocusMode,
  type WorldFocusStatus,
  type WorldFocusTaskType,
  type MemorySlotSnapshot
} from '@share/cache/AItype/states/memorySlots'
import {
  MOOD_AGENCIES,
  MOOD_CONTROL_SIGNALS,
  MOOD_EVENT_KINDS,
  type MoodAssessment,
  type MoodLabel,
  type RelationshipEmotionState,
  type ShortTermEmotionState,
  type SlowMoodState
} from '@share/cache/AItype/states/moodAssessment'
import type { WorldEntityType } from '@share/cache/worldbuilding/worldbuilding'
import type { EntityManager } from 'typeorm'
import { AppDataSource } from '../../../../../database'
import { MemorySlotRecord } from '../../../../../../share/entity/database/MemorySlotRecord'
import { interactionObservationService } from '../personal/interactionObservationService'
import { personaConfigService } from '../personal/personaConfigService'
import { applyObservationToMemorySlots, createDefaultMemorySlots } from './memoryWritePolicy'

const MEMORY_SLOT_ROW_ID = 1
const WORLD_ENTITY_TYPES: WorldEntityType[] = [
  'character',
  'race',
  'faction',
  'nation',
  'city',
  'region',
  'map',
  'map_location',
  'event',
  'item',
  'rule',
  'custom'
]

const isWorldEntityType = (value: unknown): value is WorldEntityType =>
  typeof value === 'string' && WORLD_ENTITY_TYPES.includes(value as WorldEntityType)

const WORLD_FOCUS_STATUSES: WorldFocusStatus[] = ['none', 'candidate', 'resolved', 'ambiguous']
const WORLD_FOCUS_MODES: WorldFocusMode[] = ['none', 'single', 'multi']
const WORLD_FOCUS_ITEM_ROLES: WorldFocusItemRole[] = [
  'primary',
  'co_focus',
  'reference',
  'target',
  'background'
]
const WORLD_FOCUS_ITEM_SOURCES: WorldFocusItemSource[] = [
  'explicit_mention',
  'mention_index',
  'previous_focus',
  'tool_result'
]
const WORLD_FOCUS_TASK_TYPES: WorldFocusTaskType[] = [
  'single_analysis',
  'compare',
  'relationship',
  'dialogue',
  'joint_analysis',
  'batch_edit',
  'reference_edit',
  'unknown'
]

const isWorldFocusStatus = (value: unknown): value is WorldFocusStatus =>
  typeof value === 'string' && WORLD_FOCUS_STATUSES.includes(value as WorldFocusStatus)

const isWorldFocusMode = (value: unknown): value is WorldFocusMode =>
  typeof value === 'string' && WORLD_FOCUS_MODES.includes(value as WorldFocusMode)

const isWorldFocusItemRole = (value: unknown): value is WorldFocusItemRole =>
  typeof value === 'string' && WORLD_FOCUS_ITEM_ROLES.includes(value as WorldFocusItemRole)

const isWorldFocusItemSource = (value: unknown): value is WorldFocusItemSource =>
  typeof value === 'string' && WORLD_FOCUS_ITEM_SOURCES.includes(value as WorldFocusItemSource)

const isWorldFocusTaskType = (value: unknown): value is WorldFocusTaskType =>
  typeof value === 'string' && WORLD_FOCUS_TASK_TYPES.includes(value as WorldFocusTaskType)

const isString = (value: unknown): value is string => typeof value === 'string'

const isNumber = (value: unknown): value is number => typeof value === 'number'

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

const MOOD_LABELS: MoodLabel[] = [
  'calm',
  'joy',
  'interest',
  'surprise',
  'fear',
  'anger',
  'frustration',
  'sadness',
  'disgust',
  'hurt',
  'tension',
  'stress',
  'helplessness',
  'boredom'
]

const SHORT_TERM_KEYS: Array<keyof ShortTermEmotionState> = [
  'joy',
  'interest',
  'surprise',
  'fear',
  'anger',
  'frustration',
  'sadness',
  'disgust',
  'hurt'
]
const SLOW_MOOD_KEYS: Array<keyof SlowMoodState> = [
  'positiveTone',
  'tension',
  'stress',
  'helplessness',
  'boredom'
]
const RELATIONSHIP_KEYS: Array<keyof RelationshipEmotionState> = [
  'trust',
  'affinity',
  'respect',
  'attachment',
  'resentment'
]

const isMoodLabel = (value: unknown): value is MoodLabel =>
  typeof value === 'string' && MOOD_LABELS.includes(value as MoodLabel)

const parseUnitState = <K extends string>(
  value: unknown,
  keys: readonly K[]
): Record<K, number> | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const next = {} as Record<K, number>
  for (const key of keys) {
    if (!isNumber(raw[key])) return undefined
    next[key] = clamp01(raw[key])
  }
  return next
}

const parseMoodAssessment = (value: unknown): MoodAssessment | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const raw = value as Record<string, any>
  const appraisal = raw.appraisal
  const shortTerm = parseUnitState(raw.shortTerm, SHORT_TERM_KEYS)
  const slowMood = parseUnitState(raw.slowMood, SLOW_MOOD_KEYS)
  const relationship = parseUnitState(raw.relationship, RELATIONSHIP_KEYS)
  const delta = raw.expressionDelta
  const modulation = raw.expressionModulation

  if (
    raw.version !== 2 ||
    !isString(raw.generatedAt) ||
    !isMoodLabel(raw.primaryEmotion) ||
    (raw.secondaryEmotion !== undefined && !isMoodLabel(raw.secondaryEmotion)) ||
    !appraisal ||
    typeof appraisal !== 'object' ||
    !MOOD_EVENT_KINDS.includes(appraisal.eventKind) ||
    !MOOD_AGENCIES.includes(appraisal.agency) ||
    !MOOD_CONTROL_SIGNALS.includes(appraisal.controlSignal) ||
    !shortTerm ||
    !slowMood ||
    !relationship ||
    !delta ||
    typeof delta !== 'object' ||
    !modulation ||
    typeof modulation !== 'object'
  ) {
    return undefined
  }

  return {
    version: 2,
    generatedAt: raw.generatedAt,
    appraisal: {
      eventKind: appraisal.eventKind,
      valence: [-2, -1, 0, 1, 2].includes(appraisal.valence) ? appraisal.valence : 0,
      salience: [0, 1, 2, 3].includes(appraisal.salience) ? appraisal.salience : 0,
      novelty: [0, 1, 2, 3].includes(appraisal.novelty) ? appraisal.novelty : 0,
      futureProspect: [-2, -1, 0, 1, 2].includes(appraisal.futureProspect)
        ? appraisal.futureProspect
        : 0,
      agency: appraisal.agency,
      normImpact: [-2, -1, 0, 1, 2].includes(appraisal.normImpact) ? appraisal.normImpact : 0,
      relationshipImpact: [-2, -1, 0, 1, 2].includes(appraisal.relationshipImpact)
        ? appraisal.relationshipImpact
        : 0,
      controlSignal: appraisal.controlSignal,
      confidence: [0, 1, 2, 3].includes(appraisal.confidence) ? appraisal.confidence : 0
    },
    shortTerm,
    slowMood,
    relationship,
    primaryEmotion: raw.primaryEmotion,
    secondaryEmotion: raw.secondaryEmotion,
    intensity: clamp01(isNumber(raw.intensity) ? raw.intensity : 0),
    narrative: isString(raw.narrative) ? raw.narrative : '',
    expressionDelta: {
      verbosity: isNumber(delta.verbosity) ? delta.verbosity : 0,
      formality: isNumber(delta.formality) ? delta.formality : 0
    },
    expressionModulation: {
      relationalCloseness: clamp01(
        isNumber(modulation.relationalCloseness) ? modulation.relationalCloseness : 0
      ),
      warmth: clamp01(isNumber(modulation.warmth) ? modulation.warmth : 0),
      contraction: clamp01(isNumber(modulation.contraction) ? modulation.contraction : 0),
      imaginativeOpenness: clamp01(
        isNumber(modulation.imaginativeOpenness) ? modulation.imaginativeOpenness : 0
      ),
      contextFirstTendency: clamp01(
        isNumber(modulation.contextFirstTendency)
          ? modulation.contextFirstTendency
          : isNumber(modulation.clarificationNeed)
            ? modulation.clarificationNeed
            : 0
      )
    }
  }
}

const parseWorldFocusItem = (value: unknown): WorldFocusItem | null => {
  if (!value || typeof value !== 'object') return null

  const raw = value as Record<string, any>
  if (
    !isString(raw.worldId) ||
    !isString(raw.worldName) ||
    !isWorldEntityType(raw.focusType) ||
    !isString(raw.entityId) ||
    !isString(raw.entityName)
  ) {
    return null
  }

  return {
    worldId: raw.worldId,
    worldName: raw.worldName,
    focusType: raw.focusType,
    entityId: raw.entityId,
    entityName: raw.entityName,
    role: isWorldFocusItemRole(raw.role) ? raw.role : 'co_focus',
    source: isWorldFocusItemSource(raw.source) ? raw.source : 'mention_index',
    confidence: clamp01(isNumber(raw.confidence) ? raw.confidence : 0),
    reason: isString(raw.reason) ? raw.reason : undefined
  }
}

const normalizeWorldFocusSlot = (
  input: unknown,
  defaults: MemorySlotSnapshot['world_focus']
): MemorySlotSnapshot['world_focus'] => {
  const raw = input && typeof input === 'object' ? (input as Record<string, any>) : {}
  const status = isWorldFocusStatus(raw.status) ? raw.status : defaults.status
  const confidence = clamp01(isNumber(raw.confidence) ? raw.confidence : defaults.confidence)
  const parsedFocuses = Array.isArray(raw.focuses)
    ? raw.focuses.map(parseWorldFocusItem).filter((item): item is WorldFocusItem => Boolean(item))
    : []
  const focuses = parsedFocuses
  const primaryFocusId = isString(raw.primaryFocusId)
    ? raw.primaryFocusId
    : focuses.find((item) => item.role === 'primary')?.entityId
  const primary =
    focuses.find((item) => item.entityId === primaryFocusId) ??
    focuses.find((item) => item.role === 'primary') ??
    focuses[0]
  const mode = isWorldFocusMode(raw.mode)
    ? raw.mode
    : focuses.length > 1
      ? 'multi'
      : focuses.length === 1
        ? 'single'
        : 'none'
  const focusTask =
    raw.focusTask && typeof raw.focusTask === 'object'
      ? {
          type: isWorldFocusTaskType(raw.focusTask.type) ? raw.focusTask.type : 'unknown',
          description: isString(raw.focusTask.description) ? raw.focusTask.description : ''
        }
      : undefined

  return {
    ...defaults,
    mode: status === 'resolved' ? mode : focuses.length > 0 ? mode : 'none',
    primaryFocusId: primary?.entityId,
    focuses,
    focusTask,
    confidence,
    status,
    updatedAt: isString(raw.updatedAt) ? raw.updatedAt : undefined
  }
}

const parseSnapshot = (input: string): MemorySlotSnapshot => {
  try {
    const parsed = JSON.parse(input) as Record<string, any>
    if (parsed && typeof parsed === 'object') {
      const defaults = createDefaultMemorySlots()
      return {
        ...defaults,
        conversation_state: {
          ...defaults.conversation_state,
          conversation_mode: isConversationMode(parsed.conversation_state?.conversation_mode)
            ? parsed.conversation_state.conversation_mode
            : undefined,
          interaction_state: isInteractionState(parsed.conversation_state?.interaction_state)
            ? parsed.conversation_state.interaction_state
            : undefined
        },
        user_mood: {
          ...defaults.user_mood,
          current_mood:
            typeof parsed.user_mood?.current_mood === 'string'
              ? parsed.user_mood.current_mood
              : undefined,
          valence:
            typeof parsed.user_mood?.valence === 'number' ? parsed.user_mood.valence : undefined,
          confidence:
            typeof parsed.user_mood?.confidence === 'number'
              ? parsed.user_mood.confidence
              : defaults.user_mood.confidence,
          updatedAt:
            typeof parsed.user_mood?.updatedAt === 'string'
              ? parsed.user_mood.updatedAt
              : undefined,
          expiresAfterObservationId:
            typeof parsed.user_mood?.expiresAfterObservationId === 'number'
              ? parsed.user_mood.expiresAfterObservationId
              : undefined
        },
        ai_mood: {
          ...defaults.ai_mood,
          current: parseMoodAssessment(parsed.ai_mood?.current),
          updatedAt: isString(parsed.ai_mood?.updatedAt) ? parsed.ai_mood.updatedAt : undefined
        },
        world_focus: normalizeWorldFocusSlot(parsed.world_focus, defaults.world_focus),
        scene_perception: {
          ...defaults.scene_perception,
          primaryDomain: isSceneDomain(parsed.scene_perception?.primaryDomain)
            ? parsed.scene_perception.primaryDomain
            : defaults.scene_perception.primaryDomain,
          referenceDomains: Array.isArray(parsed.scene_perception?.referenceDomains)
            ? parsed.scene_perception.referenceDomains.filter(isSceneDomain)
            : defaults.scene_perception.referenceDomains,
          continuity: isSceneContinuity(parsed.scene_perception?.continuity)
            ? parsed.scene_perception.continuity
            : defaults.scene_perception.continuity,
          currentSceneStillActive: isBoolean(parsed.scene_perception?.currentSceneStillActive)
            ? parsed.scene_perception.currentSceneStillActive
            : defaults.scene_perception.currentSceneStillActive,
          appWorldbuildingDiscussionRelated: isBoolean(
            parsed.scene_perception?.appWorldbuildingDiscussionRelated
          )
            ? parsed.scene_perception.appWorldbuildingDiscussionRelated
            : defaults.scene_perception.appWorldbuildingDiscussionRelated,
          appWorldbuildingInstanceRelated: isBoolean(
            parsed.scene_perception?.appWorldbuildingInstanceRelated
          )
            ? parsed.scene_perception.appWorldbuildingInstanceRelated
            : defaults.scene_perception.appWorldbuildingInstanceRelated,
          shouldRunWorldFocus: isBoolean(parsed.scene_perception?.shouldRunWorldFocus)
            ? parsed.scene_perception.shouldRunWorldFocus
            : defaults.scene_perception.shouldRunWorldFocus,
          shouldInjectHistoricalWorldFocus: isBoolean(
            parsed.scene_perception?.shouldInjectHistoricalWorldFocus
          )
            ? parsed.scene_perception.shouldInjectHistoricalWorldFocus
            : defaults.scene_perception.shouldInjectHistoricalWorldFocus,
          confidence: isNumber(parsed.scene_perception?.confidence)
            ? clamp01(parsed.scene_perception.confidence)
            : defaults.scene_perception.confidence,
          reason: isString(parsed.scene_perception?.reason)
            ? parsed.scene_perception.reason
            : defaults.scene_perception.reason,
          evidence: Array.isArray(parsed.scene_perception?.evidence)
            ? parsed.scene_perception.evidence.filter(isString).slice(0, 6)
            : defaults.scene_perception.evidence,
          source: 'sceneNode',
          updatedAt: isString(parsed.scene_perception?.updatedAt)
            ? parsed.scene_perception.updatedAt
            : undefined,
          previousScene:
            parsed.scene_perception?.previousScene &&
            typeof parsed.scene_perception.previousScene === 'object'
              ? {
                  primaryDomain: isSceneDomain(parsed.scene_perception.previousScene.primaryDomain)
                    ? parsed.scene_perception.previousScene.primaryDomain
                    : undefined,
                  appWorldbuildingInstanceRelated: isBoolean(
                    parsed.scene_perception.previousScene.appWorldbuildingInstanceRelated
                  )
                    ? parsed.scene_perception.previousScene.appWorldbuildingInstanceRelated
                    : undefined,
                  worldFocusEntityName: isString(
                    parsed.scene_perception.previousScene.worldFocusEntityName
                  )
                    ? parsed.scene_perception.previousScene.worldFocusEntityName
                    : undefined,
                  worldFocusEntityId: isString(
                    parsed.scene_perception.previousScene.worldFocusEntityId
                  )
                    ? parsed.scene_perception.previousScene.worldFocusEntityId
                    : undefined
                }
              : undefined
        },
        lastObservationId:
          typeof parsed.lastObservationId === 'number' ? parsed.lastObservationId : 0
      }
    }
  } catch {
    // ignore bad payload
  }

  return createDefaultMemorySlots()
}

class MemorySlotService {
  private writeQueue: Promise<void> = Promise.resolve()

  private get repo() {
    return AppDataSource.getRepository(MemorySlotRecord)
  }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.writeQueue
    let release: () => void = () => {}
    this.writeQueue = new Promise<void>((resolve) => {
      release = resolve
    })

    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }

  private async loadRow(): Promise<MemorySlotRecord> {
    let row = await this.repo.findOneBy({ id: MEMORY_SLOT_ROW_ID })
    if (!row) {
      row = this.repo.create({
        id: MEMORY_SLOT_ROW_ID,
        lastObservationId: 0,
        payloadJson: JSON.stringify(createDefaultMemorySlots())
      })
      row = await this.repo.save(row)
    }
    return row
  }

  async getSnapshot(): Promise<MemorySlotSnapshot> {
    const row = await this.loadRow()
    const snapshot = parseSnapshot(row.payloadJson)
    snapshot.lastObservationId = row.lastObservationId
    return snapshot
  }

  async saveSnapshotWithManager(
    snapshot: MemorySlotSnapshot,
    manager: EntityManager
  ): Promise<void> {
    const repo = manager.getRepository(MemorySlotRecord)
    let row = await repo.findOneBy({ id: MEMORY_SLOT_ROW_ID })
    if (!row) row = repo.create({ id: MEMORY_SLOT_ROW_ID })
    row.lastObservationId = snapshot.lastObservationId ?? 0
    row.payloadJson = JSON.stringify(snapshot)
    await repo.save(row)
  }

  async reconcileFromObservations(): Promise<MemorySlotSnapshot> {
    return this.withWriteLock(async () => {
      const row = await this.loadRow()
      const config = await personaConfigService.getConfig()
      let snapshot = parseSnapshot(row.payloadJson)
      const observations = await interactionObservationService.listSince(row.lastObservationId)

      for (const observation of observations) {
        snapshot = applyObservationToMemorySlots(snapshot, observation, config)
        row.lastObservationId = observation.id
      }

      snapshot.lastObservationId = row.lastObservationId
      row.payloadJson = JSON.stringify(snapshot)
      await this.repo.save(row)
      return snapshot
    })
  }

  async replaceWorldFocus(
    worldFocus: Partial<MemorySlotSnapshot['world_focus']>
  ): Promise<MemorySlotSnapshot> {
    return this.withWriteLock(async () => {
      const row = await this.loadRow()
      const snapshot = parseSnapshot(row.payloadJson)
      snapshot.lastObservationId = row.lastObservationId
      snapshot.world_focus = normalizeWorldFocusSlot(
        {
          ...worldFocus,
          updatedAt: worldFocus.updatedAt ?? new Date().toISOString()
        },
        createDefaultMemorySlots().world_focus
      )
      row.payloadJson = JSON.stringify(snapshot)
      await this.repo.save(row)
      return snapshot
    })
  }

  async updateConversationState(
    conversationState: Partial<MemorySlotSnapshot['conversation_state']>
  ): Promise<MemorySlotSnapshot> {
    return this.withWriteLock(async () => {
      const row = await this.loadRow()
      const snapshot = parseSnapshot(row.payloadJson)
      snapshot.lastObservationId = row.lastObservationId
      snapshot.conversation_state = {
        ...snapshot.conversation_state,
        ...conversationState,
        updatedAt: conversationState.updatedAt ?? new Date().toISOString()
      }
      row.payloadJson = JSON.stringify(snapshot)
      await this.repo.save(row)
      return snapshot
    })
  }

  async updateSceneState(input: {
    scenePerception: MemorySlotSnapshot['scene_perception']
    conversationState: Partial<MemorySlotSnapshot['conversation_state']>
  }): Promise<MemorySlotSnapshot> {
    return this.withWriteLock(async () => {
      const row = await this.loadRow()
      const snapshot = parseSnapshot(row.payloadJson)
      const updatedAt = input.scenePerception.updatedAt ?? new Date().toISOString()
      snapshot.lastObservationId = row.lastObservationId
      snapshot.scene_perception = {
        ...input.scenePerception,
        updatedAt
      }
      snapshot.conversation_state = {
        ...input.conversationState,
        updatedAt: input.conversationState.updatedAt ?? updatedAt
      }
      row.payloadJson = JSON.stringify(snapshot)
      await this.repo.save(row)
      return snapshot
    })
  }

  async updateAiMood(aiMood: MemorySlotSnapshot['ai_mood']): Promise<MemorySlotSnapshot> {
    return this.withWriteLock(async () => {
      const row = await this.loadRow()
      const snapshot = parseSnapshot(row.payloadJson)
      snapshot.lastObservationId = row.lastObservationId
      snapshot.ai_mood = {
        ...aiMood,
        updatedAt: aiMood.updatedAt ?? new Date().toISOString()
      }
      row.payloadJson = JSON.stringify(snapshot)
      await this.repo.save(row)
      return snapshot
    })
  }

  async updateUserMood(userMood: MemorySlotSnapshot['user_mood']): Promise<MemorySlotSnapshot> {
    return this.withWriteLock(async () => {
      const row = await this.loadRow()
      const snapshot = parseSnapshot(row.payloadJson)
      snapshot.lastObservationId = row.lastObservationId
      snapshot.user_mood = {
        ...userMood,
        updatedAt: userMood.updatedAt ?? new Date().toISOString()
      }
      row.payloadJson = JSON.stringify(snapshot)
      await this.repo.save(row)
      return snapshot
    })
  }

  async clear(): Promise<void> {
    return this.withWriteLock(async () => {
      let row = await this.repo.findOneBy({ id: MEMORY_SLOT_ROW_ID })
      if (!row) {
        row = this.repo.create({ id: MEMORY_SLOT_ROW_ID })
      }
      row.lastObservationId = 0
      row.payloadJson = JSON.stringify(createDefaultMemorySlots())
      await this.repo.save(row)
    })
  }
}

export const memorySlotService = new MemorySlotService()
