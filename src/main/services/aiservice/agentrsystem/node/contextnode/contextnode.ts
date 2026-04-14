import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { memoryManager } from '../../manager/memory/MemoryManager'
import { memorySlotService } from '../../manager/memory/memorySlotService'
import { buildMemoryPromptPlan } from '../../manager/memory/memoryPromptPolicy'
import { buildToolUsageSystemPrompt } from '../../../ai-utils/core/toolUsagePrompt'
import { getMainAgentToolEntries } from '../../../ai-utils/toolkits/mainAgentToolRegistry'
import {
  buildPersonaAssemblyPrompt,
  loadCharacterPrompt,
  loadExpressionPrompt
} from '../../../prompt/main_agent/agentPromptService'

/**
 * ContextNode: 负责构建全局上下文，包括 Persona、Memory 等。
 * 它作为图的入口节点，确保 LLM 在处理用户输入前拥有完整的背景信息。
 */
export async function contextNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  
  const messages: BaseMessage[] = []

  const characterPrompt = await loadCharacterPrompt()
  const slotSnapshot = await memorySlotService.reconcileFromObservations()
  const expressionPrompt = loadExpressionPrompt()

  // 人格组装提示
  const personaAssemblyPrompt = buildPersonaAssemblyPrompt({
    characterPrompt,
    expressionPrompt,
    moodAssessment: state.moodAssessment,
    personaPolicy: state.personaPolicy,
  })
  if (personaAssemblyPrompt) {
    messages.push(new SystemMessage(personaAssemblyPrompt))
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

  const toolUsagePrompt = buildToolUsageSystemPrompt(getMainAgentToolEntries())
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

  // 长期稳定记忆
  if (memoryPromptPlan.longTermPrompt) {
    messages.push(new SystemMessage(`长期稳定记忆:\n${memoryPromptPlan.longTermPrompt}`))
  }

  // 记忆槽位
  if (memoryPromptPlan.slotPrompt) {
    messages.push(new SystemMessage(memoryPromptPlan.slotPrompt))
  }

  // 最近阶段记忆
  if (memoryPromptPlan.recentStagePrompt) {
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

  // 注意：LangGraph 的 reducer 通常是追加模式。
  // 最终顺序由 llmCall 节点负责调整 (System -> History -> User Input)。

  return {
    messages: messages
  }
}
