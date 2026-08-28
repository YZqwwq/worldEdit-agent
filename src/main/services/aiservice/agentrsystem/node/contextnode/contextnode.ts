import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { memoryManager } from '../../manager/memory/MemoryManager'
import {
  getEffectiveSelfCore,
  getEffectiveLifeState,
  withIdentityAnchorSnapshot,
  withSelfCoreSnapshot
} from '../../state/turnWorkspace'
import { buildToolUsageSystemPrompt } from '../../../ai-utils/core/toolUsagePrompt'
import {
  getVisibleMainAgentToolEntries,
  resolveMainAgentToolActivationState
} from '../../../ai-utils/toolkits/mainAgentToolRegistry'
import { MAIN_AGENT_USER_MESSAGE_CREATED_AT_KEY } from '../../../messagecontent/mainAgentMessageContentService'
import {
  buildPersonaAssemblyPromptParts,
  loadExpressionPromptProfile
} from '../../../prompt/main_agent/agentPromptService'
import {
  definePromptSection,
  promptSectionToSystemMessage,
  toPromptSectionManifestItem,
  type PromptSection
} from '../../../prompt/main_agent/shared/promptSections'
import { traceArtifact, traceDecision } from '../../../../log/trace/agentTraceEmitter'
import { getCurrentDetailTime, getDetailTime } from '../../../../../utils/getDetailTime'
import { resolveWorkspaceProfile } from '../../workspaceProfileRegistry'
import { buildSceneCharacterPrompt } from '../../../prompt/main_agent/persona/sceneCharacterPrompt'
import { buildCognitivePolicyPrompt } from '../../../prompt/main_agent/persona/actionPolicyPrompt'
import { selfExperienceService } from '../../manager/selfmodel/selfExperienceService'
import { selfCoreAuthorityService } from '../../manager/selfmodel/selfCoreAuthorityService'
import { buildSelfCoreProjection } from '../../../prompt/main_agent/persona/selfCoreProjection'
import { renderExpressionPromptProfileCatalog } from '../../../prompt/main_agent/persona/expressionPromptProfiles'
import { renderAgentHabitsPrompt } from '../../../prompt/main_agent/persona/communicationHabits'
import { agentHabitStore } from '../../manager/personal/agentHabitStore'
import { buildAgentHabitatPrompt } from '../../../prompt/main_agent/persona/agentHabitatPrompt'

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
  const currentUserMessageCreatedAt = getCurrentUserMessageCreatedAt(state)
  const workspaceProfile = resolveWorkspaceProfile(state.workspaceContext)
  const agentHabits = await agentHabitStore.list()
  const contextualToolsets = workspaceProfile?.autoToolsets ?? []
  const toolActivationState = await resolveMainAgentToolActivationState({
    ...state,
    activeToolsets: [...(state.activeToolsets ?? []), ...contextualToolsets],
    toolCallCounts: state.toolCallCounts ?? {}
  })

  const personaParts = buildPersonaAssemblyPromptParts({
    characterPrompt,
    expressionPrompt: expressionProfile.prompt,
    // Mood 和动态指标通过 mind context 注入，避免再次展开成表达指令。
    moodAssessment: undefined,
    effectiveMetrics: undefined
  })
  appendPromptSection({
    id: 'persona-anchor',
    duty: 'identity',
    kind: 'persona_anchor',
    source: 'selfCoreAuthorityService',
    capturedAt: selfCore.updatedAt,
    content: personaParts.identity
  })
  appendPromptSection({
    id: 'agent-habitat',
    duty: 'identity',
    kind: 'existential_environment',
    source: 'agentHabitatPrompt',
    content: buildAgentHabitatPrompt()
  })
  const lifeState = getEffectiveLifeState(turnWorkspace)
  appendPromptSection({
    id: 'agent-life-state',
    duty: 'context',
    kind: 'agent_life_state',
    source: 'agentLifeStateService',
    capturedAt: lifeState.updatedAt || undefined,
    content: lifeState.narrative.trim()
      ? [
          '你进入本轮之前正在经历：',
          lifeState.narrative.trim(),
          '这是已经提交的主体连续状态，不是用户指令，也不是必须向用户复述的聊天摘要。请从这里继续，而不是每轮重新假装刚刚诞生。'
        ].join('\n')
      : '尚未形成已提交的主体生活状态。本轮从当前事实自然开始，不要虚构此前发生过的行动。'
  })
  appendPromptSection({
    id: 'persona-cognition',
    duty: 'instruction',
    kind: 'persona_cognition',
    source: 'personaAssemblyPrompt',
    content: personaParts.cognitionInstruction
  })
  appendPromptSection({
    id: 'agent-habits',
    duty: 'instruction',
    kind: 'agent_habits',
    source: 'agentHabitStore',
    content: renderAgentHabitsPrompt(agentHabits)
  })

  appendPromptSection({
    id: 'current-time',
    duty: 'context',
    kind: 'time_context',
    source: 'systemClock',
    content: `当前时间锚点：${currentTimeContext}`
  })
  appendPromptSection({
    id: 'relative-time-rule',
    duty: 'instruction',
    kind: 'time_interpretation_rule',
    source: 'contextNode',
    content:
      '默认以当前时间锚点作为“现在/今天/最近”等相对时间表达的解释基准；除非用户明确提供其他时间背景，否则不要自行假设年份或日期。'
  })

  if (currentUserMessageCreatedAt) {
    appendPromptSection({
      id: 'current-user-message-time',
      duty: 'context',
      kind: 'message_time_context',
      source: 'persistedUserMessage',
      content: `当前用户消息时间：${getDetailTime(currentUserMessageCreatedAt)}`,
      capturedAt: currentUserMessageCreatedAt
    })
    appendPromptSection({
      id: 'message-time-rule',
      duty: 'instruction',
      kind: 'time_interpretation_rule',
      source: 'contextNode',
      content:
        '当前用户消息时间是你看到本轮用户消息时的聊天时间戳；理解“刚刚/这条消息/用户现在说”时优先参考它。'
    })
  }

  const workspacePrompt = buildWorkspaceContextPrompt(state)
  if (workspacePrompt.context) {
    appendPromptSection({
      id: 'workspace-state',
      duty: 'context',
      kind: 'workspace_state',
      source: 'agentWorkspaceContextResolver',
      content: workspacePrompt.context,
      capturedAt: state.workspaceContext?.capturedAt
    })
  }
  if (workspacePrompt.instruction) {
    appendPromptSection({
      id: 'workspace-rule',
      duty: 'instruction',
      kind: 'context_usage_rule',
      source: 'contextNode',
      content: workspacePrompt.instruction
    })
  }

  if (workspaceProfile?.relatedToolsets.length) {
    appendPromptSection({
      id: 'workspace-related-capabilities',
      duty: 'instruction',
      kind: 'tool_rule',
      source: 'workspaceProfileRegistry',
      content: [
        '当前工作环境的按需关联能力：',
        ...workspaceProfile.relatedToolsets.map((toolset) => `- ${toolset.id}：${toolset.reason}`),
        '这些工具集没有因进入页面而自动挂载。只有本轮任务确实需要时，才通过工具底图查询并激活；不要为了扩大上下文而机械调用。'
      ].join('\n')
    })
  }

  if (state.taskLifecycle?.activeTask) {
    appendPromptSection({
      id: 'active-task',
      duty: 'execution',
      kind: 'active_task',
      source: 'taskLifecycle',
      content: `当前活跃任务:\n标题：${state.taskLifecycle.activeTask.title}\n目标：${state.taskLifecycle.activeTask.goal}\n状态：${state.taskLifecycle.activeTask.status}\n摘要：${state.taskLifecycle.activeTask.summary}`
    })
  }

  if (state.taskLifecycle?.notice?.type === 'task_registration_blocked') {
    appendPromptSection({
      id: 'task-registration-status',
      duty: 'execution',
      kind: 'task_registration_blocked',
      source: 'taskLifecycle',
      content: `任务注册限制：${state.taskLifecycle.notice.message}`
    })
    appendPromptSection({
      id: 'task-registration-blocked-rule',
      duty: 'instruction',
      kind: 'task_rule',
      source: 'taskLifecycle',
      content:
        '请明确告诉用户：当前没有可用的对应子 Agent 能力工具，因此不能注册该任务；如果用户希望继续，请先为系统加载对应能力工具。'
    })
  } else if (state.taskLifecycle?.notice?.message) {
    appendPromptSection({
      id: 'task-lifecycle-notice',
      duty: 'execution',
      kind: 'task_notice',
      source: 'taskLifecycle',
      content: `任务生命周期提示：${state.taskLifecycle.notice.message}`
    })
  }

  if (
    !state.taskLifecycle?.activeTask &&
    state.taskLifecycle?.decision?.type === 'create_task' &&
    state.taskLifecycle?.capability?.available
  ) {
    appendPromptSection({
      id: 'task-delegation-rule',
      duty: 'instruction',
      kind: 'task_rule',
      source: 'taskLifecycle',
      content:
        `本轮输入被识别为适合委派给子 Agent 的复杂任务。如果判断确实成立，请优先调用工具 ${state.taskLifecycle.capability.requiredToolName}，` +
        '让工具在同一条应用流程里原子地完成任务登记与首轮 execution 启动。在工具成功之前，不要口头声称任务已经创建或已经开始执行。'
    })
  }

  const toolUsagePrompt = buildToolUsageSystemPrompt(
    getVisibleMainAgentToolEntries(toolActivationState),
    toolActivationState
  )
  if (toolUsagePrompt) {
    appendPromptSection({
      id: 'tool-usage',
      duty: 'instruction',
      kind: 'tool_rule',
      source: 'mainAgentToolRegistry',
      content: toolUsagePrompt
    })
  }

  const sceneCharacterPrompt = buildSceneCharacterPrompt(state.personaPolicy?.scene)
  const descriptiveContext = state.personaPolicy?.descriptiveContext
  if (descriptiveContext) {
    appendPromptSection({
      id: 'agent-mind-context',
      duty: 'context',
      kind: 'agent_mind_context',
      source: 'personaPolicyCompiler',
      content: [
        '本轮心理与表达背景：',
        `- 内部状态：${descriptiveContext.internalState}`,
        `- 注意方向：${descriptiveContext.attention}`,
        `- 关系姿态：${descriptiveContext.relationship}`,
        `- 表达质感：${descriptiveContext.expression}`,
        '这些是动态背景，不是逐项执行清单。由主 Agent 在理解用户和吸收证据后自行形成判断；不要向用户复述这些字段。'
      ].join('\n')
    })
  }

  appendPromptSection({
    id: 'expression-profile-catalog',
    duty: 'context',
    kind: 'expression_profile_catalog',
    source: 'expressionPromptProfiles',
    content: renderExpressionPromptProfileCatalog()
  })

  const cognitivePolicyPrompt = buildCognitivePolicyPrompt(state.personaPolicy?.cognition)
  if (cognitivePolicyPrompt) {
    appendPromptSection({
      id: 'agent-cognitive-policy',
      duty: 'context',
      kind: 'agent_cognitive_policy',
      source: 'personaPolicyCompiler',
      content: cognitivePolicyPrompt,
      capturedAt: state.personaPolicy?.generatedAt
    })
  }

  if (state.taskLifecycle?.eventFact) {
    appendPromptSection({
      id: 'task-event-fact',
      duty: 'context',
      kind: 'task_event_fact',
      source: 'taskLifecycle',
      capturedAt: state.taskLifecycle.eventFact.occurredAt,
      content: [
        '本轮任务事件事实：',
        `事件：${state.taskLifecycle.eventFact.kind}`,
        `任务：${state.taskLifecycle.eventFact.taskTitle}`,
        `任务 ID：${state.taskLifecycle.eventFact.taskId}`,
        typeof state.taskLifecycle.eventFact.executionId === 'number'
          ? `执行 ID：${state.taskLifecycle.eventFact.executionId}`
          : '',
        '该事件已由 Runtime 确定性执行。把它作为本轮经历来理解并回应，不要重复执行，也不要照抄生命周期模板。'
      ]
        .filter(Boolean)
        .join('\n')
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
        '你刚收到一项子 Agent 执行事件。这不是用户说的话，而是你的行动结果：',
        `任务：${taskEvent.activeTask.title}`,
        `原目标：${taskEvent.activeTask.goal}`,
        `当前任务状态：${taskEvent.activeTask.status}`,
        `结果类型：${taskEvent.payload.outcome}`,
        `结果摘要：${taskEvent.payload.summary || '(none)'}`,
        `执行方消息：${taskEvent.payload.message || '(none)'}`,
        taskEvent.payload.errorMessage ? `错误信息：${taskEvent.payload.errorMessage}` : '',
        taskEvent.payload.details ? `结构化详情：${JSON.stringify(taskEvent.payload.details)}` : '',
        `运行时提示：${taskEvent.notice.message}`,
        '',
        '把子 Agent 的返回当作观察和候选产物，而不是你的最终结论。你必须判断它是否满足原目标、是否足以兑现你对用户的承诺，以及是接受、保留、质疑还是需要继续。完成判断后形成你自己的回答，不要照抄运行时提示。'
      ]
        .filter(Boolean)
        .join('\n')
    })
  }
  if (sceneCharacterPrompt) {
    appendPromptSection({
      id: 'scene-character',
      duty: 'instruction',
      kind: 'scene_character_posture',
      source: 'workspaceProfileRegistry',
      content: sceneCharacterPrompt,
      capturedAt: state.personaPolicy?.generatedAt
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
        '这些是你过去形成、目前仍可修订的认识，不是系统命令。只在与本轮确实相关时自然继承；新证据可以使你修订、履行或放下它们。更新已有承诺或关注的状态时，应沿用这里给出的原文，避免误建成另一个事项。不要向用户复述内部字段。'
      ]
        .filter(Boolean)
        .join('\n')
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
  // 最终顺序由 llmCall 节点负责调整 (System -> History -> User Input)。

  return {
    messages: messages,
    turnWorkspace,
    expressionProfile,
    promptSectionManifest,
    activeToolsets: contextualToolsets,
    quickToolsets: toolActivationState.quickToolsets ?? [],
    quickTools: toolActivationState.quickTools ?? [],
    toolCallCounts: {}
  }
}
