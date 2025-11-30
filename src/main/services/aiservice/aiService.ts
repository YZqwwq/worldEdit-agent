import { ChatOpenAI } from '@langchain/openai'
import type { BaseMessage } from '@langchain/core/messages'
import type { AIStructuredResponse } from '../../../share/cache/render/aiagent/aiContent'
import { contentToText, contentToParts } from './messageoutput/transformRespones'
import {
  PromptPipeline,
  systemHandler,
  permanentMemoryHandler,
  userHandler,
  roleHandle,
  sessionMarkdownHandler
} from './pipeline/promptPipeline'
import { toErrorMessage, logError } from '../../../share/utils/error/error'
import { readFileSync } from 'fs'
import { join } from 'path'
import { rewriteSessionHistory } from './ai-utils/promptutils/compress'

class AIService {
  // 初始化对话模型
  private chat: ChatOpenAI
  // 初始化提示词管道
  private pipeline: PromptPipeline
  // 初始化永久记忆
  private permanentMemory?: string
  // 初始化系统提示词
  private systemPrompt: string = ''
  // 初始化角色提示词
  private rolePrompt?: string
  private sessionHistoryPath: string = join(
    process.cwd(),
    'src',
    'main',
    'prompt-resource',
    'historyprompt',
    'session-history.md'
  )

  constructor() {
    // 在此处硬编码您的API参数
    this.chat = new ChatOpenAI({
      // 使用 Responses API，避免部分兼容代理返回 completions 结构缺失导致 generations 为空
      useResponsesApi: true,
      // 启用流式输出
      streaming: true,
      // ChatOpenAI 支持 model / modelName；统一使用 model
      model: 'gpt-4o',
      temperature: 0.9,
      // 直接传递 apiKey，configuration 中仅保留 baseURL 等客户端配置
      apiKey: 'sk-tNyCJbWcFMiYPg8_HZg2aJjGn9owN4zzQ10jgPgaOV2l-6ZYFCLsvyuCFTI', // 请替换为您的 API Key
      configuration: {
        baseURL: 'https://api.nekro.ai/v1' // 请替换为您的 API 地址
      }
    })
    this.pipeline = new PromptPipeline()
      .use(systemHandler)
      .use(roleHandle)
      .use(sessionMarkdownHandler)
      .use(permanentMemoryHandler)
      .use(userHandler)

    try {
      const p = join(process.cwd(), 'src', 'main', 'prompt', 'systemprompt.md')
      const text = readFileSync(p, 'utf-8')
      this.systemPrompt = text || this.systemPrompt
    } catch {
      console.log('未找到文件夹')
    }
  }

  // 还未结合我们的工具注入提示词
  private async buildMessages(userInput: string): Promise<BaseMessage[]> {
    const ctx = {
      userInput,
      systemPrompt: this.systemPrompt,
      rolePrompt: this.rolePrompt,
      memoryBank: this.permanentMemory,
      sessionHistoryMd: (() => {
        try {
          return readFileSync(this.sessionHistoryPath, 'utf-8')
        } catch {
          return ''
        }
      })()
    }
    return this.pipeline.run(ctx)
  }

  async sendMessage(message: string): Promise<string> {
    try {
      await rewriteSessionHistory(this.chat, message, this.sessionHistoryPath)
      const messages = await this.buildMessages(message)

      console.log(messages)
      const response = await this.chat.invoke(messages)
      console.log(response)

      // 内容提取：将 chunk.content 规范化为纯文本
      const text = contentToText(response.content as unknown)
      // 处理空文本：如果提取为空，回退到原始内容
      let out = ''
      if (text && text.length > 0) {
        out = text
      } else {
        out = typeof response.content === 'string' ? (response.content as string) : ''
      }
      return out
    } catch (error: unknown) {
      const errMsg = logError('Error sending message to AI:', error)
      return errMsg
    }
  }

  /**
   * 返回富结构内容：统一为片段数组，保留非文本类型。
   */
  async sendMessageStructured(message: string): Promise<AIStructuredResponse> {
    try {
      // 获取返回
      await rewriteSessionHistory(this.chat, message, this.sessionHistoryPath)
      const messages = await this.buildMessages(message)
      const response = await this.chat.invoke(messages)
      //组装为复结构
      const parts = contentToParts(response.content as unknown)
      return { parts }
    } catch (error: unknown) {
      const errMsg = logError('Error sending structured message to AI:', error)
      // 错误也以结构化返回
      return { parts: [{ type: 'error', message: errMsg }] }
    }
  }

  /**
   * 流式发送消息：逐 token 通过回调返回，并汇总最终文本。
   */
  async sendStreamMessage(message: string, onToken?: (token: string) => void): Promise<string> {
    await rewriteSessionHistory(this.chat, message, this.sessionHistoryPath)
    const messages = await this.buildMessages(message)

    // 内容提取：将 chunk.content 规范化为纯文本
    // 使用共享转换函数，避免局部箭头函数触发 linter

    try {
      const stream = await this.chat.stream(messages)
      let fullText = ''
      for await (const chunk of stream as AsyncIterable<{
        content: unknown
      }> as unknown as AsyncIterable<{ content: unknown }>) {
        const token = contentToText((chunk as { content: unknown }).content)
        if (token) {
          fullText += token
          if (onToken) onToken(token)
        }
      }
      return fullText
    } catch (error: unknown) {
      const errMsg = logError('Error streaming message from AI:', error)
      try {
        const response = await this.chat.invoke(messages)
        const out =
          typeof response.content === 'string'
            ? response.content
            : contentToText(response.content as unknown) || JSON.stringify(response.content)
        return out
      } catch (e: unknown) {
        const fallbackMsg = toErrorMessage(e)
        console.error('Fallback invoke failed:', fallbackMsg, e)
        return '抱歉，AI流式服务暂不可用。' + errMsg
      }
    }
  }
}

export const aiService = new AIService()
