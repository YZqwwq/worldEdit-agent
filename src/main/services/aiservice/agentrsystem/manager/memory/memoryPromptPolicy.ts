import type { MemorySnapshot } from '@share/cache/AItype/states/memoryState'
import type { MemorySlotSnapshot } from '@share/cache/AItype/states/memorySlots'
import { buildMemorySlotPrompt } from '../../../prompt/main_agent/agentPromptService'
import {
  buildLongTermMemoryPrompt,
  buildRecentStagePrompt
} from './memoryContextFormatter'

export type MemoryPromptPlan = {
  longTermPrompt: string
  slotPrompt: string
  recentStagePrompt: string
}

export const buildMemoryPromptPlan = (
  memory: MemorySnapshot,
  slots: MemorySlotSnapshot
): MemoryPromptPlan => {
  const longTermPrompt = buildLongTermMemoryPrompt(memory.longTerm)

  const slotPrompt = buildMemorySlotPrompt(slots)

  const recentStagePrompt =
    memory.recentStages.length > 0
      ? buildRecentStagePrompt(memory.recentStages.slice(0, 3))
      : ''

  return {
    longTermPrompt,
    slotPrompt,
    recentStagePrompt
  }
}
