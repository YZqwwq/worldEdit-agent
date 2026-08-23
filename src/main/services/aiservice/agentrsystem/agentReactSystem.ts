import { END, START, StateGraph } from '@langchain/langgraph'
import { MessagesState } from './state/messageState'
import { llmCall } from './node/modelnode/modelnode'
import { toolNode } from './node/toolnode/toolnode'
import { toolContextReloadNode } from './node/toolcontextreloadnode/toolContextReloadNode'
import { contextNode } from './node/contextnode/contextnode'
import { memoryNode } from './node/memorynode/memorynode'
import { instantPerceptionNode } from './node/instantperceptionnode/instantPerceptionNode'
import { shouldContinue } from './endlogic/shouldContinue'
import { withNodeTrace } from '../../log/trace/withNodeTrace'
import { withTurnVersionBoundary } from './execution/withTurnVersionBoundary'
import { finalAnswerNode } from './node/finalanswernode/finalAnswerNode'
import { outputGuardNode } from './node/outputguardnode/outputGuardNode'

const versionedNode = <TResult>(
  name: Parameters<typeof withTurnVersionBoundary>[0],
  node: (
    state: typeof MessagesState.State,
    config?: { signal?: AbortSignal }
  ) => Promise<TResult>
) => withTurnVersionBoundary(name, withNodeTrace(name, node))

const routeTurnStart = (state: typeof MessagesState.State) =>
  state.resumeFromNode ?? 'instantPerceptionNode'

export const agent = new StateGraph(MessagesState)
  .addNode('instantPerceptionNode', versionedNode('instantPerceptionNode', instantPerceptionNode))
  .addNode('contextNode', versionedNode('contextNode', contextNode))
  .addNode('llmCall', versionedNode('llmCall', llmCall))
  .addNode('finalAnswerNode', versionedNode('finalAnswerNode', finalAnswerNode))
  .addNode('outputGuardNode', versionedNode('outputGuardNode', outputGuardNode))
  .addNode('toolNode', versionedNode('toolNode', toolNode))
  .addNode('toolContextReloadNode', versionedNode('toolContextReloadNode', toolContextReloadNode))
  .addNode('memoryNode', versionedNode('memoryNode', memoryNode))
  .addConditionalEdges(START, routeTurnStart, [
    'instantPerceptionNode',
    'contextNode',
    'llmCall',
    'finalAnswerNode',
    'outputGuardNode',
    'toolNode',
    'toolContextReloadNode',
    'memoryNode'
  ])
  .addEdge('instantPerceptionNode', 'contextNode')
  .addEdge('contextNode', 'llmCall')
  .addConditionalEdges('llmCall', shouldContinue, [
    'llmCall',
    'toolNode',
    'finalAnswerNode',
    'outputGuardNode'
  ])
  .addEdge('toolNode', 'toolContextReloadNode')
  .addEdge('toolContextReloadNode', 'llmCall')
  .addEdge('finalAnswerNode', 'outputGuardNode')
  .addEdge('outputGuardNode', 'memoryNode')
  .addEdge('memoryNode', END)
  .compile()
