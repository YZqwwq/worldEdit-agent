import { readFile, writeFile } from 'node:fs/promises'
import type { PersonaState, PersonaMetrics, PersonaBufferItem } from '@share/cache/AItype/states/personalState'
import {
  getRolePromptPath,
  getPersonaStatePath,
  getPersonaStateFallbackPath
} from '../../../../../config/pathConfig'

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
  try {
    const personaStateText = await readFile(getPersonaStatePath(), 'utf-8')
    const parsed = parsePersonaStateText(personaStateText)
    if (parsed) return parsed
  } catch {}
  try {
    const fallbackText = await readFile(getPersonaStateFallbackPath(), 'utf-8')
    const parsed = parsePersonaStateText(fallbackText)
    if (!parsed) return null
    try {
      await writeFile(getPersonaStatePath(), JSON.stringify(parsed, null, 2), 'utf-8')
    } catch {}
    return parsed
  } catch {
    return null
  }
}

// 保存 PersonaState
export const savePersonaState = async (state: PersonaState): Promise<void> => {
  await writeFile(getPersonaStatePath(), JSON.stringify(state, null, 2), 'utf-8')
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
  const m = personaState.metrics
  return (
    `人格倾向状态:\n${personaState.current_behavioral_narrative}\n` +
    `metrics: autonomy_level=${m.autonomy_level}, verbosity_index=${m.verbosity_index}, ` +
    `risk_tolerance=${m.risk_tolerance}, formality_score=${m.formality_score}`
  )
}
