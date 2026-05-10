import { END, START, StateGraph } from '@langchain/langgraph'
import { MessagesState } from './state/messageState'
import { llmCall } from './node/modelnode/modelnode'
import { toolNode } from './node/toolnode/toolnode'
import { toolContextReloadNode } from './node/toolcontextreloadnode/toolContextReloadNode'
import { contextNode } from './node/contextnode/contextnode' // 导入 ContextNode
import { memoryNode } from './node/memorynode/memorynode' // 导入 MemoryNode
import { personaNode } from './node/personanode/personanode'
import { shouldContinue } from './endlogic/shouldContinue'
import { withNodeTrace } from '../../log/trace/withNodeTrace'

// 注入状态维持实例
export const agent = new StateGraph(MessagesState)
  .addNode('personaNode', withNodeTrace('personaNode', personaNode))
  .addNode('contextNode', withNodeTrace('contextNode', contextNode)) // 添加 context 节点
  .addNode('llmCall', withNodeTrace('llmCall', llmCall))
  .addNode('toolNode', withNodeTrace('toolNode', toolNode))
  .addNode('toolContextReloadNode', withNodeTrace('toolContextReloadNode', toolContextReloadNode))
  .addNode('memoryNode', withNodeTrace('memoryNode', memoryNode)) // 添加 memory 节点
  .addEdge(START, 'personaNode')
  .addEdge('personaNode', 'contextNode')
  .addEdge('contextNode', 'llmCall') // 从 contextNode -> llmCall
  // llmCall 的条件分支：如果有 ToolCall -> toolNode；否则 -> memoryNode
  // 注意：shouldContinue 在异常情况下可能返回 END，所以映射中包含 END
  .addConditionalEdges('llmCall', shouldContinue, ['toolNode', 'memoryNode', END])
  .addEdge('toolNode', 'toolContextReloadNode')
  .addEdge('toolContextReloadNode', 'llmCall')
  .addEdge('memoryNode', END) // memoryNode -> END
  .compile()
