import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { StateData } from '../../share/cache/AItype/states/memoryState'
import type { PersonaState } from '../../share/cache/AItype/states/personalState'
import {
  getHistoryStatePath,
  getShortTermPath,
  getHistoryRawPath,
  getPersonaStatePath,
  getPersonaStateFallbackPath,
  getStaticUploadDir
} from './pathConfig'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isNumber = (value: unknown): value is number => typeof value === 'number'

const isString = (value: unknown): value is string => typeof value === 'string'

const defaultState = (): StateData => ({
  session_id: 'default',
  created_at: new Date().toISOString(),
  counters: { total_turns: 0, window_turns: 0, since_last_compress: 0 },
  last_compress_time: '',
  compress_strategy: 'time_based',
  api_status: 'healthy',
  anchors: [],
  compress_threshold: 6,
  compress_min_interval_ms: 0,
  short_term_limit: 6
})

const defaultPersonaState = (): PersonaState => ({
  persona_id: 'default',
  last_updated: new Date().toISOString(),
  metrics: {
    autonomy_level: 0.5,
    verbosity_index: 0.5,
    risk_tolerance: 0.5,
    formality_score: 0.5
  },
  current_behavioral_narrative: '默认人格状态',
  recent_interaction_buffer: []
})

const isValidState = (value: unknown): value is StateData => {
  if (!isRecord(value)) return false
  if (!isRecord(value.counters)) return false
  return (
    isString(value.session_id) &&
    isString(value.created_at) &&
    isNumber(value.counters.total_turns) &&
    isNumber(value.counters.window_turns) &&
    isNumber(value.counters.since_last_compress) &&
    isString(value.last_compress_time) &&
    isString(value.compress_strategy) &&
    isString(value.api_status)
  )
}

export const initMemoryStorage = (): void => {
  const statePath = getHistoryStatePath()
  if (!existsSync(statePath)) {
    writeFileSync(statePath, JSON.stringify(defaultState(), null, 2), 'utf-8')
  } else {
    try {
      const raw = readFileSync(statePath, 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      if (!isValidState(parsed)) {
        writeFileSync(statePath, JSON.stringify(defaultState(), null, 2), 'utf-8')
      }
    } catch {
      writeFileSync(statePath, JSON.stringify(defaultState(), null, 2), 'utf-8')
    }
  }

  const shortTermPath = getShortTermPath()
  if (!existsSync(shortTermPath)) {
    writeFileSync(shortTermPath, '[]', 'utf-8')
  } else {
    try {
      const raw = readFileSync(shortTermPath, 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) {
        writeFileSync(shortTermPath, '[]', 'utf-8')
      }
    } catch {
      writeFileSync(shortTermPath, '[]', 'utf-8')
    }
  }

  const rawPath = getHistoryRawPath()
  if (!existsSync(rawPath)) {
    writeFileSync(rawPath, '', 'utf-8')
  }

  const personaPath = getPersonaStatePath()
  if (!existsSync(personaPath)) {
    const fallbackPath = getPersonaStateFallbackPath()
    if (existsSync(fallbackPath)) {
      const text = readFileSync(fallbackPath, 'utf-8')
      writeFileSync(personaPath, text, 'utf-8')
    } else {
      writeFileSync(personaPath, JSON.stringify(defaultPersonaState(), null, 2), 'utf-8')
    }
  }

  getStaticUploadDir()
}
