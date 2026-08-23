import { HumanMessage } from '@langchain/core/messages'
import { contentToText } from '../../../messageoutput/transformRespones'
import { memoryManager } from '../../manager/memory/MemoryManager'
import { MessagesState } from '../../state/messageState'

export type RecentDialogueMessage = {
  role: 'user' | 'assistant'
  text: string
}

export type InstantPerceptionContext = {
  currentEventText: string
  source: 'user' | 'subagent' | 'system'
  recentHistory: RecentDialogueMessage[]
}

const RECENT_DIALOGUE_MESSAGE_LIMIT = 8

const compact = (value: string, max = 420): string => {
  const normalized = String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

const getCurrentEventText = (state: typeof MessagesState.State): string => {
  if (state.turnInput) return state.turnInput.content.trim()
  const message = state.messages
    .slice()
    .reverse()
    .find((item) => item instanceof HumanMessage && !item.additional_kwargs?.isHistory)
  return message ? contentToText(message.content).trim() : ''
}

export const buildInstantPerceptionContext = async (
  state: typeof MessagesState.State
): Promise<InstantPerceptionContext> => {
  const currentEventText = getCurrentEventText(state)
  const snapshot = await memoryManager.getSnapshot()
  const recentHistory = snapshot.shortTerm
    .slice(-RECENT_DIALOGUE_MESSAGE_LIMIT)
    .map(
      (message): RecentDialogueMessage => ({
        role: message.role === 'ai' ? 'assistant' : 'user',
        text: compact(message.content)
      })
    )
    .filter((message) => message.text.length > 0)

  return {
    currentEventText,
    source: state.turnInput?.source ?? 'user',
    recentHistory
  }
}
