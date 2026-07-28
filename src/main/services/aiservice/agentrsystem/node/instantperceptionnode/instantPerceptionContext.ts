import { HumanMessage } from '@langchain/core/messages'
import { contentToText } from '../../../messageoutput/transformRespones'
import { memoryManager } from '../../manager/memory/MemoryManager'
import { MessagesState } from '../../state/messageState'

export type RecentDialogueMessage = {
  role: 'user' | 'assistant'
  text: string
}

export type InstantPerceptionContext = {
  currentUserText: string
  recentDialogue: RecentDialogueMessage[]
}

const RECENT_DIALOGUE_MESSAGE_LIMIT = 4

const compact = (value: string, max = 420): string => {
  const normalized = String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

const getCurrentUserText = (state: typeof MessagesState.State): string => {
  const message = state.messages
    .slice()
    .reverse()
    .find((item) => item instanceof HumanMessage && !item.additional_kwargs?.isHistory)
  return message ? contentToText(message.content).trim() : ''
}

export const buildInstantPerceptionContext = async (
  state: typeof MessagesState.State
): Promise<InstantPerceptionContext> => {
  const currentUserText = getCurrentUserText(state)
  const snapshot = await memoryManager.getSnapshot()
  const recentDialogue = snapshot.shortTerm
    .slice(-RECENT_DIALOGUE_MESSAGE_LIMIT)
    .map(
      (message): RecentDialogueMessage => ({
        role: message.role === 'ai' ? 'assistant' : 'user',
        text: compact(message.content)
      })
    )
    .filter((message) => message.text.length > 0)

  if (currentUserText) {
    recentDialogue.push({
      role: 'user',
      text: compact(currentUserText)
    })
  }

  return {
    currentUserText,
    recentDialogue
  }
}
