import type {
  MemoryLongTermSnapshot,
  MemoryStageSnapshot
} from '@share/cache/AItype/states/memoryState'

const compact = (value: string, max = 160): string => {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ')
  if (!normalized) return ''
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

export const buildLongTermMemoryPrompt = (memory: MemoryLongTermSnapshot | null | undefined): string => {
  if (!memory) return ''

  const lines: string[] = []
  if (memory.memorySummary) lines.push(`记忆总体总结：${memory.memorySummary}`)
  if (memory.userProfile) lines.push(`用户画像：${memory.userProfile}`)
  return lines.join('\n')
}

export const buildRecentStagePrompt = (stages: MemoryStageSnapshot[] | null | undefined): string => {
  if (!stages?.length) return ''

  return stages
    .slice(0, 3)
    .map((stage) => {
      const parts = [
        `阶段 #${stage.stageIndex}`,
        stage.summary ? `摘要：${compact(stage.summary, 180)}` : '',
        stage.moodLabel ? `阶段氛围：${stage.moodLabel}` : ''
      ].filter(Boolean)
      return parts.join('\n')
    })
    .join('\n\n')
}
