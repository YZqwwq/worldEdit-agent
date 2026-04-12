import type {
  MemoryLongTermSnapshot,
  MemoryStageSnapshot
} from '@share/cache/AItype/states/memoryState'
import type { MemorySlotSnapshot } from '@share/cache/AItype/states/memorySlots'

const uniqueRecent = (items: string[], limit = 8): string[] => {
  const normalized = items
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  return [...new Set(normalized)].slice(-limit)
}

const compact = (value: string, max = 220): string => {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ')
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

const combineLines = (items: string[], max = 280): string => {
  const text = items.map((item) => compact(item, max)).filter(Boolean).join('；')
  return compact(text, max)
}

const describeMemorySummary = (
  current: MemoryLongTermSnapshot,
  stage: MemoryStageSnapshot
): string => {
  const seeds = uniqueRecent([current.memorySummary, stage.summary], 4)
  return combineLines(seeds, 280)
}

const describeUserProfile = (
  current: MemoryLongTermSnapshot,
  stage: MemoryStageSnapshot,
  slots: MemorySlotSnapshot
): string => {
  const parts: string[] = []

  if (slots.conversation_state.conversation_mode) {
    parts.push(`当前更常处于${slots.conversation_state.conversation_mode}型交流`)
  }
  if (slots.conversation_state.interaction_state) {
    parts.push(`互动状态偏向${slots.conversation_state.interaction_state}`)
  }
  if (slots.user_mood.current_mood) {
    parts.push(`近期情绪表现为${slots.user_mood.current_mood}`)
  }

  const built = combineLines(parts, 240)
  if (built) {
    return built
  }

  if (current.userProfile) {
    return current.userProfile
  }

  const fallback = stage.summary
  return compact(fallback, 220)
}

export const createDefaultLongTermMemory = (): MemoryLongTermSnapshot => ({
  memorySummary: '',
  userProfile: '',
  updatedAt: ''
})

export const parseLongTermMemory = (input: string): MemoryLongTermSnapshot => {
  try {
    const parsed = JSON.parse(input) as Partial<MemoryLongTermSnapshot>

    return {
      ...createDefaultLongTermMemory(),
      memorySummary:
        typeof parsed.memorySummary === 'string' && parsed.memorySummary.trim()
          ? parsed.memorySummary.trim()
          : '',
      userProfile:
        typeof parsed.userProfile === 'string' && parsed.userProfile.trim()
          ? parsed.userProfile.trim()
          : '',
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : ''
    }
  } catch {
    return createDefaultLongTermMemory()
  }
}

export const mergeStageIntoLongTermMemory = (
  current: MemoryLongTermSnapshot,
  stage: MemoryStageSnapshot,
  slots: MemorySlotSnapshot
): MemoryLongTermSnapshot => {
  const next: MemoryLongTermSnapshot = {
    ...createDefaultLongTermMemory(),
    ...current
  }

  next.memorySummary = describeMemorySummary(next, stage)
  next.userProfile = describeUserProfile(next, stage, slots)
  next.updatedAt = stage.endedAt || new Date().toISOString()

  return next
}

export const renderLongTermMemory = (memory: MemoryLongTermSnapshot): string => {
  const lines: string[] = []

  if (memory.memorySummary) {
    lines.push(`记忆总体总结：${memory.memorySummary}`)
  }
  if (memory.userProfile) {
    lines.push(`用户画像：${memory.userProfile}`)
  }

  return lines.join('\n')
}
