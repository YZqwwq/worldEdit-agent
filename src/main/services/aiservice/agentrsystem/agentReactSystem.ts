import { END, START, StateGraph } from '@langchain/langgraph'
import { MessagesState } from './state/messageState'
import { llmCall } from './node/modelnode/modelnode'
import { toolNode } from './node/toolnode/toolnode'
import { toolContextReloadNode } from './node/toolcontextreloadnode/toolContextReloadNode'
import { contextNode } from './node/contextnode/contextnode' // 导入 ContextNode
import { memoryNode } from './node/memorynode/memorynode' // 导入 MemoryNode
import { instantPerceptionNode } from './node/instantperceptionnode/instantPerceptionNode'
import { shouldContinue } from './endlogic/shouldContinue'
import { withNodeTrace } from '../../log/trace/withNodeTrace'
import { withTurnVersionBoundary } from './execution/withTurnVersionBoundary'
import { expressionNode } from './node/expressionnode/expressionNode'
import { cognitionRevisionNode } from './node/cognitionrevisionnode/cognitionRevisionNode'

const versionedNode = <TResult>(
  name: Parameters<typeof withTurnVersionBoundary>[0],
  node: (
    state: typeof MessagesState.State,
    config?: { signal?: AbortSignal }
  ) => Promise<TResult>
) => withTurnVersionBoundary(name, withNodeTrace(name, node))

const routeTurnStart = (state: typeof MessagesState.State) =>
  state.resumeFromNode ?? 'instantPerceptionNode'

// 注入状态维持实例
export const agent = new StateGraph(MessagesState)
  .addNode('instantPerceptionNode', versionedNode('instantPerceptionNode', instantPerceptionNode))
  .addNode('contextNode', versionedNode('contextNode', contextNode)) // 添加 context 节点
  .addNode('llmCall', versionedNode('llmCall', llmCall))
  .addNode('expressionNode', versionedNode('expressionNode', expressionNode))
  .addNode('toolNode', versionedNode('toolNode', toolNode))
  .addNode('toolContextReloadNode', versionedNode('toolContextReloadNode', toolContextReloadNode))
  .addNode('cognitionRevisionNode', versionedNode('cognitionRevisionNode', cognitionRevisionNode))
  .addNode('memoryNode', versionedNode('memoryNode', memoryNode)) // 添加 memory 节点
  .addConditionalEdges(START, routeTurnStart, [
    'instantPerceptionNode',
    'contextNode',
    'llmCall',
    'expressionNode',
    'toolNode',
    'toolContextReloadNode',
    'cognitionRevisionNode',
    'memoryNode'
  ])
  .addEdge('instantPerceptionNode', 'contextNode')
  .addEdge('contextNode', 'llmCall') // 从 contextNode -> llmCall
  .addConditionalEdges('llmCall', shouldContinue, ['llmCall', 'toolNode', 'expressionNode'])
  .addEdge('toolNode', 'toolContextReloadNode')
  .addEdge('toolContextReloadNode', 'cognitionRevisionNode')
  .addEdge('cognitionRevisionNode', 'llmCall')
  .addEdge('expressionNode', 'memoryNode')
  .addEdge('memoryNode', END) // memoryNode -> END
  .compile()
