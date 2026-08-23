import { BaseMessage, RemoveMessage, SystemMessage } from '@langchain/core/messages'
import { contentToText } from '../../../messageoutput/transformRespones'
import { getConfiguredModelRuntime } from '../../modelwithtool/model'
import { MessagesState, type ToolContextItem } from '../../state/messageState'
import { buildCognitiveState } from '../../cognition/cognitiveStateService'
import { uniqueToolContextItems } from '../../state/toolContextCollection'
import {
  cognitiveRevisionSchema,
  parseCognitiveRevision
} from '../../cognition/finishResponseProtocol'
import {
  createTurnExecutionLedger,
  renderTurnExecutionLedger
} from '../../execution/turnExecutionLifecycle'
import { advanceTurnLifecycle } from '@share/cache/AItype/states/turnLifecycle'
import { withCognitiveStateDraft, withTurnLifecycleDraft } from '../../state/turnWorkspace'
import { traceArtifact, traceDecision, traceState } from '../../../../log/trace/agentTraceEmitter'

const isToolInstruction = (message: BaseMessage): boolean => {
  if (!(message instanceof SystemMessage)) return false
  const content = contentToText(message.content)
  return content.includes('｜tool_rule｜') || content.includes('｜task_rule｜')
}

const renderPendingObservations = (items: ToolContextItem[]): string =>
  items
    .map(
      (item, index) =>
        `${index + 1}. ${item.toolName}\n` +
        `输入：${item.argsSummary}\n` +
        `结果：${item.resultSummary}`
    )
    .join('\n\n')

const buildRevisionInstruction = (
  state: typeof MessagesState.State,
  observations: ToolContextItem[],
  executionLedger: ReturnType<typeof createTurnExecutionLedger>
): SystemMessage => {
  const cognition = state.cognitiveState ?? state.turnWorkspace?.draft.cognitiveState
  return new SystemMessage(
    [
      '你正在完成当前 Turn 的工具观察吸收。你仍是同一个主体；稳定人格、情绪、关系位置、页面场景和对话历史继续有效。',
      '这一节点只负责理解刚返回的观察如何影响当前认识，不调用工具、不生成用户可见回复，也不规划执行细节。',
      cognition
        ? `当前认识：${cognition.understanding}\n当前主体位置：${cognition.selfPosition ?? '(未形成)'}\n当前个人意义：${cognition.personalMeaning ?? '(无)'}\n当前立场：${cognition.provisionalStance ?? '(无)'}\n当前知识缺口：${cognition.knowledgeGap ?? '(无)'}\n当前观察目标：${cognition.nextObservationGoal ?? '(无)'}`
        : '当前尚无可用认知状态。',
      renderTurnExecutionLedger(executionLedger),
      `刚返回的工具观察：\n${renderPendingObservations(observations)}`,
      '请通过结构化输出提交以下字段，不输出用户可见文本或额外解释：',
      '{"understanding":"吸收观察后的最新理解","selfPosition":"仅在关系位置确实变化时填写","personalMeaning":"变化后的个人意义或 null","provisionalStance":"修订后的暂时立场或 null","knowledgeGap":"仍存在的关键缺口或 null","nextObservationGoal":"若仍需观察，下一步真正想确认什么；否则 null","evidenceImpact":"supports | refines | contradicts | insufficient | irrelevant"}',
      '不要复述完整思维过程；只提交修订后的认知状态。'
    ].join('\n\n')
  )
}

export async function cognitionRevisionNode(
  state: typeof MessagesState.State,
  config?: { signal?: AbortSignal }
): Promise<Partial<typeof MessagesState.State>> {
  if (!state.turnWorkspace) {
    throw new Error('cognitionRevisionNode requires an active turn workspace')
  }
  const pending = state.pendingToolContext ?? []
  if (pending.length === 0) {
    throw new Error('cognitionRevisionNode requires pending tool observations')
  }

  const runtime = await getConfiguredModelRuntime()
  const executionLedger =
    state.turnExecutionLedger ?? createTurnExecutionLedger(state.turnInput?.content ?? '处理当前输入')
  const systemMessages = state.messages.filter(
    (message) => message instanceof SystemMessage && !isToolInstruction(message)
  )
  const historyMessages = state.messages.filter((message) => message.additional_kwargs?.isHistory)
  const activeTranscriptIds = new Set(state.activeToolTranscriptIds ?? [])
  const currentMessages = state.messages.filter(
    (message) =>
      !(message instanceof SystemMessage) &&
      !message.additional_kwargs?.isHistory &&
      (!message.id || !activeTranscriptIds.has(message.id))
  )
  const messages = [
    ...systemMessages,
    buildRevisionInstruction(state, pending, executionLedger),
    ...historyMessages,
    ...currentMessages
  ]
  const preparedMessages = await runtime.familyAdapter.prepareMessages(messages, runtime)
  const options: Record<string, unknown> = { signal: config?.signal }
  const temperature = Number(runtime.effectiveOptions.temperature)
  if (Number.isFinite(temperature)) {
    options.temperature = Math.min(2, Math.max(0, temperature + (state.personaPolicy?.sampling.temperatureOffset ?? 0)))
  }
  const maxTokens = Number(runtime.effectiveOptions.mainAgentMaxTokens)
  if (Number.isFinite(maxTokens) && maxTokens > 0) options.maxTokens = Math.min(Math.round(maxTokens), 1200)

  traceState('cognitionRevisionNode', {
    title: '状态: 工具观察认知修订',
    summary: `观察 ${pending.length} 条，共享上下文 ${preparedMessages.length} 条`,
    data: {
      pendingTools: pending.map((item) => item.toolName),
      systemCount: systemMessages.length,
      historyCount: historyMessages.length,
      currentCount: currentMessages.length
    }
  })

  const structuredModel = runtime.model.withStructuredOutput(cognitiveRevisionSchema, {
    name: 'submit_cognitive_revision',
    method: 'functionCalling',
    includeRaw: true
  })
  const response = await structuredModel.invoke(preparedMessages, options as any)
  const revision = parseCognitiveRevision(response.parsed)
  if (!revision) {
    const validation = cognitiveRevisionSchema.safeParse(response.parsed)
    traceArtifact('cognitionRevisionNode', {
      title: '产物: 无效的认知修订响应',
      summary: '结构化响应未通过认知修订协议',
      data: {
        parsed: response.parsed,
        issues: validation.success ? [] : validation.error.issues,
        rawContent: contentToText(response.raw.content),
        rawToolCalls:
          (response.raw as BaseMessage & { tool_calls?: unknown[] }).tool_calls ?? []
      }
    })
    throw new Error('cognitionRevisionNode returned an invalid cognitive revision')
  }

  const cognitiveState = buildCognitiveState({
    state,
    ledger: executionLedger,
    hasToolCalls: false,
    ready: false,
    responseText: revision.understanding,
    revision
  })
  const currentLifecycle = state.turnLifecycle ?? state.turnWorkspace.draft.lifecycle
  const lifecycle = advanceTurnLifecycle(currentLifecycle, 'revising', {
    observationBatch: currentLifecycle?.observationBatch,
    revisedObservationBatch: currentLifecycle?.observationBatch
  })
  const transcriptIds = [...new Set(state.activeToolTranscriptIds ?? [])]
  const toolEvidenceContext = uniqueToolContextItems([
    ...(state.toolEvidenceContext ?? []),
    ...pending.filter((item) => item.retention === 'evidence' && item.ok !== false)
  ])
  const workspace = withTurnLifecycleDraft(
    withCognitiveStateDraft(state.turnWorkspace, cognitiveState),
    lifecycle
  )

  traceDecision('cognitionRevisionNode', {
    title: '决策: 工具观察已吸收',
    summary: `${revision.evidenceImpact}，剩余缺口=${revision.knowledgeGap ?? 'none'}`,
    data: { revision, consumedTranscriptIds: transcriptIds }
  })
  traceArtifact('cognitionRevisionNode', {
    title: '产物: 修订后认知状态',
    summary: cognitiveState.understanding,
    data: { cognitiveState }
  })

  return {
    messages: transcriptIds.map((id) => new RemoveMessage({ id })),
    cognitiveState,
    turnLifecycle: lifecycle,
    turnWorkspace: workspace,
    responseOrientationError: undefined,
    toolEvidenceContext,
    ephemeralToolContext: [],
    pendingToolContext: [],
    activeToolTranscriptIds: []
  }
}
