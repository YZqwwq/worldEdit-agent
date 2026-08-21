import type { MemorySlotSnapshot } from '@share/cache/AItype/states/memorySlots'
import {
  MOOD_AGENCIES,
  MOOD_CONTROL_SIGNALS,
  MOOD_EVENT_KINDS,
  USER_MOOD_STATES,
  type MoodAssessment,
  type MoodLabel,
  type RelationshipEmotionState,
  type ShortTermEmotionState,
  type SlowMoodState
} from '@share/cache/AItype/states/moodAssessment'
import type { EntityManager } from 'typeorm'
import { AppDataSource } from '../../../../../database'
import { MemorySlotRecord } from '../../../../../../share/entity/database/MemorySlotRecord'
import { interactionObservationService } from '../personal/interactionObservationService'
import { applyObservationToMemorySlots, createDefaultMemorySlots } from './memoryWritePolicy'

const MEMORY_SLOT_ROW_ID = 1

const isString = (value: unknown): value is string => typeof value === 'string'

const isNumber = (value: unknown): value is number => typeof value === 'number'

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
  const userState = appraisal?.userState

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
      userState:
        userState && typeof userState === 'object' && USER_MOOD_STATES.includes(userState.mood)
          ? {
              mood: userState.mood,
              valence: Math.max(
                -1,
                Math.min(1, isNumber(userState.valence) ? userState.valence : 0)
              ),
              confidence: clamp01(isNumber(userState.confidence) ? userState.confidence : 0)
            }
          : {
              mood: 'calm',
              valence: 0,
              confidence: 0
            },
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

const parseSnapshot = (input: string): MemorySlotSnapshot => {
  try {
    const parsed = JSON.parse(input) as Record<string, any>
    if (parsed && typeof parsed === 'object') {
      const defaults = createDefaultMemorySlots()
      return {
        ...defaults,
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
      let snapshot = parseSnapshot(row.payloadJson)
      const observations = await interactionObservationService.listSince(row.lastObservationId)

      for (const observation of observations) {
        snapshot = applyObservationToMemorySlots(snapshot, observation)
        row.lastObservationId = observation.id
      }

      snapshot.lastObservationId = row.lastObservationId
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
