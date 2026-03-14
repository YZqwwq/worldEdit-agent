import { readFile } from 'node:fs/promises'
import type { PersonaState, PersonaMetrics, PersonaBufferItem } from '@share/cache/AItype/states/personalState'
import { AppDataSource } from '../../../../../database'
import { PersonaStateRecord } from '../../../../../../share/entity/database/PersonaStateRecord'
import {
  getRolePromptPath,
  getPersonaStatePath,
  getPersonaStateFallbackPath
} from '../../../../../config/pathConfig'

const PERSONA_STATE_ROW_ID = 1

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isNumber = (value: unknown): value is number => typeof value === 'number'

const isString = (value: unknown): value is string => typeof value === 'string'

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

// 应用影响到指标
const applyImpact = (metrics: PersonaMetrics, impact: string): PersonaMetrics => {
  const match = impact.match(/([+-]?\d*\.?\d+)\s*(autonomy|verbosity|risk|formality)/i)
  if (!match) return metrics
  const delta = Number(match[1])
  const key = match[2].toLowerCase()
  if (!Number.isFinite(delta)) return metrics
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

// 解析 PersonaState 文本
export const parsePersonaStateText = (text: string): PersonaState | null => {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(raw)) return null
  const metrics = raw.metrics
  const buffer = raw.recent_interaction_buffer
  if (!isRecord(metrics) || !Array.isArray(buffer)) return null
  if (
    !isString(raw.persona_id) ||
    !isString(raw.last_updated) ||
    !isString(raw.current_behavioral_narrative) ||
    !isNumber(metrics.autonomy_level) ||
    !isNumber(metrics.verbosity_index) ||
    !isNumber(metrics.risk_tolerance) ||
    !isNumber(metrics.formality_score)
  ) {
    return null
  }
  const parsedBuffer: PersonaBufferItem[] = []
  for (const item of buffer) {
    if (!isRecord(item)) return null
    if (!isNumber(item.turn) || !isString(item.user_signal) || !isString(item.impact)) return null
    parsedBuffer.push({ turn: item.turn, user_signal: item.user_signal, impact: item.impact })
  }
  return {
    persona_id: raw.persona_id,
    last_updated: raw.last_updated,
    metrics: {
      autonomy_level: metrics.autonomy_level,
      verbosity_index: metrics.verbosity_index,
      risk_tolerance: metrics.risk_tolerance,
      formality_score: metrics.formality_score
    },
    current_behavioral_narrative: raw.current_behavioral_narrative,
    recent_interaction_buffer: parsedBuffer
  }
}

const parseBuffer = (json: string): PersonaBufferItem[] => {
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof item.turn === 'number' &&
        typeof item.user_signal === 'string' &&
        typeof item.impact === 'string'
    ) as PersonaBufferItem[]
  } catch {
    return []
  }
}

const toState = (row: PersonaStateRecord): PersonaState => ({
  persona_id: row.personaId || 'default',
  last_updated: row.lastUpdated || new Date().toISOString(),
  metrics: {
    autonomy_level: row.autonomyLevel ?? 0.5,
    verbosity_index: row.verbosityIndex ?? 0.5,
    risk_tolerance: row.riskTolerance ?? 0.5,
    formality_score: row.formalityScore ?? 0.5
  },
  current_behavioral_narrative: row.currentBehavioralNarrative || '默认人格状态',
  recent_interaction_buffer: parseBuffer(row.recentInteractionBufferJson || '[]')
})

const applyStateToRow = (row: PersonaStateRecord, state: PersonaState): PersonaStateRecord => {
  row.personaId = state.persona_id
  row.lastUpdated = state.last_updated
  row.autonomyLevel = state.metrics.autonomy_level
  row.verbosityIndex = state.metrics.verbosity_index
  row.riskTolerance = state.metrics.risk_tolerance
  row.formalityScore = state.metrics.formality_score
  row.currentBehavioralNarrative = state.current_behavioral_narrative
  row.recentInteractionBufferJson = JSON.stringify(state.recent_interaction_buffer ?? [])
  return row
}

const loadLegacyPersonaState = async (): Promise<PersonaState> => {
  try {
    const runtimeText = await readFile(getPersonaStatePath(), 'utf-8')
    const parsed = parsePersonaStateText(runtimeText)
    if (parsed) return parsed
  } catch {
    // ignore legacy read error
  }
  try {
    const fallbackText = await readFile(getPersonaStateFallbackPath(), 'utf-8')
    const parsed = parsePersonaStateText(fallbackText)
    if (parsed) return parsed
  } catch {
    // ignore fallback read error
  }
  return defaultPersonaState()
}

const getRepo = () => AppDataSource.getRepository(PersonaStateRecord)

export const initPersonaStorage = async (): Promise<void> => {
  const repo = getRepo()
  const existing = await repo.findOneBy({ id: PERSONA_STATE_ROW_ID })
  if (existing) return

  const state = await loadLegacyPersonaState()
  const row = repo.create({ id: PERSONA_STATE_ROW_ID })
  applyStateToRow(row, state)
  await repo.save(row)
}

// 加载角色提示
export const loadRolePrompt = async (): Promise<string | null> => {
  try {
    const text = await readFile(getRolePromptPath(), 'utf-8')
    const trimmed = text?.trim()
    return trimmed ? trimmed : null
  } catch {
    return null
  }
}

// 加载 PersonaState
export const loadPersonaState = async (): Promise<PersonaState | null> => {
  await initPersonaStorage()
  const row = await getRepo().findOneBy({ id: PERSONA_STATE_ROW_ID })
  return row ? toState(row) : null
}

// 保存 PersonaState
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
  const state = defaultPersonaState()
  await savePersonaState(state)
}

// 进化 PersonaState
export const evolvePersonaState = (
  state: PersonaState,
  signal?: PersonaBufferItem,
  nowIso = new Date().toISOString()
): PersonaState => {
  const metrics = signal ? applyImpact(state.metrics, signal.impact) : state.metrics
  const buffer = signal
    ? [...state.recent_interaction_buffer, signal].slice(-20)
    : [...state.recent_interaction_buffer]
  return {
    ...state,
    metrics,
    recent_interaction_buffer: buffer,
    last_updated: nowIso
  }
}

// 格式化 PersonaState 为字符串
export const formatPersonaState = (personaState: PersonaState): string => {
  return `人格倾向状态:\n${personaState.current_behavioral_narrative}`
}
