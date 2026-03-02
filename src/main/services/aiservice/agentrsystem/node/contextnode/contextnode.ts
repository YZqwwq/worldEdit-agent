import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { memoryManager } from '../../memory/MemoryManager'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * ContextNode: 负责构建全局上下文，包括 Persona、Memory 等。
 * 它作为图的入口节点，确保 LLM 在处理用户输入前拥有完整的背景信息。
 */
export async function contextNode(
  _state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  
  const messages: BaseMessage[] = []

  // 1. 读取静态 Persona (法弥拉设定)
  try {
    const projectRoot = process.cwd()
    const rolePromptPath = join(projectRoot, 'src/main/prompt-resource/famila-daily/roleprompt/roleprompt.md')
    const persona = await readFile(rolePromptPath, 'utf-8')
    if (persona) {
        messages.push(new SystemMessage(persona))
    }
  } catch (error) {
    console.error('Failed to load role prompt:', error)
  }

  // 2. 获取 MemoryManager 上下文 (包含 Anchors 和 ShortTerm)
  const memoryMessages = memoryManager.getContext()
  
  // 3. 处理 Memory 消息并合并
  for (const msg of memoryMessages) {
    // 复制消息并添加 metadata
    if (msg instanceof HumanMessage) {
        messages.push(new HumanMessage({
            content: msg.content,
            additional_kwargs: { isHistory: true, ...msg.additional_kwargs }
        }))
    } else if (msg instanceof AIMessage) {
        messages.push(new AIMessage({
            content: msg.content,
            additional_kwargs: { isHistory: true, ...msg.additional_kwargs }
        }))
    } else if (msg instanceof SystemMessage) {
        // Anchors (系统提示词/用户目标)
        // 保持原样，llmCall 会将其置顶
        messages.push(msg)
    }
  }

  // 注意：LangGraph 的 reducer 通常是追加模式。
  // 最终顺序由 llmCall 节点负责调整 (System -> History -> User Input)。

  return {
    messages: messages
  }
}
