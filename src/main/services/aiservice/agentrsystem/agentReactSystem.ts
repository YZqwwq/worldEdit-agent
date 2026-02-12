import { END, START, StateGraph } from '@langchain/langgraph'
import { MessagesState } from './state/messageState'
import { llmCall } from './node/modelnode/modelnode'
import { toolNode } from './node/toolnode/toolnode'
import { contextNode } from './node/contextnode/contextnode' // 导入 ContextNode
import { shouldContinue } from './endlogic/shouldContinue'
import { logNodeEnter, logNodeExit } from '../../log/graphlog'

async function loggedContextNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  logNodeEnter('contextNode', state)
  const update = await contextNode(state)
  logNodeExit('contextNode', update)
  return update
}

async function loggedLlmCall(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  logNodeEnter('llmCall', state)
  const update = await llmCall(state)
  logNodeExit('llmCall', update)
  return update
}

async function loggedToolNode(
  state: typeof MessagesState.State
): Promise<{ messages: import('@langchain/core/messages').ToolMessage[] }> {
  logNodeEnter('toolNode', state)
  const update = await toolNode(state)
  logNodeExit('toolNode', update)
  return update
}

// 注入状态维持实例
export const agent = new StateGraph(MessagesState)
  .addNode('contextNode', loggedContextNode) // 添加 context 节点
  .addNode('llmCall', loggedLlmCall)
  .addNode('toolNode', loggedToolNode)
  .addEdge(START, 'contextNode') // 从 START -> contextNode
  .addEdge('contextNode', 'llmCall') // 从 contextNode -> llmCall
  .addConditionalEdges('llmCall', shouldContinue, ['toolNode', END])
  .addEdge('toolNode', 'llmCall')
  .compile()
