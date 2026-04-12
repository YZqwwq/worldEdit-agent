import { readFile } from 'node:fs/promises'
import type {
  PersonaBufferItem,
  PersonaMetricDelta,
  PersonaMetrics,
  PersonaState
} from '@share/cache/AItype/states/personalState'
import { AppDataSource } from '../../../../../database'
import { PersonaStateRecord } from '../../../../../../share/entity/database/PersonaStateRecord'
import {
  getPersonaStateFallbackPath,
  getPersonaStatePath
} from '../../../../../config/pathConfig'

const PERSONA_STATE_ROW_ID = 1

export const createNeutralPersonaMetrics = (): PersonaMetrics => ({
  autonomy_level: 0.5,
  verbosity_index: 0.5,
  risk_tolerance: 0.5,
  formality_score: 0.5
})

export const createZeroPersonaDelta = (): PersonaMetricDelta => ({
  autonomy_level: 0,
  verbosity_index: 0,
  risk_tolerance: 0,
  formality_score: 0
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isNumber = (value: unknown): value is number => typeof value === 'number'

const isString = (value: unknown): value is string => typeof value === 'string'

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

export const clamp01 = (value: number): number => clamp(value, 0, 1)

export const roundTo = (value: number, digits = 3): number =>
  Number(value.toFixed(digits))

const parseMetrics = (value: unknown, fallback: PersonaMetrics): PersonaMetrics => {
  if (!isRecord(value)) {
    return fallback
  }

  return {
    autonomy_level: clamp01(isNumber(value.autonomy_level) ? value.autonomy_level : fallback.autonomy_level),
    verbosity_index: clamp01(isNumber(value.verbosity_index) ? value.verbosity_index : fallback.verbosity_index),
    risk_tolerance: clamp01(isNumber(value.risk_tolerance) ? value.risk_tolerance : fallback.risk_tolerance),
    formality_score: clamp01(isNumber(value.formality_score) ? value.formality_score : fallback.formality_score)
  }
}

const parseDelta = (value: unknown, fallback: PersonaMetricDelta): PersonaMetricDelta => {
  if (!isRecord(value)) {
    return fallback
  }

  return {
    autonomy_level: clamp(isNumber(value.autonomy_level) ? value.autonomy_level : fallback.autonomy_level, -1, 1),
    verbosity_index: clamp(isNumber(value.verbosity_index) ? value.verbosity_index : fallback.verbosity_index, -1, 1),
    risk_tolerance: clamp(isNumber(value.risk_tolerance) ? value.risk_tolerance : fallback.risk_tolerance, -1, 1),
    formality_score: clamp(isNumber(value.formality_score) ? value.formality_score : fallback.formality_score, -1, 1)
  }
}

const parseBuffer = (value: unknown): PersonaBufferItem[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return []
    }
    if (!isNumber(item.turn) || !isString(item.user_signal) || !isString(item.impact)) {
      return []
    }
    return [
      {
        turn: item.turn,
        user_signal: item.user_signal,
        impact: item.impact
      } satisfies PersonaBufferItem
    ]
  })
}

const parseJson = <T>(text: string, fallback: T): T => {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

const buildDefaultPersonaState = (): PersonaState => {
  const metrics = createNeutralPersonaMetrics()
  return {
    persona_id: 'default',
    last_updated: new Date().toISOString(),
    stable_preferences: metrics,
    session_hormones: createZeroPersonaDelta(),
    transient_state: createZeroPersonaDelta(),
    metrics,
    current_behavioral_narrative: '默认人格状态',
    recent_interaction_buffer: [],
    last_observation_id: 0,
    evolution_turn: 0
  }
}

export const parsePersonaStateText = (text: string): PersonaState | null => {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }

  if (!isRecord(raw)) {
    return null
  }

  const defaults = buildDefaultPersonaState()
  if (
    !isString(raw.persona_id) ||
    !isString(raw.last_updated) ||
    !isString(raw.current_behavioral_narrative)
  ) {
    return null
  }

  const metrics = parseMetrics(raw.metrics, defaults.metrics)
  const stable = parseMetrics(raw.stable_preferences, metrics)
  const session = parseDelta(raw.session_hormones, defaults.session_hormones)
  const transient = parseDelta(raw.transient_state, defaults.transient_state)
  const buffer = parseBuffer(raw.recent_interaction_buffer)

  return {
    persona_id: raw.persona_id,
    last_updated: raw.last_updated,
    stable_preferences: stable,
    session_hormones: session,
    transient_state: transient,
    metrics,
    current_behavioral_narrative: raw.current_behavioral_narrative,
    recent_interaction_buffer: buffer,
    last_observation_id: isNumber(raw.last_observation_id) ? raw.last_observation_id : 0,
    evolution_turn: isNumber(raw.evolution_turn) ? raw.evolution_turn : 0
  }
}

const toState = (row: PersonaStateRecord): PersonaState => {
  const defaults = buildDefaultPersonaState()
  const metrics = {
    autonomy_level: row.autonomyLevel ?? defaults.metrics.autonomy_level,
    verbosity_index: row.verbosityIndex ?? defaults.metrics.verbosity_index,
    risk_tolerance: row.riskTolerance ?? defaults.metrics.risk_tolerance,
    formality_score: row.formalityScore ?? defaults.metrics.formality_score
  }

  return {
    persona_id: row.personaId || defaults.persona_id,
    last_updated: row.lastUpdated || defaults.last_updated,
    stable_preferences: parseMetrics(
      parseJson<Record<string, unknown>>(row.stablePreferencesJson || '', {}),
      metrics
    ),
    session_hormones: parseDelta(
      parseJson<Record<string, unknown>>(row.sessionHormonesJson || '', {}),
      defaults.session_hormones
    ),
    transient_state: parseDelta(
      parseJson<Record<string, unknown>>(row.transientStateJson || '', {}),
      defaults.transient_state
    ),
    metrics: parseMetrics(metrics, defaults.metrics),
    current_behavioral_narrative:
      row.currentBehavioralNarrative || defaults.current_behavioral_narrative,
    recent_interaction_buffer: parseBuffer(parseJson<unknown[]>(row.recentInteractionBufferJson || '[]', [])),
    last_observation_id: row.lastObservationId ?? 0,
    evolution_turn: row.evolutionTurn ?? 0
  }
}

const applyStateToRow = (row: PersonaStateRecord, state: PersonaState): PersonaStateRecord => {
  row.personaId = state.persona_id
  row.lastUpdated = state.last_updated
  row.autonomyLevel = state.metrics.autonomy_level
  row.verbosityIndex = state.metrics.verbosity_index
  row.riskTolerance = state.metrics.risk_tolerance
  row.formalityScore = state.metrics.formality_score
  row.currentBehavioralNarrative = state.current_behavioral_narrative
  row.recentInteractionBufferJson = JSON.stringify(state.recent_interaction_buffer ?? [])
  row.stablePreferencesJson = JSON.stringify(state.stable_preferences ?? createNeutralPersonaMetrics())
  row.sessionHormonesJson = JSON.stringify(state.session_hormones ?? createZeroPersonaDelta())
  row.transientStateJson = JSON.stringify(state.transient_state ?? createZeroPersonaDelta())
  row.lastObservationId = state.last_observation_id ?? 0
  row.evolutionTurn = state.evolution_turn ?? 0
  return row
}

const loadLegacyPersonaState = async (): Promise<PersonaState> => {
  try {
    const runtimeText = await readFile(getPersonaStatePath(), 'utf-8')
    const parsed = parsePersonaStateText(runtimeText)
    if (parsed) {
      return parsed
    }
  } catch {
    // ignore runtime file read errors
  }

  try {
    const fallbackText = await readFile(getPersonaStateFallbackPath(), 'utf-8')
    const parsed = parsePersonaStateText(fallbackText)
    if (parsed) {
      return parsed
    }
  } catch {
    // ignore fallback read errors
  }

  return buildDefaultPersonaState()
}

const getRepo = () => AppDataSource.getRepository(PersonaStateRecord)

export const initPersonaStorage = async (): Promise<void> => {
  const repo = getRepo()
  const existing = await repo.findOneBy({ id: PERSONA_STATE_ROW_ID })
  if (existing) {
    return
  }

  const row = repo.create({ id: PERSONA_STATE_ROW_ID })
  applyStateToRow(row, await loadLegacyPersonaState())
  await repo.save(row)
}

export const loadPersonaState = async (): Promise<PersonaState | null> => {
  await initPersonaStorage()
  const row = await getRepo().findOneBy({ id: PERSONA_STATE_ROW_ID })
  return row ? toState(row) : null
}

export const savePersonaState = async (state: PersonaState): Promise<void> => {
  const repo = getRepo()
  let row = await repo.findOneBy({ id: PERSONA_STATE_ROW_ID })
  if (!row) {
    row = repo.create({ id: PERSONA_STATE_ROW_ID })
  }
  applyStateToRow(row, state)
  await repo.save(row)
}

export const resetPersonaState = async (): Promise<void> => {
  await savePersonaState(buildDefaultPersonaState())
}

export const resetPersonaSessionDynamics = async (): Promise<void> => {
  const state = (await loadPersonaState()) ?? buildDefaultPersonaState()
  state.session_hormones = createZeroPersonaDelta()
  state.transient_state = createZeroPersonaDelta()
  state.metrics = { ...state.stable_preferences }
  state.current_behavioral_narrative = '默认人格状态'
  state.recent_interaction_buffer = []
  state.last_observation_id = 0
  state.evolution_turn = 0
  state.last_updated = new Date().toISOString()
  await savePersonaState(state)
}

export const applyImpact = (metrics: PersonaMetrics, impact: string): PersonaMetrics => {
  const match = impact.match(/([+-]?\d*\.?\d+)\s*(autonomy|verbosity|risk|formality)/i)
  if (!match) {
    return metrics
  }

  const delta = Number(match[1])
  const key = match[2].toLowerCase()
  if (!Number.isFinite(delta)) {
    return metrics
  }

  if (key === 'autonomy') {
    return { ...metrics, autonomy_level: clamp01(metrics.autonomy_level + delta) }
  }
  if (key === 'verbosity') {
    return { ...metrics, verbosity_index: clamp01(metrics.verbosity_index + delta) }
  }
  if (key === 'risk') {
    return { ...metrics, risk_tolerance: clamp01(metrics.risk_tolerance + delta) }
  }
  if (key === 'formality') {
    return { ...metrics, formality_score: clamp01(metrics.formality_score + delta) }
  }

  return metrics
}
