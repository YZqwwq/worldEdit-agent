import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { memoryManager } from '../../manager/memory/MemoryManager'
import {
  loadRolePrompt,
  loadPersonaState,
  formatPersonaState
} from '../../manager/personal/personalManager'

/**
 * ContextNode: 负责构建全局上下文，包括 Persona、Memory 等。
 * 它作为图的入口节点，确保 LLM 在处理用户输入前拥有完整的背景信息。
 */
export async function contextNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  
  const messages: BaseMessage[] = []

  // 1. 读取静态 Persona (法弥拉设定)
  const persona = await loadRolePrompt()
  if (persona) {
    messages.push(new SystemMessage(persona))
  }

  const personaState = await loadPersonaState()
  if (personaState) {
    messages.push(new SystemMessage(formatPersonaState(personaState)))
  }

  if (state.personaPolicy?.style?.instruction) {
    messages.push(new SystemMessage(`回复风格约束:\n${state.personaPolicy.style.instruction}`))
  }

  if (state.taskLifecycle?.activeTask) {
    messages.push(
      new SystemMessage(
        `当前活跃任务:\n标题：${state.taskLifecycle.activeTask.title}\n目标：${state.taskLifecycle.activeTask.goal}\n状态：${state.taskLifecycle.activeTask.status}\n摘要：${state.taskLifecycle.activeTask.summary}`
      )
    )
  }

  if (state.taskLifecycle?.notice?.type === 'task_registration_blocked') {
    messages.push(
      new SystemMessage(
        `任务注册限制：${state.taskLifecycle.notice.message}\n请明确告诉用户：当前没有可用的对应子 agent 能力工具，因此不能注册该任务；如果用户希望继续，请先为系统加载对应能力工具。`
      )
    )
  } else if (state.taskLifecycle?.notice?.message) {
    messages.push(new SystemMessage(`任务生命周期提示：${state.taskLifecycle.notice.message}`))
  }

  if (state.taskLifecycle?.recalledExperiences?.length) {
    const experienceText = state.taskLifecycle.recalledExperiences
      .map(
        (item, index) =>
          `${index + 1}. ${item.title}\n问题模式：${item.problemPattern}\n执行策略：${item.executionStrategy}\n验证策略：${item.verificationStrategy}\n结果：${item.outcome}\n坑点：${item.pitfalls}`
      )
      .join('\n\n')
    messages.push(new SystemMessage(`可参考经验:\n${experienceText}`))
  }

  const snapshot = await memoryManager.getSnapshot()
  if (snapshot.anchors.length > 0) {
    messages.push(new SystemMessage(snapshot.anchors.join('\n')))
  }
  if (snapshot.summary) {
    messages.push(new SystemMessage(`记忆摘要:\n${snapshot.summary}`))
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
