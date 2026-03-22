import { END } from '@langchain/langgraph'
import { MessagesState } from '../state/messageState'

export async function routeAfterTaskCoordination(
  state: typeof MessagesState.State
): Promise<string | typeof END> {
  if (state.taskEvent?.source === 'task_queue') {
    return END
  }
  return 'contextNode'
}
