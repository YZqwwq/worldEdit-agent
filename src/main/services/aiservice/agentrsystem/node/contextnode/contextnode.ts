import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages'
import type { MemorySlotSnapshot } from '@share/cache/AItype/states/memorySlots'
import type { PersonaActionPolicy } from '@share/cache/AItype/states/personaPolicy'
import { MessagesState } from '../../state/messageState'
import { memoryManager } from '../../manager/memory/MemoryManager'
import { memorySlotService } from '../../manager/memory/memorySlotService'
import { buildMemoryPromptPlan } from '../../manager/memory/memoryPromptPolicy'
import { buildToolUsageSystemPrompt } from '../../../ai-utils/core/toolUsagePrompt'
import {
  getVisibleMainAgentToolEntries,
  resolveMainAgentToolActivationState
} from '../../../ai-utils/toolkits/mainAgentToolRegistry'
import { MAIN_AGENT_USER_MESSAGE_CREATED_AT_KEY } from '../../../messagecontent/mainAgentMessageContentService'
import {
  buildPersonaAssemblyPromptParts,
  loadCharacterPrompt,
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
import { applyScenePerceptionToMemorySlots } from '../../state/sceneContextAdapter'

const formatCurrentContextTime = (): string => {
  return getCurrentDetailTime()
}

const buildActionPolicyPrompt = (actionPolicy: PersonaActionPolicy | undefined): string => {
  if (!actionPolicy) return ''

  const lines = [
    '行动策略调制：',
    `自主推进=${actionPolicy.autonomyDrive.toFixed(2)}`,
    `谨慎度=${actionPolicy.caution.toFixed(2)}`,
    `澄清需求=${actionPolicy.clarificationNeed.toFixed(2)}`,
    `证据需求=${actionPolicy.evidenceNeed.toFixed(2)}`,
    `回忆需求=${actionPolicy.recallNeed.toFixed(2)}`,
    `写入保守度=${actionPolicy.writeConservatism.toFixed(2)}`,
    `工具持续性=${actionPolicy.toolPersistence.toFixed(2)}`,
    '使用规则：这是本轮行动倾向，不是用户可见内容。谨慎度/证据需求高时先查证或澄清；回忆需求高且问题涉及旧上下文时优先调用 recall_agent_memory；写入保守度高时写入、删除、修改前更应确认对象与意图。'
  ]

  return lines.join('\n')
}

const getCurrentUserMessageCreatedAt = (state: typeof MessagesState.State): string | null => {
  const userMessage = state.messages
    .slice()
    .reverse()
    .find((message) => message instanceof HumanMessage && !message.additional_kwargs?.isHistory)
  const createdAt = userMessage?.additional_kwargs?.[MAIN_AGENT_USER_MESSAGE_CREATED_AT_KEY]
  return typeof createdAt === 'string' && createdAt.trim() ? createdAt.trim() : null
}

const compactLongText = (value: string, max = 8000): string => {
  const text = String(value || '').trim()
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}\n\n[已截断：完整人物印象仍保存在人物关联表中。]`
}

type SplitPrompt = {
  context: string
  instruction: string
}

const buildWorldFocusPrompt = (
  state: typeof MessagesState.State,
  slotSnapshot: MemorySlotSnapshot
): SplitPrompt => {
  const focus = state.worldFocusContext
  if (!focus) return { context: '', instruction: '' }
  if (slotSnapshot.scene_perception.shouldRunWorldFocus !== true) {
    return { context: '', instruction: '' }
  }
  if (focus.focuses.length === 0) return { context: '', instruction: '' }
  const focuses = focus.focuses
  const primaryFocus =
    focuses.find((item) => item.entityId === focus.primaryFocusId) ??
    focuses.find((item) => item.role === 'primary' || item.role === 'target') ??
    focuses[0]

  const lines = [
    '本轮世界观聚焦上下文：',
    `聚焦模式：${focus.mode === 'multi' ? '多人物焦点组' : '单人物焦点'}`,
    focus.focusTask ? `本轮焦点任务：${focus.focusTask.type} / ${focus.focusTask.description}` : '',
    `主焦点：${primaryFocus.worldName} / ${primaryFocus.focusType} / ${primaryFocus.entityName} (${primaryFocus.entityId})`,
    focuses.length > 1
      ? `焦点组：${focuses
          .map((item) => `${item.role}:${item.worldName}/${item.entityName}(${item.entityId})`)
          .join('；')}`
      : '',
    `识别置信度：${focus.confidence.toFixed(2)}`
  ]
  const instructionLines = [
    '世界观焦点使用规则：这是一份本轮内部上下文。回答用户时可以自然承接该对象的信息，但不要主动暴露“我先去读取/聚焦了这个对象”之类过程性表述。'
  ]

  for (const item of focuses) {
    if (!item.impression) continue
    lines.push(
      '',
      `人物「${item.entityName}」印象状态：${item.impression.status}`,
      item.impression.reason ? `状态原因：${item.impression.reason}` : '',
      item.impression.updatedAt ? `人物印象更新时间：${item.impression.updatedAt}` : '',
      item.impression.latestNarrativeUpdatedAt
        ? `人物叙事文本最新更新时间：${item.impression.latestNarrativeUpdatedAt}`
        : '',
      typeof item.impression.narrativeDocumentCount === 'number'
        ? `人物叙事文本数量：${item.impression.narrativeDocumentCount}`
        : ''
    )

    if (item.impression.found && item.impression.structuredText) {
      lines.push(
        '',
        `主 agent 已有人物「${item.entityName}」印象：`,
        compactLongText(item.impression.structuredText)
      )
    }
  }

  const hasUnavailableCharacterImpression = focuses.some(
    (item) =>
      item.focusType === 'character' &&
      (!item.impression?.found || item.impression.status !== 'available')
  )
  if (hasUnavailableCharacterImpression) {
    instructionLines.push(
      '人物理解使用规则：当前焦点组中存在人物印象缺失或过期；如果用户问题需要深入判断人物的性格、动机、生平、关系、事件影响或要求重新评价，应优先激活 character_narrative_reader 工具集，按人物文本目录创建阅读任务并在必要时保存新的 save_character_narrative_impression。若不阅读，请明确保持谨慎，不要对文本未支持的内容做强断言。'
    )
  }

  return {
    context: lines.filter(Boolean).join('\n'),
    instruction: instructionLines.filter(Boolean).join('\n')
  }
}

const buildScenePrompt = (slotSnapshot: MemorySlotSnapshot): SplitPrompt => {
  const scene = slotSnapshot.scene_perception
  if (!scene || scene.confidence < 0.6 || scene.primaryDomain === 'unknown') {
    return { context: '', instruction: '' }
  }

  const lines = [
    '本轮场景连续性判断：',
    `主场景：${scene.primaryDomain}`,
    scene.referenceDomains.length > 0 ? `临时参考场景：${scene.referenceDomains.join(', ')}` : '',
    `连续性：${scene.continuity}`,
    `当前场景仍然有效：${scene.currentSceneStillActive ? '是' : '否'}`,
    `应用内世界观讨论相关：${scene.appWorldbuildingDiscussionRelated ? '是' : '否'}`,
    `应用内世界观实例相关：${scene.appWorldbuildingInstanceRelated ? '是' : '否'}`,
    `是否运行世界观实例聚焦：${scene.shouldRunWorldFocus ? '是' : '否'}`,
    `是否允许使用历史世界观焦点：${scene.shouldInjectHistoricalWorldFocus ? '是' : '否'}`,
    `判断置信度：${scene.confidence.toFixed(2)}`,
    `判断理由：${scene.reason}`,
    scene.evidence.length > 0 ? `判断证据：${scene.evidence.join('；')}` : ''
  ]

  return {
    context: lines.filter(Boolean).join('\n'),
    instruction:
      '场景上下文使用规则：若连续性为 temporary_reference，用户提到的外部作品或现实对象只是参考或类比，不要把它当作应用内世界观焦点。若不允许使用历史世界观焦点，不要主动把旧人物或世界观对象带入回答。'
  }
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

  const slotSnapshot = await memorySlotService.reconcileFromObservations()
  const effectiveSlotSnapshot = applyScenePerceptionToMemorySlots(slotSnapshot)
  const characterPrompt = await loadCharacterPrompt()
  const expressionProfile =
    state.expressionProfile ?? (await loadExpressionPromptProfile('default'))
  const currentTimeContext = formatCurrentContextTime()
  const currentUserMessageCreatedAt = getCurrentUserMessageCreatedAt(state)
  const contextualToolsets =
    state.workspaceContext?.pageKind === 'document' ? ['world_document_editor'] : []
  const toolActivationState = await resolveMainAgentToolActivationState({
    ...state,
    activeToolsets: [...(state.activeToolsets ?? []), ...contextualToolsets],
    toolCallCounts: state.toolCallCounts ?? {}
  })

  const personaParts = buildPersonaAssemblyPromptParts({
    characterPrompt,
    expressionPrompt: expressionProfile.prompt,
    moodAssessment:
      state.instantPerception?.detectors.persona.status === 'fulfilled' &&
      state.instantPerception.detectors.persona.producedStateKeys.includes('personaPolicy')
        ? effectiveSlotSnapshot.ai_mood.current
        : undefined
  })
  appendPromptSection({
    id: 'persona-anchor',
    duty: 'identity',
    kind: 'persona_anchor',
    source: 'characterPromptStore',
    content: personaParts.identity
  })
  if (personaParts.moodContext) {
    appendPromptSection({
      id: 'agent-mood',
      duty: 'context',
      kind: 'agent_internal_state',
      source: 'personaNode',
      content: personaParts.moodContext,
      capturedAt: effectiveSlotSnapshot.ai_mood.updatedAt
    })
  }
  appendPromptSection({
    id: 'persona-expression',
    duty: 'instruction',
    kind: 'expression_style',
    source: 'personaAssemblyPrompt',
    content: personaParts.instruction
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

  const actionPolicyPrompt = buildActionPolicyPrompt(state.personaPolicy?.action)
  if (actionPolicyPrompt) {
    appendPromptSection({
      id: 'action-policy',
      duty: 'instruction',
      kind: 'behavior_tendency',
      source: 'personaPolicyCompiler',
      content: actionPolicyPrompt,
      capturedAt: state.personaPolicy?.generatedAt
    })
  }

  const scenePrompt = buildScenePrompt(effectiveSlotSnapshot)
  if (scenePrompt.context) {
    appendPromptSection({
      id: 'scene-state',
      duty: 'context',
      kind: 'scene_inference',
      source: 'sceneNode',
      content: scenePrompt.context,
      confidence: effectiveSlotSnapshot.scene_perception.confidence,
      capturedAt: effectiveSlotSnapshot.scene_perception.updatedAt
    })
  }
  if (scenePrompt.instruction) {
    appendPromptSection({
      id: 'scene-rule',
      duty: 'instruction',
      kind: 'context_usage_rule',
      source: 'sceneNode',
      content: scenePrompt.instruction
    })
  }

  const worldFocusPrompt = buildWorldFocusPrompt(state, effectiveSlotSnapshot)
  if (worldFocusPrompt.context) {
    appendPromptSection({
      id: 'world-focus-state',
      duty: 'context',
      kind: 'world_focus',
      source: 'worldFocusNode',
      content: worldFocusPrompt.context,
      confidence: state.worldFocusContext?.confidence
    })
  }
  if (worldFocusPrompt.instruction) {
    appendPromptSection({
      id: 'world-focus-rule',
      duty: 'instruction',
      kind: 'impression_usage_rule',
      source: 'worldFocusNode',
      content: worldFocusPrompt.instruction
    })
  }

  const snapshot = await memoryManager.getSnapshot()

  const memoryPromptPlan = buildMemoryPromptPlan(snapshot, effectiveSlotSnapshot, {
    includeWorldFocus: effectiveSlotSnapshot.scene_perception.shouldInjectHistoricalWorldFocus
  })

  if (memoryPromptPlan.slotPrompt) {
    appendPromptSection({
      id: 'memory-slots',
      duty: 'context',
      kind: 'short_lived_state',
      source: 'memorySlotService',
      content: memoryPromptPlan.slotPrompt
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
      `expression=${expressionProfile.id}，短期窗口 ${snapshot.shortTerm.length} 条`,
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
      longTermMemoryMode: 'recall_tool_only',
      hasSlotPrompt: Boolean(memoryPromptPlan.slotPrompt),
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
    promptSectionManifest,
    activeToolsets: contextualToolsets,
    quickToolsets: toolActivationState.quickToolsets ?? [],
    quickTools: toolActivationState.quickTools ?? [],
    toolCallCounts: {}
  }
}
