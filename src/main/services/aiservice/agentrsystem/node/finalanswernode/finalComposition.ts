import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { renderTurnExecutionLedger } from '../../execution/turnExecutionLifecycle'
import { renderToolContextItems } from '../../state/toolContextCollection'
import { GLOBAL_EXPRESSION_CONTRACT } from '../../../prompt/main_agent/persona/expressionPromptProfiles'

const compact = (value: string, max: number): string => {
  const normalized = value.trim()
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trimEnd()}…`
}

export const buildFinalCompositionMessages = (state: typeof MessagesState.State): BaseMessage[] => {
  const source = [...state.messages]
  const systemMessages = source.filter((message) => message instanceof SystemMessage)
  const historyMessages = source.filter(
    (message) => !(message instanceof SystemMessage) && message.additional_kwargs?.isHistory
  )
  const currentUserMessage = source
    .slice()
    .reverse()
    .find((message) => message instanceof HumanMessage && !message.additional_kwargs?.isHistory)
  if (!currentUserMessage) {
    throw new Error('finalAnswerNode requires the current user message.')
  }

  const reasoning = (state.reasoningSegments ?? [])
    .slice(-6)
    .map((segment, index) => `${index + 1}. ${compact(segment.text, 2400)}`)
    .join('\n')
  const evidence = renderToolContextItems('仍有效的工具证据：', state.toolEvidenceContext ?? [])
  const execution = state.turnExecutionLedger
    ? renderTurnExecutionLedger(state.turnExecutionLedger)
    : ''
  const boundary = new SystemMessage(
    [
      '现在结束内部认知过程，只生成对当前用户的最终回答。',
      '下面的内部认知、工具证据和执行状态仅是形成回答的依据，不是需要续写、逐项复述或展示给用户的草稿。',
      reasoning ? `本轮内部认知：\n${reasoning}` : '',
      evidence,
      execution,
      '到这里才决定如何把已经形成的判断说给用户。根据本轮真实心理背景，自主选择要显露的情绪与强度；可以自然表现高兴、激动、生气、低落或克制，但不要捏造并不存在的情绪，也不要直接报告内部标签或数值。',
      GLOBAL_EXPRESSION_CONTRACT,
      state.expressionProfile?.prompt
        ? `【当前 Expression Profile】\n${state.expressionProfile.prompt}`
        : '',
      '保留已经形成的判断与必要依据，用稳定人格自己的声音自然表达。不要展示分析步骤、内部字段、工具过程或“根据以上分析”等元话语。',
      '不要引入内部认知、工具证据和当前对话中不存在的新事实。默认简洁；仅在用户明确要求或问题确实复杂时展开。',
      '工具调用已经结束，本次只输出最终回答正文。'
    ]
      .filter(Boolean)
      .join('\n\n')
  )

  return [...systemMessages, boundary, ...historyMessages, currentUserMessage]
}
