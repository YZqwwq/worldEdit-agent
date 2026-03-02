import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { memoryManager } from '../../memory/MemoryManager'

export async function memoryNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const messages = state.messages
  
  // 策略：找到本轮对话中的 User 消息和 AI 消息并保存
  // 这里的假设是：memoryNode 在一轮对话的末尾运行
  
  // 1. 保存最近的一条 User 消息
  // 倒序查找，直到找到 HumanMessage
  const userMsg = messages.slice().reverse().find(m => m instanceof HumanMessage)
  if (userMsg && typeof userMsg.content === 'string') {
      // 只有当这条消息不在 shortTerm 的末尾时才添加（由 manager 内部去重控制）
      // 但为了更严谨，manager 的去重只检查最后一条。
      // 如果用户连续发了两条消息，或者 Human -> AI -> Human -> AI 结构，
      // 我们需要确保顺序。
      // 简单起见，我们先尝试添加 User，再尝试添加 AI。
      // 这样如果 User 已经在末尾（例如刚添加过），会被忽略。
      // 如果 AI 在 User 之后，User 会被添加（如果之前没加），然后 AI 被添加。
      
      // 风险：如果 User 消息很早以前就加过了（上一轮），现在又加一遍？
      // 上一轮结束时，ShortTerm 应该是 [..., User_Old, AI_Old]
      // 这一轮 User_New 进来。
      // User_Old != User_New (通常)。
      // 如果 User_New 内容和 AI_Old 一样（极少见），可能会被去重。
      // 关键是：我们需要区分“本轮 User”和“历史 User”。
      // 历史 User 在 contextNode 加载时可能已经在 messages 里了（如果 contextNode 从 memory 加载）。
      // 如果 contextNode 从 memory 加载，那么 state.messages 里包含了所有 ShortTerm。
      // 那么 userMsg 可能是 ShortTerm 里的最后一条 User。
      // 如果我们再 add 一遍，MemoryManager 会检查 lastMsg。
      // 此时 lastMsg 可能是 AI_Old。User_Old != AI_Old。于是 User_Old 被重复添加！
      
      // 这是一个问题。
      // 解决办法：
      // memoryNode 不应该负责添加“历史消息”。
      // 它只应该添加“本轮新产生的消息”。
      // 哪些是新产生的？
      // 1. User Input (由 UserHandler 或 aiService 注入，不在 memory 中)
      // 2. AI Output (由 LLM 生成)
      
      // 如果 contextNode 正确实现了“从 Memory 加载”，那么 state.messages = [Memory..., User_New]
      // 此时 User_New 是新的。
      // AI 生成后：[Memory..., User_New, AI_New]
      // memoryNode 看到这个数组。
      // 它应该把 User_New 和 AI_New 存入。
      // 如何识别 Memory 部分？
      // 我们可以比较 state.messages 的长度和 MemoryManager.shortTerm 的长度？
      // 或者，contextNode 加载的消息带有 metadata `isHistory: true`（之前代码里有）。
      // 我们可以利用这个标记！
  }

  // 1. 保存 User 消息 (非历史)
  const userMsgs = messages.filter(m => m instanceof HumanMessage && !m.additional_kwargs?.isHistory)
  for (const msg of userMsgs) {
      if (typeof msg.content === 'string') {
          await memoryManager.addMessage('user', msg.content)
      }
  }

  // 2. 保存 AI 消息 (非历史)
  // AI 消息通常是刚生成的，肯定没有 isHistory 标记
  const aiMsgs = messages.filter(m => m instanceof AIMessage && !m.additional_kwargs?.isHistory)
  for (const msg of aiMsgs) {
      if (typeof msg.content === 'string' && msg.content.length > 0) {
           // 忽略纯 ToolCall 的 AI 消息（没有 content）
           await memoryManager.addMessage('ai', msg.content)
      }
  }

  return {}
}
