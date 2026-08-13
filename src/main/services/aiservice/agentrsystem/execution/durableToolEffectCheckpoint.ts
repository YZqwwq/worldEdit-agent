import { messagesStateReducer } from '@langchain/langgraph'
import type { MessagesState } from '../state/messageState'

const mergeUniqueStrings = (left: string[] | undefined, right: string[] | undefined): string[] =>
  [...new Set([...(left ?? []), ...(right ?? [])])]

export const buildDurableToolEffectCheckpointState = (
  state: typeof MessagesState.State,
  update: Partial<typeof MessagesState.State>
): typeof MessagesState.State => ({
  ...state,
  ...update,
  resumeFromNode: undefined,
  messages: messagesStateReducer(state.messages, update.messages ?? []),
  activeToolsets: mergeUniqueStrings(state.activeToolsets, update.activeToolsets),
  activeTools: mergeUniqueStrings(state.activeTools, update.activeTools)
})
