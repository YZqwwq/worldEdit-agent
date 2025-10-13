/**
 * 模型适配器
 * 统一不同AI模型提供商的接口，提供一致的调用方式
 */

import { ChatOpenAI } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { BaseLanguageModel } from '@langchain/core/language_models/base'
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages'
import {
  TokenUsage,
  ChatMessage,
} from '../../../shared/cache-types/agent/agent'

import { ModelProvider } from '../../../shared/cache-types/agent/modelEnum';
import { MessageType } from '../../../shared/cache-types/agent/chatMessageTypeEnum'
import { AgentConfig } from '../../../shared/entities/agent/AgentConfig.entity'

/**
 * 模型响应接口
 */
export interface ModelResponse {
  content: string
  tokenUsage?: TokenUsage
  finishReason?: string
  model?: string
}

/**
 * 流式响应回调接口
 */
export interface StreamCallback {
  onToken?: (token: string) => void
  onComplete?: (response: ModelResponse) => void
  onError?: (error: Error) => void
}

/**
 * 模型适配器类
 */
export class ModelAdapter {
  private model: BaseLanguageModel | null = null
  private config: Partial<AgentConfig> | null = null

  /**
   * 初始化模型
   */
  async initialize(config: Partial<AgentConfig>): Promise<void> {
    // Initializing model adapter configuration
    
    this.config = config
    this.model = await this.createModel(config)
  }

  /**
   * 发送消息
   */
  async sendMessage(
    messages: ChatMessage[],
    options?: {
      temperature?: number
      maxTokens?: number
      stream?: boolean
      streamCallback?: StreamCallback
    }
  ): Promise<ModelResponse> {
    if (!this.model || !this.config) {
      throw new Error('模型未初始化')
    }

    try {
      const langchainMessages = this.convertToLangchainMessages(messages)
      
      if (options?.stream) {
        return await this.streamMessage(langchainMessages, options)
      } else {
        return await this.invokeMessage(langchainMessages, options)
      }
    } catch (error) {
      throw new Error(`模型调用失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  /**
   * 验证模型配置
   */
  async validateConfig(config: Partial<AgentConfig>): Promise<boolean> {
    try {
      const testModel = await this.createModel(config)
      
      // 发送测试消息
      const testMessage = new HumanMessage('Hello')
      await testModel.invoke([testMessage])
      
      return true
    } catch (error) {
      console.error('TypeORM database model config validate error:', error)
      return false
    }
  }

  /**
   * 获取模型信息
   */
  getModelInfo(): {
    provider: ModelProvider
    modelName: string
    isInitialized: boolean
  } | null {
    if (!this.config) {
      return null
    }

    return {
      provider: this.config.provider || ModelProvider.OPENAI,
      modelName: this.config.modelName || "",
      isInitialized: this.model !== null
    }
  }

  /**
   * 更新模型配置
   */
  async updateConfig(newConfig: Partial<AgentConfig>): Promise<void> {
    if (!this.config) {
      throw new Error('模型未初始化')
    }

    const updatedConfig = { ...this.config, ...newConfig }
    await this.initialize(updatedConfig)
  }

  /**
   * 估算令牌数量
   */
  estimateTokens(text: string): number {
    // 简单的令牌估算，实际应用中可以使用更精确的方法
    // 英文大约4个字符=1个令牌，中文大约1.5个字符=1个令牌
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
    const otherChars = text.length - chineseChars
    
    return Math.ceil(chineseChars / 1.5 + otherChars / 4)
  }

  /**
   * 获取支持的模型列表
   */
  getSupportedModels(): Record<ModelProvider, string[]> {
    return {
      [ModelProvider.OPENAI]: [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'gpt-4',
        'gpt-3.5-turbo'
      ],
      [ModelProvider.CLAUDE]: [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307'
      ],
      [ModelProvider.DEEPSEEK]: [
        'deepseek-chat',
        'deepseek-coder'
      ]
    }
  }

  /**
   * 创建模型实例
   */
  private async createModel(config: Partial<AgentConfig>): Promise<BaseLanguageModel> {

    switch (config.provider) {
      case ModelProvider.OPENAI:
        return new ChatOpenAI({
          apiKey: config.apiKey,
          modelName: config.modelName,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          maxRetries: config.maxRetries,
          timeout: config.timeout,
          ...(config.baseURL && {
            configuration: { baseURL: config.baseURL }
          })
        })

      case ModelProvider.CLAUDE:
        return new ChatAnthropic({
          anthropicApiKey: config.apiKey,
          modelName: config.modelName,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          maxRetries: config.maxRetries,
          ...(config.baseURL && { baseURL: config.baseURL })
        })

      case ModelProvider.DEEPSEEK:
        return new ChatOpenAI({
          apiKey: config.apiKey,
          modelName: config.modelName,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          maxRetries: config.maxRetries,
          timeout: config.timeout,
          configuration: {
            baseURL: config.baseURL || 'https://api.deepseek.com/v1'
          }
        })

      default:
        throw new Error(`不支持的模型提供商: ${config.provider}`)
    }
  }

  /**
   * 转换为Langchain消息格式
   */
  private convertToLangchainMessages(messages: ChatMessage[]): BaseMessage[] {
    return messages.map(message => {
      switch (message.type) {
        case MessageType.USER:
          return new HumanMessage(message.content)
        case MessageType.ASSISTANT:
          return new AIMessage(message.content)
        case MessageType.SYSTEM:
          return new SystemMessage(message.content)
        default:
          return new HumanMessage(message.content)
      }
    })
  }

  /**
   * 调用模型（非流式）
   */
  private async invokeMessage(
    messages: BaseMessage[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<ModelResponse> {
    if (!this.model) {
      throw new Error('模型未初始化')
    }

    // 临时更新模型参数
    if (options?.temperature !== undefined || options?.maxTokens !== undefined) {
      const bindOptions: any = {}
      if (options.temperature !== undefined) {
        bindOptions.temperature = options.temperature
      }
      if (options.maxTokens !== undefined) {
        bindOptions.maxTokens = options.maxTokens
      }
      
      const tempModel = this.model.bind(bindOptions)
      const result = await tempModel.invoke(messages)
      return this.parseModelResponse(result)
    }

    const result = await this.model.invoke(messages)
    return this.parseModelResponse(result)
  }

  /**
   * 流式调用模型
   */
  private async streamMessage(
    messages: BaseMessage[],
    options: {
      temperature?: number
      maxTokens?: number
      streamCallback?: StreamCallback
    }
  ): Promise<ModelResponse> {
    if (!this.model) {
      throw new Error('模型未初始化')
    }

    let fullContent = ''
    const callback = options.streamCallback

    try {
      // 临时更新模型参数
      const bindOptions: any = {}
      if (options.temperature !== undefined) {
        bindOptions.temperature = options.temperature
      }
      if (options.maxTokens !== undefined) {
        bindOptions.maxTokens = options.maxTokens
      }
      
      const streamModel = this.model.bind(bindOptions)

      const stream = await streamModel.stream(messages)
      
      for await (const chunk of stream) {
        const content = chunk.content as string
        if (content) {
          fullContent += content
          callback?.onToken?.(content)
        }
      }

      const response: ModelResponse = {
        content: fullContent,
        model: this.config?.modelName
      }

      callback?.onComplete?.(response)
      return response
    } catch (error) {
      const err = error instanceof Error ? error : new Error('流式调用失败')
      callback?.onError?.(err)
      throw err
    }
  }

  /**
   * 解析模型响应
   */
  private parseModelResponse(result: any): ModelResponse {
    const response: ModelResponse = {
      content: result.content || result.text || '',
      model: this.config?.modelName
    }

    // 提取令牌使用信息
    if (result.usage || result.tokenUsage) {
      const usage = result.usage || result.tokenUsage
      response.tokenUsage = {
        promptTokens: usage.prompt_tokens || usage.promptTokens || 0,
        completionTokens: usage.completion_tokens || usage.completionTokens || 0,
        totalTokens: usage.total_tokens || usage.totalTokens || 0
      }
    }

    // 提取完成原因
    if (result.finishReason || result.finish_reason) {
      response.finishReason = result.finishReason || result.finish_reason
    }

    return response
  }

  /**
   * 销毁模型实例
   */
  destroy(): void {
    this.model = null
    this.config = null
  }
}