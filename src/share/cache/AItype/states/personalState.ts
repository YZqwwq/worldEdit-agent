import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface PersonaMetrics {
  autonomy_level: number
  verbosity_index: number
  risk_tolerance: number
  formality_score: number
}

export interface PersonaBufferItem {
  turn: number
  user_signal: string
  impact: string
}

export interface PersonaState {
  persona_id: string
  last_updated: string
  metrics: PersonaMetrics
  current_behavioral_narrative: string
  recent_interaction_buffer: PersonaBufferItem[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isNumber = (value: unknown): value is number => typeof value === 'number'

const isString = (value: unknown): value is string => typeof value === 'string'

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

export const loadRolePrompt = async (projectRoot: string): Promise<string | null> => {
  try {
    const rolePromptPath = join(projectRoot, 'src/main/prompt-resource/famila-daily/role/roleprompt.md')
    const text = await readFile(rolePromptPath, 'utf-8')
    const trimmed = text?.trim()
    return trimmed ? trimmed : null
  } catch {
    return null
  }
}

export const loadPersonaState = async (projectRoot: string): Promise<PersonaState | null> => {
  try {
    const personaStatePath = join(projectRoot, 'src/main/prompt-resource/famila-daily/role/persona_state.json')
    const personaStateText = await readFile(personaStatePath, 'utf-8')
    return parsePersonaStateText(personaStateText)
  } catch {
    return null
  }
}

export const formatPersonaState = (personaState: PersonaState): string => {
  const m = personaState.metrics
  return (
    `人格倾向状态:\n${personaState.current_behavioral_narrative}\n` +
    `metrics: autonomy_level=${m.autonomy_level}, verbosity_index=${m.verbosity_index}, ` +
    `risk_tolerance=${m.risk_tolerance}, formality_score=${m.formality_score}`
  )
}
