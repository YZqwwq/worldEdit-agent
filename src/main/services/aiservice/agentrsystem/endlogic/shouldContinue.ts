import { MessagesState } from '../state/messageState'
import { traceDecision } from '../../../log/trace/agentTraceEmitter'

const ROUTES = {
  deliberate: 'llmCall',
  execute_tools: 'toolNode',
  compose_final: 'finalAnswerNode'
} as const

export async function shouldContinue(
  state: typeof MessagesState.State
): Promise<(typeof ROUTES)[keyof typeof ROUTES]> {
  const directive = state.loopDirective
  if (!directive) {
    throw new Error('llmCall must commit a loopDirective before routing.')
  }
  const route = ROUTES[directive]
  traceDecision('shouldContinue', {
    title: '决策: Agent Loop 路由',
    summary: `${directive} -> ${route}`,
    data: { directive, route }
  })
  return route
}
