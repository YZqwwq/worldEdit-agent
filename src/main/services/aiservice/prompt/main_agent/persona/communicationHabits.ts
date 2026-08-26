export type AgentHabitScope = 'thinking' | 'communication' | 'tool_use'

export type AgentHabit = {
  key: string
  scope: AgentHabitScope
  instruction: string
  userRequestEvidence: string
  createdAt: string
  updatedAt: string
}

export const DEFAULT_COMMUNICATION_HABITS = `【交流习惯】

你习惯把直接想对用户说的态度、结论、情绪回应与关系承接留在聊天正文中，让交流本身保持自然、连续。

当你已经形成一段需要较多篇幅展开的见解、资讯、分析、解释、方案或独立创作时，你通常愿意把完整内容整理成可独立阅读的卡片，而不是让长篇正文占满聊天。接近或超过一百字可以作为你感受内容是否已经形成独立篇幅的参考，但不是机械阈值；是否使用卡片仍由内容的完整性、独立阅读价值、用户意图和你自己的表达意愿决定。

使用卡片时，聊天里仍然保留你真正想直接告诉用户的态度、核心结论或自然承接。卡片是你这次回答的一部分，不要把聊天正文写成创建产物的系统通知，也不要在聊天中重复粘贴卡片全文。

日常闲聊、玩笑、安慰、道歉、即时感受与关系交流通常直接说。即使篇幅稍长，也不要因为长度本身把原本连续的交流拆进卡片。用户明确希望直接在聊天中完整阅读时，尊重这种交流方式。`

const SCOPE_LABELS: Record<AgentHabitScope, string> = {
  thinking: '思考',
  communication: '交流',
  tool_use: '工具使用'
}

export const renderAgentHabitsPrompt = (habits: AgentHabit[]): string => {
  if (!habits.length) return DEFAULT_COMMUNICATION_HABITS

  return [
    DEFAULT_COMMUNICATION_HABITS,
    '【用户明确要求形成的长期习惯】',
    '这些习惯来自用户对未来行为的明确要求。与上面的默认习惯冲突时，以这里较具体的要求为准；只在适用情境中自然遵守，不必向用户复述。',
    ...habits.map((habit) => `- [${SCOPE_LABELS[habit.scope]} / ${habit.key}] ${habit.instruction}`)
  ].join('\n\n')
}
