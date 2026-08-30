import { END, START, StateGraph } from '@langchain/langgraph'
import { MessagesState } from './state/messageState'
import { cognitionNode } from './node/modelnode/modelnode'
import { toolNode } from './node/toolnode/toolnode'
import { toolContextReloadNode } from './node/toolcontextreloadnode/toolContextReloadNode'
import { contextNode } from './node/contextnode/contextnode'
import { memoryNode } from './node/memorynode/memorynode'
import { instantPerceptionNode } from './node/instantperceptionnode/instantPerceptionNode'
import { shouldContinue } from './endlogic/shouldContinue'
import { withNodeTrace } from '../../log/trace/withNodeTrace'
import { withTurnVersionBoundary } from './execution/withTurnVersionBoundary'
import { expressionNode } from './node/finalanswernode/finalAnswerNode'
import { outputGuardNode } from './node/outputguardnode/outputGuardNode'

const expressionToolNode = toolNode
const routeAfterToolReload = (state: typeof MessagesState.State) =>
  state.activeToolPhase === 'expression' ? 'expressionNode' : 'cognitionNode'
const routeAfterExpression = (state: typeof MessagesState.State) =>
  state.loopDirective === 'compose_expression_tools' ? 'expressionToolNode' : 'outputGuardNode'

const versionedNode = <TResult>(
  name: Parameters<typeof withTurnVersionBoundary>[0],
  node: (state: typeof MessagesState.State, config?: { signal?: AbortSignal }) => Promise<TResult>
) => withTurnVersionBoundary(name, withNodeTrace(name, node))

const routeTurnStart = (state: typeof MessagesState.State) =>
  state.resumeFromNode ?? 'instantPerceptionNode'

export const agent = new StateGraph(MessagesState)
  .addNode('instantPerceptionNode', versionedNode('instantPerceptionNode', instantPerceptionNode))
  .addNode('contextNode', versionedNode('contextNode', contextNode))
  .addNode('cognitionNode', versionedNode('cognitionNode', cognitionNode))
  .addNode('expressionNode', versionedNode('expressionNode', expressionNode))
  .addNode('expressionToolNode', versionedNode('expressionToolNode', expressionToolNode))
  .addNode('outputGuardNode', versionedNode('outputGuardNode', outputGuardNode))
  .addNode('toolNode', versionedNode('toolNode', toolNode))
  .addNode('toolContextReloadNode', versionedNode('toolContextReloadNode', toolContextReloadNode))
  .addNode('memoryNode', versionedNode('memoryNode', memoryNode))
  .addConditionalEdges(START, routeTurnStart, [
    'instantPerceptionNode',
    'contextNode',
    'cognitionNode',
    'expressionNode',
    'expressionToolNode',
    'outputGuardNode',
    'toolNode',
    'toolContextReloadNode',
    'memoryNode'
  ])
  .addEdge('instantPerceptionNode', 'contextNode')
  .addEdge('contextNode', 'cognitionNode')
  .addConditionalEdges('cognitionNode', shouldContinue, ['cognitionNode', 'toolNode', 'expressionNode'])
  .addEdge('toolNode', 'toolContextReloadNode')
  .addConditionalEdges('toolContextReloadNode', routeAfterToolReload, ['cognitionNode', 'expressionNode'])
  .addConditionalEdges('expressionNode', routeAfterExpression, ['expressionToolNode', 'outputGuardNode'])
  .addEdge('expressionToolNode', 'toolContextReloadNode')
  .addEdge('outputGuardNode', 'memoryNode')
  .addEdge('memoryNode', END)
  .compile()
