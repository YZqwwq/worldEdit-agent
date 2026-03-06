import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { memoryManager } from '../../memory/MemoryManager'
import {
  loadRolePrompt,
  loadPersonaState,
  formatPersonaState
} from '@share/cache/AItype/states/personalState'

/**
 * ContextNode: 负责构建全局上下文，包括 Persona、Memory 等。
 * 它作为图的入口节点，确保 LLM 在处理用户输入前拥有完整的背景信息。
 */
export async function contextNode(
  _state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  
  const messages: BaseMessage[] = []

  // 1. 读取静态 Persona (法弥拉设定)
  const projectRoot = process.cwd()
  const persona = await loadRolePrompt(projectRoot)
  if (persona) {
    messages.push(new SystemMessage(persona))
  }

  const personaState = await loadPersonaState(projectRoot)
  if (personaState) {
    messages.push(new SystemMessage(formatPersonaState(personaState)))
  }

  const snapshot = memoryManager.getSnapshot()
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
