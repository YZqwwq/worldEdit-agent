import type { MessagesState } from '../state/messageState'
import { mainAgentTurnVersionService } from '../../runtime/version/mainAgentTurnVersionService'
import type { MainAgentResumePoint } from '../../runtime/version/turnVersionSnapshot'

export const withTurnVersionBoundary = <TResult>(
  nodeName: MainAgentResumePoint,
  node: (state: typeof MessagesState.State) => Promise<TResult>
) => async (state: typeof MessagesState.State): Promise<TResult> => {
  await mainAgentTurnVersionService.checkpointBeforeNode(nodeName, state)
  return node(state)
}
