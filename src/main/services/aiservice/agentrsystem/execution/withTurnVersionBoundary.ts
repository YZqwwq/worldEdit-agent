import type { MessagesState } from '../state/messageState'
import { mainAgentTurnVersionService } from '../../runtime/version/mainAgentTurnVersionService'
import type { MainAgentResumePoint } from '../../runtime/version/turnVersionSnapshot'

export const withTurnVersionBoundary = <TResult, TConfig = unknown>(
  nodeName: MainAgentResumePoint,
  node: (state: typeof MessagesState.State, config?: TConfig) => Promise<TResult>
) => async (state: typeof MessagesState.State, config?: TConfig): Promise<TResult> => {
  await mainAgentTurnVersionService.checkpointBeforeNode(nodeName, state)
  return node(state, config)
}
