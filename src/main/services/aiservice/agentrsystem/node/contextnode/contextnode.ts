import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { memoryManager } from '../../manager/memory/MemoryManager'
import {
  loadRolePrompt,
  loadPersonaState,
  formatPersonaState
} from '../../manager/personal/personalManager'
import { tools } from '../../modelwithtool/tool'
import { buildToolUsageSystemPrompt } from '../../../ai-utils/core/toolUsagePrompt'

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

  messages.push(
    new SystemMessage(
      [
        '上下文继承规则：',
        '1. 你当前能看到的短期记忆、最近对话和工具结果摘要，都是本轮决策的有效上下文。',
        '2. 如果最近几轮已经明确确认了目标 worldId、worldName、entityId、characterName，后续调用写入类或委派类工具时必须优先沿用这些已确认标识。',
        '3. 不要因为用户本轮只说“继续扩写她”“拓展她的简介”就丢失上一轮已经确认过的人物与世界观。',
        '4. 只有在现有上下文无法唯一确定目标时，才向用户继续追问；如果系统已经能唯一锁定目标，不要重复索取世界观名称或人物标识。'
      ].join('\n')
    )
  )

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

  const toolUsagePrompt = buildToolUsageSystemPrompt(tools)
  if (toolUsagePrompt) {
    messages.push(new SystemMessage(toolUsagePrompt))
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
