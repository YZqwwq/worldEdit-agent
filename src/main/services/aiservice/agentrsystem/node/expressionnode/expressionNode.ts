import { randomUUID } from 'node:crypto'
import { AIMessage, SystemMessage, HumanMessage } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { getConfiguredModelRuntime } from '../../modelwithtool/model'
import { createFinalResponse } from '../../state/turnWorkspace'
import { contentToText } from '../../../messageoutput/transformRespones'
import { traceArtifact, traceState } from '../../../../log/trace/agentTraceEmitter'
import { advanceTurnLifecycle } from '@share/cache/AItype/states/turnLifecycle'
import { withTurnLifecycleDraft } from '../../state/turnWorkspace'
import { loadCharacterPrompt } from '../../../prompt/main_agent/persona/characterPromptStore'
import { getExpressionAffectPrompt } from '../../../prompt/main_agent/persona/expressionAffectPrompts'

const renderOrientation = (state: typeof MessagesState.State): string => {
  const orientation = state.responseOrientation
  if (!orientation) throw new Error('expressionNode requires a response orientation')
  return [
    `回应类型：${orientation.mode}`,
    `核心回应：${orientation.coreResponse}`,
    `主体位置：${orientation.selfPosition}`,
    orientation.personalMeaning ? `对自己的意义：${orientation.personalMeaning}` : '',
    `表达情绪取向：${orientation.expressionAffect}`,
    orientation.stance ? `主体立场：${orientation.stance}` : '',
    orientation.selectedPoints.length
      ? `选择展开的重点：\n${orientation.selectedPoints.map((point) => `- ${point}`).join('\n')}`
      : '',
    orientation.uncertainty ? `必须保留的不确定性：${orientation.uncertainty}` : '',
    `展开程度：${orientation.depth}`
  ].filter(Boolean).join('\n')
}

export async function expressionNode(
  state: typeof MessagesState.State,
  config?: { signal?: AbortSignal }
): Promise<Partial<typeof MessagesState.State>> {
  const runtime = await getConfiguredModelRuntime()
  const characterAnchor = state.turnWorkspace?.base.identityAnchor?.prompt ?? await loadCharacterPrompt()
  const affectPrompt = getExpressionAffectPrompt(state.responseOrientation!.expressionAffect)
  const mind = state.personaPolicy?.descriptiveContext
  const messages = [
    new SystemMessage([
      '你正在完成最终表达。认知、事实判断和行动已经结束；你只能忠实组织给定的回应取向。',
      '说话者的稳定人格锚点如下。它决定主体声音和价值视角，不是需要复述的设定：',
      characterAnchor,
      '以下是主 Agent 在完成思考后主动选择的本轮表达情绪取向。它只调制措辞、节奏、温度和关系距离，不能改写观点或事实：',
      affectPrompt,
      '直接对用户说话，像自然交流，不写成报告、总结单或执行播报。',
      '不得新增事实、推理、建议、承诺或工具行动，不得暴露回应取向、内部状态、节点和协议。',
      '优先表达主体立场和核心回应，只展开被选择的重点；理解到但未被选择的内容不要补回。',
      'brief 通常一到三小段，normal 保持自然对话篇幅，expanded 仅在用户明确需要完整展开时使用。',
      mind ? `表达背景：${mind.relationship} ${mind.expression}` : ''
    ].filter(Boolean).join('\n')),
    new HumanMessage(renderOrientation(state))
  ]
  const preparedMessages = await runtime.familyAdapter.prepareMessages(messages, runtime)
  const options: Record<string, unknown> = { signal: config?.signal }
  const temperature = Number(runtime.effectiveOptions.temperature)
  if (Number.isFinite(temperature)) options.temperature = Math.min(1.2, Math.max(0, temperature))
  const maxTokens = Number(runtime.effectiveOptions.mainAgentMaxTokens)
  if (Number.isFinite(maxTokens) && maxTokens > 0) options.maxTokens = Math.min(Math.round(maxTokens), 1200)

  traceState('expressionNode', {
    title: '状态: 最终表达',
    summary: `mode=${state.responseOrientation?.mode}，depth=${state.responseOrientation?.depth}`,
    data: { responseOrientation: state.responseOrientation }
  })

  let text = ''
  const stream = await runtime.model.stream(preparedMessages, options as any)
  for await (const chunk of stream) {
    text += contentToText(chunk.content)
  }
  const content = text.trim()
  if (!content) throw new Error('expressionNode returned empty content')
  const response = new AIMessage({ content, id: randomUUID() })
  const finalResponse = createFinalResponse({ messageId: response.id!, content })

  traceArtifact('expressionNode', {
    title: '产物: 用户可见表达',
    summary: content.slice(0, 120),
    data: { chars: content.length }
  })

  const lifecycle = advanceTurnLifecycle(
    state.turnLifecycle ?? state.turnWorkspace?.draft.lifecycle ?? {
      phase: 'ready',
      revision: 0,
      updatedAt: new Date().toISOString()
    },
    'expressing'
  )
  return {
    messages: [response],
    finalResponse,
    turnLifecycle: lifecycle,
    ...(state.turnWorkspace
      ? { turnWorkspace: withTurnLifecycleDraft(state.turnWorkspace, lifecycle) }
      : {})
  }
}
