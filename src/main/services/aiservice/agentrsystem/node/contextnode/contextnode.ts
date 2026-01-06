import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { AppDataSource } from '../../../../../database'
import { Message } from '../../../../../../share/entity/database/Message'

/**
 * ContextNode: 负责构建全局上下文，包括 Persona、Memory 等。
 * 它作为图的入口节点，确保 LLM 在处理用户输入前拥有完整的背景信息。
 */
export async function contextNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  // 1. 定义基础人格 (从文件读取)
  let persona = ''
  try {
    // 假设 prompt-resource 目录在打包后位于 resources 目录或与 main 同级
    // 开发环境路径: src/main/prompt-resource/famila-daily/roleprompt/roleprompt.md
    // 这里使用相对路径回退查找，实际生产环境建议配置统一的资源路径
    // 生产环境应使用 app.isPackaged 判断并指向 resources 目录
    
    // 动态构建开发环境下的绝对路径
    const projectRoot = process.cwd() // 通常是项目根目录
    const rolePromptPath = join(projectRoot, 'src/main/prompt-resource/famila-daily/roleprompt/roleprompt.md')
    
    persona = await readFile(rolePromptPath, 'utf-8')
  } catch (error) {
    console.error('Failed to load role prompt:', error)
    // Fallback persona
    persona = `你是一个由 WorldEdit-Agent 驱动的智能助手。你的目标是协助用户进行世界编辑和创作。`
  }

  // 2. 模拟获取压缩记忆 (后续接入真实记忆模块)
  // const compressedMemory = await getMemoryFromDB()
  const compressedMemory = '' // 暂时为空

  // 3. 构建 System Message
  // 如果有记忆，附加到 System Prompt 中
  const systemContent = compressedMemory 
    ? `${persona}\n\n长期记忆:\n${compressedMemory}`
    : persona

  const systemMessage = new SystemMessage(systemContent)
  
  // 4. 加载最近历史记录 (从数据库)
  const historyMessages: BaseMessage[] = []
  try {
    const messageRepo = AppDataSource.getRepository(Message)
    // 获取最近 21 条（多取1条用于排除当前可能的重复输入）
    const recentMessages = await messageRepo.find({
      order: {
        createdAt: 'DESC' // 按创建时间倒序
      },
      take: 21
    })

    // 假设 state.messages 中最后一条是当前用户的输入
    const currentInput = state.messages[state.messages.length - 1]
    const currentInputContent = currentInput ? currentInput.content.toString() : ''

    // 过滤并反转顺序 (DB是倒序，对话需要正序)
    const validHistory = recentMessages
      .filter(msg => {
        // 简单去重：如果历史记录的内容等于当前输入，且角色是 user，则认为是同一条（刚存入的）
        // 注意：这种去重可能误伤（用户连续发同样的话），但在无 session ID 隔离情况下是比较安全的做法
        return !(msg.role === 'user' && msg.content === currentInputContent)
      })
      .slice(0, 20) // 确保只取 20 条
      .reverse() // 转为正序：旧 -> 新

    for (const msg of validHistory) {
      if (msg.role === 'user') {
        historyMessages.push(new HumanMessage({ 
          content: msg.content,
          additional_kwargs: { isHistory: true } // 标记为历史
        }))
      } else {
        historyMessages.push(new AIMessage({ 
          content: msg.content,
          additional_kwargs: { isHistory: true }
        }))
      }
    }
  } catch (error) {
    console.error('Failed to load history from DB:', error)
  }

  return {
    messages: [systemMessage, ...historyMessages]
  }
}
