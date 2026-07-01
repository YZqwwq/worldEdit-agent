import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages'
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
  buildPersonaAssemblyPrompt,
  loadCharacterPrompt,
  loadExpressionPromptProfile
} from '../../../prompt/main_agent/agentPromptService'
import { traceArtifact, traceDecision } from '../../../../log/trace/agentTraceEmitter'
import { getCurrentDetailTime, getDetailTime } from '../../../../../utils/getDetailTime'

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

const buildWorldFocusPrompt = (state: typeof MessagesState.State): string => {
  const focus = state.worldFocusContext
  if (!focus) return ''

  const lines = [
    '本轮世界观聚焦上下文：',
    `世界观：${focus.worldName} (${focus.worldId})`,
    `聚焦对象：${focus.focusType} / ${focus.entityName} (${focus.entityId})`,
    `识别置信度：${focus.confidence.toFixed(2)}`,
    '使用规则：这是一份本轮内部上下文。回答用户时可以自然承接该对象的信息，但不要主动暴露“我先去读取/聚焦了这个对象”之类过程性表述。'
  ]

  if (focus.impression) {
    lines.push(
      '',
      `人物印象状态：${focus.impression.status}`,
      focus.impression.reason ? `状态原因：${focus.impression.reason}` : '',
      focus.impression.updatedAt ? `人物印象更新时间：${focus.impression.updatedAt}` : '',
      focus.impression.latestNarrativeUpdatedAt
        ? `人物叙事文本最新更新时间：${focus.impression.latestNarrativeUpdatedAt}`
        : '',
      typeof focus.impression.narrativeDocumentCount === 'number'
        ? `人物叙事文本数量：${focus.impression.narrativeDocumentCount}`
        : ''
    )
  }

  if (focus.impression?.found && focus.impression.structuredText) {
    lines.push('', `主 agent 已有人物印象：`, compactLongText(focus.impression.structuredText))
  }

  if (
    focus.focusType === 'character' &&
    (!focus.impression?.found || focus.impression.status !== 'available')
  ) {
    lines.push(
      '',
      '人物理解使用规则：当前人物印象缺失、过期或证据不足；如果用户问题需要深入判断该人物的性格、动机、生平、关系、事件影响或要求重新评价，应优先激活 character_narrative_reader 工具集，按人物文本目录创建阅读任务并在必要时保存新的 save_character_narrative_impression。若不阅读，请明确保持谨慎，不要对文本未支持的内容做强断言。'
    )
  }

  return lines.filter(Boolean).join('\n')
}

const buildInstantPerceptionPrompt = (state: typeof MessagesState.State): string => {
  const perception = state.instantPerception
  if (!perception) return ''

  const lines = [
    '本轮瞬时感知状态：',
    `感知模式：${perception.mode}`,
    `总耗时：${perception.durationMs}ms`,
    `worldFocus：${perception.detectors.worldFocus.status} / ${perception.detectors.worldFocus.durationMs}ms / 输出=${perception.detectors.worldFocus.producedStateKeys.join(', ') || 'none'}`,
    `persona：${perception.detectors.persona.status} / ${perception.detectors.persona.durationMs}ms / 输出=${perception.detectors.persona.producedStateKeys.join(', ') || 'none'}`,
    '使用规则：这是内部感知层健康状态。不要向用户复述这些技术细节；若某项感知失败，只按已有上下文自然降级。'
  ]

  if (perception.warnings.length > 0) {
    lines.push(`感知警告：${perception.warnings.join('；')}`)
  }

  return lines.join('\n')
}

/**
 * ContextNode: 负责构建全局上下文，包括 Persona、Memory 等。
 * 它作为图的入口节点，确保 LLM 在处理用户输入前拥有完整的背景信息。
 */
export async function contextNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const messages: BaseMessage[] = []

  const slotSnapshot = await memorySlotService.reconcileFromObservations()
  const characterPrompt = await loadCharacterPrompt()
  const expressionProfile =
    state.expressionProfile ?? (await loadExpressionPromptProfile('default'))
  const currentTimeContext = formatCurrentContextTime()
  const currentUserMessageCreatedAt = getCurrentUserMessageCreatedAt(state)
  const toolActivationState = await resolveMainAgentToolActivationState({
    ...state,
    suppressedTools: []
  })

  // 人格组装提示
  const personaAssemblyPrompt = buildPersonaAssemblyPrompt({
    characterPrompt,
    expressionPrompt: expressionProfile.prompt,
    moodAssessment: state.moodAssessment
  })
  if (personaAssemblyPrompt) {
    messages.push(new SystemMessage(personaAssemblyPrompt))
  }

  messages.push(
    new SystemMessage(
      `当前时间锚点：${currentTimeContext}\n默认以此作为“现在/今天/最近”之类相对时间表达的解释基准；除非用户明确提供其他时间背景，否则不要自行假设年份或日期。`
    )
  )

  if (currentUserMessageCreatedAt) {
    messages.push(
      new SystemMessage(
        `当前用户消息时间：${getDetailTime(currentUserMessageCreatedAt)}。这是你“看到”本轮用户发来这条消息时的聊天时间戳；理解“刚刚/这条消息/用户现在说”时优先参考它。`
      )
    )
  }

  // 当前活跃任务
  if (state.taskLifecycle?.activeTask) {
    messages.push(
      new SystemMessage(
        `当前活跃任务:\n标题：${state.taskLifecycle.activeTask.title}\n目标：${state.taskLifecycle.activeTask.goal}\n状态：${state.taskLifecycle.activeTask.status}\n摘要：${state.taskLifecycle.activeTask.summary}`
      )
    )
  }

  // 任务注册列表
  if (state.taskLifecycle?.notice?.type === 'task_registration_blocked') {
    messages.push(
      new SystemMessage(
        `任务注册限制：${state.taskLifecycle.notice.message}\n请明确告诉用户：当前没有可用的对应子 agent 能力工具，因此不能注册该任务；如果用户希望继续，请先为系统加载对应能力工具。`
      )
    )
  } else if (state.taskLifecycle?.notice?.message) {
    messages.push(new SystemMessage(`任务生命周期提示：${state.taskLifecycle.notice.message}`))
  }

  if (
    !state.taskLifecycle?.activeTask &&
    state.taskLifecycle?.decision?.type === 'create_task' &&
    state.taskLifecycle?.capability?.available
  ) {
    messages.push(
      new SystemMessage(
        `本轮输入被识别为适合委派给子 agent 的复杂任务。` +
          ` 如果判断确实成立，请优先调用工具 ${state.taskLifecycle.capability.requiredToolName}，` +
          ' 让工具在同一条应用流程里原子地完成任务登记与首轮 execution 启动。' +
          ' 在工具成功之前，不要口头声称任务已经创建或已经开始执行。'
      )
    )
  }

  const toolUsagePrompt = buildToolUsageSystemPrompt(
    getVisibleMainAgentToolEntries(toolActivationState),
    toolActivationState
  )
  if (toolUsagePrompt) {
    messages.push(new SystemMessage(toolUsagePrompt))
  }

  const actionPolicyPrompt = buildActionPolicyPrompt(state.personaPolicy?.action)
  if (actionPolicyPrompt) {
    messages.push(new SystemMessage(actionPolicyPrompt))
  }

  const instantPerceptionPrompt = buildInstantPerceptionPrompt(state)
  if (instantPerceptionPrompt) {
    messages.push(new SystemMessage(instantPerceptionPrompt))
  }

  const worldFocusPrompt = buildWorldFocusPrompt(state)
  if (worldFocusPrompt) {
    messages.push(new SystemMessage(worldFocusPrompt))
  }
  // 短期窗口记忆
  const snapshot = await memoryManager.getSnapshot()
  if (snapshot.anchors.length > 0) {
    messages.push(new SystemMessage(snapshot.anchors.join('\n')))
  }

  // 记忆系统
  const memoryPromptPlan = buildMemoryPromptPlan(snapshot, slotSnapshot)
  const injectedSections: string[] = ['personaAssemblyPrompt', 'currentTimeContext']

  // 记忆槽位
  if (memoryPromptPlan.slotPrompt) {
    injectedSections.push('slotPrompt')
    messages.push(new SystemMessage(memoryPromptPlan.slotPrompt))
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

  if (state.taskLifecycle?.activeTask) injectedSections.push('activeTask')
  if (toolUsagePrompt) injectedSections.push('toolUsage')
  if (actionPolicyPrompt) injectedSections.push('actionPolicy')
  if (instantPerceptionPrompt) injectedSections.push('instantPerception')
  if (worldFocusPrompt) injectedSections.push('worldFocus')
  if (snapshot.anchors.length > 0) injectedSections.push('anchors')
  if (snapshot.shortTerm.length > 0) injectedSections.push('shortTermHistory')

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
      shortTermCount: snapshot.shortTerm.length,
      anchorCount: snapshot.anchors.length,
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
    quickToolsets: toolActivationState.quickToolsets ?? [],
    quickTools: toolActivationState.quickTools ?? [],
    suppressedTools: []
  }
}
