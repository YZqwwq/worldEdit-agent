import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { memoryManager } from '../../manager/memory/MemoryManager'
import { memorySlotService } from '../../manager/memory/memorySlotService'
import { buildMemoryPromptPlan } from '../../manager/memory/memoryPromptPolicy'
import { buildToolUsageSystemPrompt } from '../../../ai-utils/core/toolUsagePrompt'
import { getVisibleMainAgentToolEntries } from '../../../ai-utils/toolkits/mainAgentToolRegistry'
import { MAIN_AGENT_USER_MESSAGE_CREATED_AT_KEY } from '../../../messagecontent/mainAgentMessageContentService'
import {
  buildPersonaAssemblyPrompt,
  loadCharacterPrompt,
  loadExpressionPromptProfile
} from '../../../prompt/main_agent/agentPromptService'
import {
  traceArtifact,
  traceDecision
} from '../../../../log/trace/agentTraceEmitter'
import { getCurrentDetailTime, getDetailTime } from '../../../../../utils/getDetailTime'

const formatCurrentContextTime = (): string => {
  return getCurrentDetailTime()
}

const getCurrentUserMessageCreatedAt = (
  state: typeof MessagesState.State
): string | null => {
  const userMessage = state.messages
    .slice()
    .reverse()
    .find((message) => message instanceof HumanMessage && !message.additional_kwargs?.isHistory)
  const createdAt = userMessage?.additional_kwargs?.[MAIN_AGENT_USER_MESSAGE_CREATED_AT_KEY]
  return typeof createdAt === 'string' && createdAt.trim() ? createdAt.trim() : null
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

  const toolUsagePrompt = buildToolUsageSystemPrompt(getVisibleMainAgentToolEntries(state))
  if (toolUsagePrompt) {
    messages.push(new SystemMessage(toolUsagePrompt))
  }
  // 短期窗口记忆
  const snapshot = await memoryManager.getSnapshot()
  if (snapshot.anchors.length > 0) {
    messages.push(new SystemMessage(snapshot.anchors.join('\n')))
  }

  // 记忆系统
  const memoryPromptPlan = buildMemoryPromptPlan(snapshot, slotSnapshot)
  const injectedSections: string[] = ['personaAssemblyPrompt', 'currentTimeContext']

  // 长期稳定记忆
  if (memoryPromptPlan.longTermPrompt) {
    injectedSections.push('longTermMemory')
    messages.push(new SystemMessage(`长期稳定记忆:\n${memoryPromptPlan.longTermPrompt}`))
  }

  // 记忆槽位
  if (memoryPromptPlan.slotPrompt) {
    injectedSections.push('slotPrompt')
    messages.push(new SystemMessage(memoryPromptPlan.slotPrompt))
  }

  // 最近阶段记忆
  if (memoryPromptPlan.recentStagePrompt) {
    injectedSections.push('recentStageMemory')
    messages.push(new SystemMessage(`最近阶段记忆:\n${memoryPromptPlan.recentStagePrompt}`))
  }

  for (const msg of snapshot.shortTerm) {
    if (msg.role === 'user') {
      messages.push(new HumanMessage({
        content: msg.content,
        additional_kwargs: { isHistory: true }
      }))
    } else if (msg.role === 'ai') {
      messages.push(new AIMessage({
        content: msg.content,
        additional_kwargs: { isHistory: true }
      }))
    }
  }

  if (state.taskLifecycle?.activeTask) injectedSections.push('activeTask')
  if (toolUsagePrompt) injectedSections.push('toolUsage')
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
      hasLongTermMemory: Boolean(memoryPromptPlan.longTermPrompt),
      hasSlotPrompt: Boolean(memoryPromptPlan.slotPrompt),
      hasRecentStagePrompt: Boolean(memoryPromptPlan.recentStagePrompt)
    }
  })

  traceArtifact('contextNode', {
    title: '产物: contextNode 消息装配',
    summary: `system=${messages.filter((message) => message instanceof SystemMessage).length}，history=${snapshot.shortTerm.length}`,
    data: {
      systemMessageCount: messages.filter((message) => message instanceof SystemMessage).length,
      historyMessageCount: snapshot.shortTerm.length,
      estimatedPromptChars: messages.reduce((total, message) => {
        const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
        return total + content.length
      }, 0)
    }
  })

  // 注意：LangGraph 的 reducer 通常是追加模式。
  // 最终顺序由 llmCall 节点负责调整 (System -> History -> User Input)。

  return {
    messages: messages
  }
}
