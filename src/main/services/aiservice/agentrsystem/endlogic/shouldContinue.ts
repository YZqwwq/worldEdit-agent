import { MessagesState } from '../state/messageState'
import { traceDecision } from '../../../log/trace/agentTraceEmitter'

const ROUTES = {
  deliberate: 'cognitionNode',
  execute_tools: 'toolNode',
  compose_final: 'expressionNode',
  compose_expression_tools: 'expressionToolNode',
  complete_expression: 'outputGuardNode'
} as const

export async function shouldContinue(
  state: typeof MessagesState.State
): Promise<(typeof ROUTES)[keyof typeof ROUTES]> {
  const directive = state.loopDirective
  if (!directive) {
    throw new Error('cognitionNode must commit a loopDirective before routing.')
  }
  const route = ROUTES[directive]
  traceDecision('cognitionNode', {
    title: '决策: Agent Loop 路由',
    summary: `${directive} -> ${route}`,
    data: { directive, route }
  })
  return route
}
