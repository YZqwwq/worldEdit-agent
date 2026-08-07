import {
  describeConversationMode,
  describeInteractionState,
  describeWorldFocusType,
  type MemorySlotSnapshot
} from '@share/cache/AItype/states/memorySlots'

type BuildMemorySlotPromptOptions = {
  includeWorldFocus?: boolean
  worldFocusAsBackground?: boolean
}

const buildMemorySlotLines = (
  slots: MemorySlotSnapshot | null | undefined,
  options: BuildMemorySlotPromptOptions = {}
): string[] => {
  if (!slots) return []

  const includeWorldFocus = options.includeWorldFocus ?? true
  const worldFocusAsBackground = options.worldFocusAsBackground ?? false
  const lines: string[] = []

  if (slots.conversation_state.conversation_mode) {
    lines.push(
      `当前对话模式：${describeConversationMode(slots.conversation_state.conversation_mode)}`
    )
  }
  if (slots.conversation_state.interaction_state) {
    lines.push(
      `当前互动状态：${describeInteractionState(slots.conversation_state.interaction_state)}`
    )
  }
  if (
    includeWorldFocus &&
    slots.world_focus.status === 'resolved' &&
    slots.world_focus.focuses.length > 0
  ) {
    if (slots.world_focus.focuses.length === 1) {
      const focus = slots.world_focus.focuses[0]
      lines.push(
        `${worldFocusAsBackground ? '上一轮可能仍相关的世界观焦点背景（本轮未确认）' : '当前世界观焦点'}：世界观「${focus.worldName}」，` +
          `${describeWorldFocusType(focus.focusType)}「${focus.entityName}」。`
      )
    } else {
      lines.push(
        `${worldFocusAsBackground ? '上一轮可能仍相关的世界观焦点组背景（本轮未确认）' : '当前世界观焦点组'}：${slots.world_focus.focuses
          .map(
            (focus) =>
              `${focus.role}:${focus.worldName}/${describeWorldFocusType(focus.focusType)}「${
                focus.entityName
              }」`
          )
          .join('；')}。`
      )
    }
  }

  return lines
}

export const buildMemorySlotPrompt = (
  slots: MemorySlotSnapshot | null | undefined,
  options: BuildMemorySlotPromptOptions = {}
): string => {
  const lines = buildMemorySlotLines(slots, options)
  return lines.join('\n')
}
