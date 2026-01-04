import { SystemMessage } from '@langchain/core/messages'
import { MessagesState } from '../../state/messageState'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { app } from 'electron'

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
    // 为了简单起见，这里演示读取源文件路径（仅开发环境有效），
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
  
  return {
    messages: [systemMessage]
  }
}
