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
  if (memory.memorySummary || memory.userProfile) {
    lines.push(
      '使用规则：以下是跨轮长期记忆，代表先前对话中已经确认或形成的连续性背景；当用户延续相关话题时，必须优先纳入这些记忆，不要只依赖模型参数中的旧知识。若记忆与通用知识冲突，应先承认记忆中的先前结论，并在需要时再说明可重新核验。'
    )
  }
  if (memory.memorySummary) lines.push(`记忆总体总结：${memory.memorySummary}`)
  if (memory.userProfile) lines.push(`用户画像：${memory.userProfile}`)
  return lines.join('\n')
}

export const buildRecentStagePrompt = (stages: MemoryStageSnapshot[] | null | undefined): string => {
  if (!stages?.length) return ''

  const renderedStages = stages
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

  return [
    '使用规则：以下是近期已归档阶段，常用于补足短期滑动窗口已经移出的上下文；当用户继续追问同一主题时，必须先检查这里是否已有结论，再决定是否需要重新查询或纠正。',
    renderedStages
  ].join('\n\n')
}
