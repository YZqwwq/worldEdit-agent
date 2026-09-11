import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { TEST_IDENTITY_PROMPT } from '../../../runtime/agentTestIdentity'
import { memoryManager } from '../../manager/memory/MemoryManager'
import {
  getEffectiveSelfCore,
  getEffectiveLifeState,
  withIdentityAnchorSnapshot,
  withSelfCoreSnapshot
} from '../../state/turnWorkspace'
import { resolveMainAgentToolActivationState } from '../../../ai-utils/toolkits/mainAgentToolRegistry'
import { MAIN_AGENT_USER_MESSAGE_CREATED_AT_KEY } from '../../../messagecontent/mainAgentMessageContentService'
import { loadExpressionPromptProfile } from '../../../prompt/main_agent/agentPromptService'
import {
  definePromptSection,
  promptSectionToSystemMessage,
  toPromptSectionManifestItem,
  type PromptSection
} from '../../../prompt/main_agent/shared/promptSections'
import { traceArtifact, traceDecision } from '../../../../log/trace/agentTraceEmitter'
import { getCurrentDetailTime, getDetailTime } from '../../../../../utils/getDetailTime'
import { resolveWorkspaceProfile } from '../../workspaceProfileRegistry'
import { selfExperienceService } from '../../manager/selfmodel/selfExperienceService'
import { selfCoreAuthorityService } from '../../manager/selfmodel/selfCoreAuthorityService'
import { buildSelfCoreProjection } from '../../../prompt/main_agent/persona/selfCoreProjection'
import { renderPromptTemplate, resolvePromptOverride } from '../../../prompt/promptOverrideStore'
import { buildCognitionPrompt } from './cognitionPrompt'
import { buildAgentIdentityProfile } from '../../../prompt/main_agent/shared/agentIdentity'

const formatCurrentContextTime = (): string => {
  return getCurrentDetailTime()
}

const getCurrentUserMessageCreatedAt = (state: typeof MessagesState.State): string | null => {
  const userMessage = state.messages
    .slice()
    .reverse()
    .find((message) => message instanceof HumanMessage && !message.additional_kwargs?.isHistory)
  const createdAt = userMessage?.additional_kwargs?.[MAIN_AGENT_USER_MESSAGE_CREATED_AT_KEY]
  return typeof createdAt === 'string' && createdAt.trim() ? createdAt.trim() : null
}

const buildCurrentEventNarrative = (state: typeof MessagesState.State): string => {
  const turnInput = state.turnInput
  if (!turnInput) return ''
  const sourceLabel =
    turnInput.source === 'user'
      ? '用户发来的消息'
      : turnInput.source === 'tester'
        ? '隔离环境中测试者发来的消息'
        : turnInput.source === 'subagent'
          ? '子 agent 返回的消息'
          : '应用中刚刚发生的系统事件'
  const lines = [
    '【法弥拉｜当下事件】',
    `法弥拉刚刚注意到${sourceLabel}。`,
    `事件内容：${turnInput.content.trim() || '（没有可直接阅读的文字）'}`
  ]
  if (turnInput.source === 'subagent') {
    lines.push(
      '这不是用户本人刚刚说的话，而是来自子 agent 的执行结果；法弥拉需要先判断它是否可靠、是否满足原本的意图。'
    )
  } else if (turnInput.source === 'system') {
    lines.push('这不是对话中的直接发言，而是应用状态变化；法弥拉把它当作刚刚发生的环境材料。')
  }
  return lines.join('\n')
}

type SplitPrompt = {
  context: string
  instruction: string
}

const buildWorkspaceContextPrompt = (state: typeof MessagesState.State): SplitPrompt => {
  const context = state.workspaceContext
  if (!context) return { context: '', instruction: '' }

  const pageLabels: Record<typeof context.pageKind, string> = {
    home: '首页',
    world: '世界观实例页',
    entity: '世界观实体页',
    document: '文档编辑页',
    chat: 'AI 对话页',
    other: '其他页面'
  }
  const lines = [
    '当前应用工作区：',
    `页面：${pageLabels[context.pageKind]}（${context.routeName}）`,
    context.world ? `世界观：${context.world.name || '未命名'}（worldId=${context.world.id}）` : '',
    context.entity
      ? `当前页面实体：${context.entity.type || '未知类型'} / ${context.entity.name || '未命名'}（entityId=${context.entity.id}）`
      : '',
    context.document
      ? `当前文档：${context.document.title || '未命名'}（documentId=${context.document.id}${context.document.revision ? `，revision=${context.document.revision}` : ''}）`
      : '',
    `页面快照时间：${context.capturedAt}`
  ]

  return {
    context: lines.filter(Boolean).join('\n'),
    instruction:
      '工作区上下文使用规则：这是用户发送本轮消息时正在查看的应用页面，是可靠的界面定位信息，但不等同于用户正在讨论的语义焦点。需要编辑“当前文档”时可使用这里的 documentId；若用户明确谈论其他对象，以用户消息和本轮世界观聚焦为准。回答位置问题时使用自然的页面、世界观、实体和文档名称；除非用户明确询问调试或版本信息，否则不要输出 routeName、内部 ID、revision 或页面快照时间。'
  }
}

/**
 * ContextNode: 负责构建全局上下文，包括 Persona、Memory 等。
 * 它作为图的入口节点，确保 LLM 在处理用户输入前拥有完整的背景信息。
 */
export async function contextNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const messages: BaseMessage[] = []
  const promptSections: PromptSection[] = []
  const appendPromptSection = (input: PromptSection): void => {
    const section = definePromptSection(input)
    promptSections.push(section)
    messages.push(promptSectionToSystemMessage(section))
  }

  if (!state.turnWorkspace) {
    throw new Error('contextNode requires an active turn workspace')
  }
  const selfCore =
    getEffectiveSelfCore(state.turnWorkspace) ?? (await selfCoreAuthorityService.load())
  const workspaceWithCore = withSelfCoreSnapshot(state.turnWorkspace, selfCore)
  const coreProjection = buildSelfCoreProjection(selfCore)
  const characterPrompt = workspaceWithCore.base.identityAnchor?.prompt ?? coreProjection.prompt
  const turnWorkspace = withIdentityAnchorSnapshot(workspaceWithCore, characterPrompt, {
    coreId: coreProjection.coreId,
    coreRevision: coreProjection.revision
  })
  const expressionProfile =
    state.expressionProfile ?? (await loadExpressionPromptProfile('default'))
  const currentTimeContext = formatCurrentContextTime()
  const promptValues = {
    now: currentTimeContext,
    event:
      state.turnInput?.source === 'subagent'
        ? '子 agent 返回的消息'
        : state.turnInput?.source === 'system'
          ? '应用中发生的系统事件'
          : '用户发来的消息',
    eventContent: state.turnInput?.content ?? '',
    page: state.workspaceContext?.routeName ?? '当前页面',
    world: state.workspaceContext?.world?.name ?? '当前世界观',
    document: state.workspaceContext?.document?.title ?? '当前文档'
  }
  const currentUserMessageCreatedAt = getCurrentUserMessageCreatedAt(state)
  const workspaceProfile = resolveWorkspaceProfile(state.workspaceContext)
  const contextualToolsets = workspaceProfile?.autoToolsets ?? []
  const contextualTools = workspaceProfile?.autoTools ?? []
  const toolActivationState = await resolveMainAgentToolActivationState({
    ...state,
    activeToolsets: [...(state.activeToolsets ?? []), ...contextualToolsets],
    activeTools: [...(state.activeTools ?? []), ...contextualTools],
    toolCallCounts: state.toolCallCounts ?? {}
  })

  // The complete Self Core remains authoritative runtime state. Cognition gets
  // a short identity profile alongside its internal-thinking instructions.
  const characterFoundation = buildAgentIdentityProfile(selfCore.identity.name)
  const lifeState = getEffectiveLifeState(turnWorkspace)
  const realityLines = [
    '本轮之前的生活状态记录：',
    lifeState.narrative.trim() || '尚未形成已提交的主体生活状态。',
    '本轮事件与应用上下文：'
  ]
  const currentEventNarrative = buildCurrentEventNarrative(state)
  const workspacePrompt = buildWorkspaceContextPrompt(state)
  if (currentEventNarrative) {
    realityLines.push(
      renderPromptTemplate(
        await resolvePromptOverride('current-event-narrative', currentEventNarrative),
        promptValues
      )
    )
  }
  if (workspacePrompt.context) {
    realityLines.push(
      renderPromptTemplate(
        await resolvePromptOverride('workspace-state', workspacePrompt.context),
        promptValues
      )
    )
  }
  realityLines.push(`当前时间：${currentTimeContext}`)
  if (currentUserMessageCreatedAt)
    realityLines.push(`用户消息时间：${getDetailTime(currentUserMessageCreatedAt)}`)
  if (workspacePrompt.instruction) {
    realityLines.push('页面快照仅提供位置和版本，不包含文档正文。')
  }
  appendPromptSection({
    id: 'shared-identity',
    duty: 'identity',
    kind: 'stable_identity',
    source: 'contextNode',
    audience: 'shared',
    content: characterFoundation
  })
  appendPromptSection({
    id: 'shared-interlocutor',
    duty: 'context',
    kind: 'dialogue_identity',
    source: 'contextNode',
    audience: 'shared',
    content:
      state.turnInput?.source === 'tester'
        ? TEST_IDENTITY_PROMPT
        : state.turnInput?.source === 'subagent'
          ? '当前事件来自子 Agent 的任务返回，不是用户刚发来的消息。对外交流对象仍为用户。'
          : state.turnInput?.source === 'system'
            ? '当前事件来自应用系统，不是用户刚发来的消息。对外交流对象仍为用户。'
            : '本轮对话对象是用户。'
  })
  appendPromptSection({
    id: 'shared-reality',
    duty: 'context',
    kind: 'current_reality',
    source: 'contextNode',
    audience: 'shared',
    content: realityLines.filter(Boolean).join('\n\n'),
    capturedAt: state.turnInput?.occurredAt ?? state.workspaceContext?.capturedAt
  })
  appendPromptSection({
    id: 'cognition-thinking',
    audience: 'cognition',
    duty: 'thinking',
    kind: 'internal_cognition',
    source: 'contextNode',
    capturedAt: state.turnInput?.occurredAt ?? state.workspaceContext?.capturedAt,
    content: buildCognitionPrompt()
  })
  /*
   * Task state is only a reality detail when a task actually exists or
   * produced an event. Registration heuristics and capability instructions
   * stay in runtime/tooling instead of entering the character's thoughts.
   */
  const taskLines: string[] = []
  if (state.taskLifecycle?.activeTask) {
    taskLines.push(
      `活跃任务：${state.taskLifecycle.activeTask.title}`,
      `目标：${state.taskLifecycle.activeTask.goal}`,
      `状态：${state.taskLifecycle.activeTask.status}`,
      `摘要：${state.taskLifecycle.activeTask.summary}`
    )
  }
  if (
    (state.taskLifecycle?.activeTask || state.taskLifecycle?.eventFact) &&
    state.taskLifecycle.notice?.message
  ) {
    taskLines.push(`任务状态：${state.taskLifecycle.notice.message}`)
  }
  if (state.taskLifecycle?.eventFact) {
    taskLines.push(
      `任务事件：${state.taskLifecycle.eventFact.kind}`,
      `任务：${state.taskLifecycle.eventFact.taskTitle}`,
      `任务 ID：${state.taskLifecycle.eventFact.taskId}`,
      typeof state.taskLifecycle.eventFact.executionId === 'number'
        ? `执行 ID：${state.taskLifecycle.eventFact.executionId}`
        : ''
    )
  }
  if (taskLines.length > 0) {
    appendPromptSection({
      id: 'task-reality',
      audience: 'shared',
      duty: 'context',
      kind: 'task_event_fact',
      source: 'contextNode',
      content: taskLines.filter(Boolean).join('\n')
    })
  }

  if (state.turnInput?.kind === 'task_notification') {
    const taskEvent = state.turnInput.taskEvent
    appendPromptSection({
      id: 'task-notification-event',
      duty: 'context',
      kind: 'task_notification_event',
      source: 'taskQueue',
      content: [
        '法弥拉刚刚收到一项子 agent 执行事件。这不是用户说的话，而是她此前行动得到的结果：',
        `任务：${taskEvent.activeTask.title}`,
        `原目标：${taskEvent.activeTask.goal}`,
        `当前任务状态：${taskEvent.activeTask.status}`,
        `结果类型：${taskEvent.payload.outcome}`,
        `结果摘要：${taskEvent.payload.summary || '(none)'}`,
        `执行方消息：${taskEvent.payload.message || '(none)'}`,
        taskEvent.payload.errorMessage ? `错误信息：${taskEvent.payload.errorMessage}` : '',
        taskEvent.payload.details ? `执行详情：${JSON.stringify(taskEvent.payload.details)}` : '',
        `运行时提示：${taskEvent.notice.message}`,
        '',
        '把子 agent 的返回当作观察和候选产物，而不是法弥拉的最终结论。她需要判断它是否满足原目标、是否足以兑现对用户的承诺，以及是接受、保留、质疑还是需要继续。完成判断后形成自己的回应，不要照抄运行时提示。'
      ]
        .filter(Boolean)
        .join('\n')
    })
  }

  const [snapshot, selfModel] = await Promise.all([
    memoryManager.getSnapshot(),
    selfExperienceService.getSnapshot()
  ])

  const meaningfulExperiences = selfModel.recentExperiences
    .filter((experience) =>
      Boolean(
        experience.personalMeaning ||
          experience.relationshipMeaning ||
          experience.selfNarrative ||
          experience.commitmentUpdates.length ||
          experience.concernUpdates.length
      )
    )
    .slice(0, 2)
  if (
    selfModel.activeCommitments.length ||
    selfModel.openConcerns.length ||
    meaningfulExperiences.length
  ) {
    appendPromptSection({
      id: 'self-continuity',
      audience: 'shared',
      duty: 'context',
      kind: 'self_model_context',
      source: 'selfExperienceService',
      content: [
        '跨轮主体连续性：',
        selfModel.activeCommitments.length
          ? `仍在承担的承诺：\n${selfModel.activeCommitments
              .slice(0, 3)
              .map((item) => `- ${item}`)
              .join('\n')}`
          : '',
        selfModel.openConcerns.length
          ? `仍在关注的问题：\n${selfModel.openConcerns
              .slice(0, 3)
              .map((item) => `- ${item}`)
              .join('\n')}`
          : '',
        meaningfulExperiences.length
          ? `最近的重要经历：\n${meaningfulExperiences
              .map(
                (item) =>
                  `- ${item.personalMeaning || item.relationshipMeaning || item.selfNarrative || item.summary}`
              )
              .join('\n')}`
          : '',
        '这些是过去形成、目前仍可修订的认识，不是系统命令，也不代表本轮已经完成了新的行动。'
      ]
        .filter(Boolean)
        .join('\n')
    })
    appendPromptSection({
      id: 'self-continuity-use',
      audience: 'cognition',
      duty: 'instruction',
      kind: 'self_continuity_instruction',
      source: 'contextNode',
      content:
        '只在与本轮确实相关时继承已有承诺和关注；新证据可以使你修订、履行或放下它们。更新已有承诺或关注的状态时，应沿用给出的原文，避免误建成另一个事项。'
    })
  }

  for (const msg of snapshot.shortTerm) {
    if (msg.role === 'user') {
      messages.push(
        new HumanMessage({
          content: msg.content,
          additional_kwargs: { isHistory: true }
        })
      )
    } else if (msg.role === 'ai') {
      messages.push(
        new AIMessage({
          content: msg.content,
          additional_kwargs: { isHistory: true }
        })
      )
    }
  }

  const promptSectionManifest = promptSections.map(toPromptSectionManifestItem)
  const injectedSections = [
    ...promptSectionManifest.map((section) => section.id),
    ...(snapshot.shortTerm.length > 0 ? ['short-term-history'] : [])
  ]

  traceDecision('contextNode', {
    title: '决策: contextNode 注入计划',
    summary:
      `注入 ${injectedSections.length} 个上下文段，` +
      `finalExpression=${expressionProfile.id}（延迟到 Final），短期窗口 ${snapshot.shortTerm.length} 条`,
    data: {
      expressionProfile: {
        id: expressionProfile.id,
        title: expressionProfile.title,
        summary: expressionProfile.summary
      },
      injectedSections,
      promptSections: promptSectionManifest,
      shortTermCount: snapshot.shortTerm.length,
      hasActiveTask: Boolean(state.taskLifecycle?.activeTask),
      hasLongTermMemory: false,
      selfExperienceCount: selfModel.recentExperiences.length,
      selfCore: {
        coreId: selfCore.coreId,
        revision: selfCore.revision,
        activeNarrativeThesisCount: selfCore.narrativeTheses.filter(
          (thesis) => thesis.status === 'active'
        ).length
      },
      activeCommitmentCount: selfModel.activeCommitments.length,
      openConcernCount: selfModel.openConcerns.length,
      longTermMemoryMode: 'recall_tool_only',
      hasSlotPrompt: false,
      hasRecentStagePrompt: false,
      longTermMemoryPreview: '',
      recentStageCount: snapshot.recentStages.length,
      recentStagePreview: '',
      quickToolsets: toolActivationState.quickToolsets ?? [],
      quickTools: toolActivationState.quickTools ?? []
    }
  })

  traceArtifact('contextNode', {
    title: '产物: contextNode 消息装配',
    summary: `system=${messages.filter((message) => message instanceof SystemMessage).length}，history=${snapshot.shortTerm.length}`,
    data: {
      systemMessageCount: messages.filter((message) => message instanceof SystemMessage).length,
      historyMessageCount: snapshot.shortTerm.length,
      promptSections: promptSectionManifest,
      promptSectionCountsByDuty: promptSectionManifest.reduce<Record<string, number>>(
        (counts, section) => {
          counts[section.duty] = (counts[section.duty] ?? 0) + 1
          return counts
        },
        {}
      ),
      estimatedPromptChars: messages.reduce((total, message) => {
        const content =
          typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
        return total + content.length
      }, 0)
    }
  })

  // 注意：LangGraph 的 reducer 通常是追加模式。
  // 最终顺序由 cognitionNode 节点负责调整 (System -> History -> User Input)。

  return {
    messages: messages,
    turnWorkspace,
    expressionProfile,
    activeToolsets: contextualToolsets,
    activeTools: contextualTools,
    quickToolsets: toolActivationState.quickToolsets ?? [],
    quickTools: toolActivationState.quickTools ?? [],
    toolCallCounts: {}
  }
}
