import type { MemorySnapshot } from '@share/cache/AItype/states/memoryState'
import type { MemorySlotSnapshot } from '@share/cache/AItype/states/memorySlots'
import { buildMemorySlotPrompt } from '../../../prompt/main_agent/agentPromptService'

export type MemoryPromptPlan = {
  slotPrompt: string
}

export type MemoryPromptPlanOptions = {
  includeWorldFocus?: boolean
}

export const buildMemoryPromptPlan = (
  memory: MemorySnapshot,
  slots: MemorySlotSnapshot,
  options: MemoryPromptPlanOptions = {}
): MemoryPromptPlan => {
  void memory

  const slotPrompt = buildMemorySlotPrompt(slots, {
    includeWorldFocus: options.includeWorldFocus
  })

  return {
    slotPrompt
  }
}
