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
import type { MoodAssessment, 情绪标签 } from '@share/cache/AItype/states/moodAssessment'
import type { WorldEntityType } from '@share/cache/worldbuilding/worldbuilding'
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

const EMOTION_LABELS: 情绪标签[] = [
  '平淡',
  '轻愉悦',
  '高兴',
  '轻兴奋',
  '兴奋',
  '惊讶',
  '轻度伤感',
  '悲伤',
  '受挫',
  '愤怒',
  '焦虑',
  '紧张'
]

const isEmotionLabel = (value: unknown): value is 情绪标签 =>
  typeof value === 'string' && EMOTION_LABELS.includes(value as 情绪标签)

const parseMoodAssessment = (value: unknown): MoodAssessment | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const raw = value as Record<string, any>
  const vector = raw.情绪向量
  const delta = raw.参数偏移
  const modulation = raw.表达调制
  const source = raw.来源

  if (
    !isString(raw.生成时间) ||
    !isEmotionLabel(raw.主情绪) ||
    (raw.副情绪 !== undefined && !isEmotionLabel(raw.副情绪)) ||
    !vector ||
    typeof vector !== 'object' ||
    !delta ||
    typeof delta !== 'object' ||
    !modulation ||
    typeof modulation !== 'object' ||
    !source ||
    typeof source !== 'object'
  ) {
    return undefined
  }

  return {
    生成时间: raw.生成时间,
    主情绪: raw.主情绪,
    副情绪: raw.副情绪,
    情绪向量: {
      愉悦度: clamp01(isNumber(vector.愉悦度) ? vector.愉悦度 : 0),
      激活度: clamp01(isNumber(vector.激活度) ? vector.激活度 : 0),
      紧张度: clamp01(isNumber(vector.紧张度) ? vector.紧张度 : 0),
      受挫度: clamp01(isNumber(vector.受挫度) ? vector.受挫度 : 0),
      亲近度: clamp01(isNumber(vector.亲近度) ? vector.亲近度 : 0),
      专注度: clamp01(isNumber(vector.专注度) ? vector.专注度 : 0)
    },
    强度: clamp01(isNumber(raw.强度) ? raw.强度 : 0),
    置信度: clamp01(isNumber(raw.置信度) ? raw.置信度 : 0),
    行为叙事: isString(raw.行为叙事) ? raw.行为叙事 : '',
    参数偏移: {
      自主性: isNumber(delta.自主性) ? delta.自主性 : 0,
      详略度: isNumber(delta.详略度) ? delta.详略度 : 0,
      探索性: isNumber(delta.探索性) ? delta.探索性 : 0,
      正式度: isNumber(delta.正式度) ? delta.正式度 : 0
    },
    表达调制: {
      关系靠近度: clamp01(isNumber(modulation.关系靠近度) ? modulation.关系靠近度 : 0),
      表达温度: clamp01(isNumber(modulation.表达温度) ? modulation.表达温度 : 0),
      收束度: clamp01(isNumber(modulation.收束度) ? modulation.收束度 : 0),
      想象开放度: clamp01(isNumber(modulation.想象开放度) ? modulation.想象开放度 : 0),
      澄清需求: clamp01(isNumber(modulation.澄清需求) ? modulation.澄清需求 : 0)
    },
    来源: {
      用户情绪: isString(source.用户情绪) ? source.用户情绪 : undefined,
      对话模式: isString(source.对话模式) ? source.对话模式 : undefined,
      交互状态: isString(source.交互状态) ? source.交互状态 : undefined,
      信号: Array.isArray(source.信号) ? source.信号.filter(isString) : []
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
