import { END, START, StateGraph } from '@langchain/langgraph'
import { MessagesState } from './state/messageState'
import { llmCall } from './node/modelnode/modelnode'
import { toolNode } from './node/toolnode/toolnode'
import { contextNode } from './node/contextnode/contextnode' // 导入 ContextNode
import { shouldContinue } from './endlogic/shouldContinue'

// 注入状态维持实例
export const agent = new StateGraph(MessagesState)
  .addNode('contextNode', contextNode) // 添加 context 节点
  .addNode('llmCall', llmCall)
  .addNode('toolNode', toolNode)
  .addEdge(START, 'contextNode') // 从 START -> contextNode
  .addEdge('contextNode', 'llmCall') // 从 contextNode -> llmCall
  .addConditionalEdges('llmCall', shouldContinue, ['toolNode', END])
  .addEdge('toolNode', 'llmCall')
  .compile()
