import {
  describeConversationMode,
  describeInteractionState,
  type MemorySlotSnapshot
} from '@share/cache/AItype/states/memorySlots'

const buildMemorySlotLines = (slots: MemorySlotSnapshot | null | undefined): string[] => {
  if (!slots) return []

  const lines: string[] = []

  if (slots.conversation_state.conversation_mode) {
    lines.push(`当前对话模式：${describeConversationMode(slots.conversation_state.conversation_mode)}`)
  }
  if (slots.conversation_state.interaction_state) {
    lines.push(`当前互动状态：${describeInteractionState(slots.conversation_state.interaction_state)}`)
  }

  return lines
}

export const buildMemorySlotPrompt = (slots: MemorySlotSnapshot | null | undefined): string => {
  const lines = buildMemorySlotLines(slots)
  return lines.join('\n')
}
