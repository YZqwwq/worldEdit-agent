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

const versionedNode = <TResult>(
  name: Parameters<typeof withTurnVersionBoundary>[0],
  node: (state: typeof MessagesState.State) => Promise<TResult>
) => withTurnVersionBoundary(name, withNodeTrace(name, node))

const routeTurnStart = (state: typeof MessagesState.State) =>
  state.resumeFromNode ?? 'instantPerceptionNode'

// 注入状态维持实例
export const agent = new StateGraph(MessagesState)
  .addNode('instantPerceptionNode', versionedNode('instantPerceptionNode', instantPerceptionNode))
  .addNode('contextNode', versionedNode('contextNode', contextNode)) // 添加 context 节点
  .addNode('llmCall', versionedNode('llmCall', llmCall))
  .addNode('toolNode', versionedNode('toolNode', toolNode))
  .addNode('toolContextReloadNode', versionedNode('toolContextReloadNode', toolContextReloadNode))
  .addNode('memoryNode', versionedNode('memoryNode', memoryNode)) // 添加 memory 节点
  .addConditionalEdges(START, routeTurnStart, [
    'instantPerceptionNode',
    'contextNode',
    'llmCall',
    'toolNode',
    'toolContextReloadNode',
    'memoryNode'
  ])
  .addEdge('instantPerceptionNode', 'contextNode')
  .addEdge('contextNode', 'llmCall') // 从 contextNode -> llmCall
  // llmCall 的条件分支：如果有 ToolCall -> toolNode；否则 -> memoryNode
  // 注意：shouldContinue 在异常情况下可能返回 END，所以映射中包含 END
  .addConditionalEdges('llmCall', shouldContinue, ['toolNode', 'memoryNode', END])
  .addEdge('toolNode', 'toolContextReloadNode')
  .addEdge('toolContextReloadNode', 'llmCall')
  .addEdge('memoryNode', END) // memoryNode -> END
  .compile()
