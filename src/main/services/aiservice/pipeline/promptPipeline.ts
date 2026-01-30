import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'

export interface PromptContext {
  userInput: string
  history?: Array<{ role: string; text: string }> //维护一个文本session-history.md为上下文
  rolePrompt?: string
  systemPrompt?: string
  memoryBank?: string
  sessionHistoryMd?: string
}

export type PromptHandler = (ctx: PromptContext, acc: BaseMessage[]) => void | Promise<void>

export class PromptPipeline {
  private readonly handlers: PromptHandler[] = []

  // 使用 promptPipelien.use(handle1).use(handel2)添加
  use(handler: PromptHandler): PromptPipeline {
    this.handlers.push(handler)
    return this
  }

  // 最终构建完整提示词
  async run(ctx: PromptContext): Promise<BaseMessage[]> {
    const acc: BaseMessage[] = []
    for (const h of this.handlers) await h(ctx, acc)
    return acc
  }
}

//人格指令
export const roleHandle: PromptHandler = (ctx, acc) => {
  const text = ctx.rolePrompt?.trim()
  if (text) acc.push(new SystemMessage(text))
}

// 内置 handlers：系统指令
export const systemHandler: PromptHandler = (ctx, acc) => {
  const text = ctx.systemPrompt?.trim()
  if (text) acc.push(new SystemMessage(text))
}

// 内置 handlers：长期记忆总结（memory bank）
export const permanentMemoryHandler: PromptHandler = (ctx, acc) => {
  const persona = ctx.memoryBank?.trim()
  if (persona) acc.push(new SystemMessage(`Persona:\n${persona}`))
}

export const sessionMarkdownHandler: PromptHandler = (ctx, acc) => {
  const md = ctx.sessionHistoryMd?.trim()
  if (md) acc.push(new SystemMessage(md))
}

// 内置 handlers：历史上下文（最近 N 条）
export const historyHandler =
  (limit = 10): PromptHandler =>
  (ctx, acc) => {
    const turns = (ctx.history ?? []).slice(-limit)
    for (const t of turns) {
      if (t.role === 'user') acc.push(new HumanMessage(t.text))
      else acc.push(new AIMessage(t.text))
    }
  }

// 内置 handlers：当前用户输入
export const userHandler: PromptHandler = (ctx, acc) => {
  acc.push(new HumanMessage(ctx.userInput))
}
