import { existsSync } from 'node:fs'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { getAgentHabitsPath } from '../../../../../config/pathConfig'
import type {
  AgentHabit,
  AgentHabitScope
} from '../../../prompt/main_agent/persona/communicationHabits'

type AgentHabitState = {
  schemaVersion: 1
  revision: number
  habits: AgentHabit[]
}

const EMPTY_STATE: AgentHabitState = {
  schemaVersion: 1,
  revision: 0,
  habits: []
}

const isScope = (value: unknown): value is AgentHabitScope =>
  value === 'thinking' || value === 'communication' || value === 'tool_use'

const parseHabit = (value: unknown): AgentHabit | null => {
  if (!value || typeof value !== 'object') return null
  const habit = value as Record<string, unknown>
  if (
    typeof habit.key !== 'string' ||
    !habit.key.trim() ||
    !isScope(habit.scope) ||
    typeof habit.instruction !== 'string' ||
    !habit.instruction.trim() ||
    typeof habit.userRequestEvidence !== 'string' ||
    !habit.userRequestEvidence.trim() ||
    typeof habit.createdAt !== 'string' ||
    typeof habit.updatedAt !== 'string'
  ) {
    return null
  }
  return {
    key: habit.key.trim(),
    scope: habit.scope,
    instruction: habit.instruction.trim(),
    userRequestEvidence: habit.userRequestEvidence.trim(),
    createdAt: habit.createdAt,
    updatedAt: habit.updatedAt
  }
}

const parseState = (value: unknown): AgentHabitState => {
  if (!value || typeof value !== 'object') return { ...EMPTY_STATE, habits: [] }
  const state = value as Record<string, unknown>
  const habits = Array.isArray(state.habits)
    ? state.habits.map(parseHabit).filter((habit): habit is AgentHabit => habit !== null)
    : []
  return {
    schemaVersion: 1,
    revision:
      typeof state.revision === 'number' && Number.isSafeInteger(state.revision)
        ? Math.max(0, state.revision)
        : 0,
    habits
  }
}

export class AgentHabitStore {
  private readonly resolvePath: () => string

  constructor(resolvePath: () => string = getAgentHabitsPath) {
    this.resolvePath = resolvePath
  }

  private async loadState(): Promise<AgentHabitState> {
    const targetPath = this.resolvePath()
    if (!existsSync(targetPath)) return { ...EMPTY_STATE, habits: [] }
    try {
      return parseState(JSON.parse(await readFile(targetPath, 'utf-8')))
    } catch {
      return { ...EMPTY_STATE, habits: [] }
    }
  }

  private async saveState(state: AgentHabitState): Promise<void> {
    const targetPath = this.resolvePath()
    const temporaryPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`
    try {
      await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8')
      await rename(temporaryPath, targetPath)
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }

  async list(): Promise<AgentHabit[]> {
    return (await this.loadState()).habits.map((habit) => ({ ...habit }))
  }

  async set(input: {
    key: string
    scope: AgentHabitScope
    instruction: string
    userRequestEvidence: string
    nowIso?: string
  }): Promise<{ changed: boolean; revision: number; habit: AgentHabit }> {
    const state = await this.loadState()
    const nowIso = input.nowIso ?? new Date().toISOString()
    const key = input.key.trim()
    const index = state.habits.findIndex((habit) => habit.key === key)
    const previous = index >= 0 ? state.habits[index] : undefined
    const habit: AgentHabit = {
      key,
      scope: input.scope,
      instruction: input.instruction.trim(),
      userRequestEvidence: input.userRequestEvidence.trim(),
      createdAt: previous?.createdAt ?? nowIso,
      updatedAt: nowIso
    }
    const changed =
      !previous ||
      previous.scope !== habit.scope ||
      previous.instruction !== habit.instruction ||
      previous.userRequestEvidence !== habit.userRequestEvidence
    if (!changed) return { changed: false, revision: state.revision, habit: { ...previous } }

    const habits = [...state.habits]
    if (index >= 0) habits[index] = habit
    else habits.push(habit)
    const revision = state.revision + 1
    await this.saveState({ schemaVersion: 1, revision, habits })
    return { changed: true, revision, habit }
  }

  async remove(
    key: string
  ): Promise<{ changed: boolean; revision: number; removed: AgentHabit | null }> {
    const state = await this.loadState()
    const index = state.habits.findIndex((habit) => habit.key === key.trim())
    if (index < 0) return { changed: false, revision: state.revision, removed: null }
    const habits = [...state.habits]
    const [removed] = habits.splice(index, 1)
    const revision = state.revision + 1
    await this.saveState({ schemaVersion: 1, revision, habits })
    return { changed: true, revision, removed }
  }
}

export const agentHabitStore = new AgentHabitStore()
