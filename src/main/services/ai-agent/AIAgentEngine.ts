/**
 * AI Agent引擎核心类
 * 负责AI模型的初始化、消息处理和工具调用管理
 */

import { ChatOpenAI } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents'
import { Tool } from '@langchain/core/tools'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import {
  ModelProvider,
  MessageType,
  AgentStatus
} from '../../types/agent'
import type {
  AgentConfig,
  ModelConfig,
  ChatMessage,
  AgentState,
  TokenUsage,
  ToolCall
} from '../../types/agent'

/**
 * AI Agent引擎类
 */
export class AIAgentEngine {
  private agent: AgentExecutor | null = null
  private model: ChatOpenAI | ChatAnthropic | null = null
  private tools: Tool[] = []
  private config: AgentConfig | null = null
  private state: AgentState = {
    status: AgentStatus.IDLE,
    isInitialized: false
  }
  private conversationHistory: ChatMessage[] = []

  /**
   * 初始化AI Agent
   */
  async initialize(config: AgentConfig): Promise<void> {
    try {
      this.setState({ status: AgentStatus.INITIALIZING, message: '正在初始化AI Agent...' })
      
      this.config = config
      
      // 初始化模型
      await this.initializeModel(config.currentModel)
      
      // 初始化工具
      await this.initializeTools()
      
      // 创建Agent
      await this.createAgent()
      
      this.setState({
        status: AgentStatus.IDLE,
        isInitialized: true,
        message: 'AI Agent初始化完成'
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      this.setState({
        status: AgentStatus.ERROR,
        error: errorMessage,
        message: `初始化失败: ${errorMessage}`
      })
      throw error
    }
  }

  /**
   * 发送消息并获取回复
   */
  async sendMessage(message: string, context?: any): Promise<string> {
    if (!this.agent || !this.config) {
      throw new Error('AI Agent未初始化')
    }

    // Processing message with AI agent

    try {
      this.setState({ status: AgentStatus.PROCESSING, message: '正在处理消息...' })
      
      // 添加用户消息到历史
      const userMessage: ChatMessage = {
        id: this.generateMessageId(),
        type: MessageType.USER,
        content: message,
        timestamp: Date.now()
      }
      this.conversationHistory.push(userMessage)
      
      // 构建输入
      const input = {
        input: message,
        chat_history: this.buildChatHistory(),
        context: context || {}
      }
      console.log('AIAgentEngine - 准备调用agent.invoke:', {
        input,
        chatHistoryLength: this.buildChatHistory().length
      })
      // 调用Agent
      const result = await this.agent.invoke(input)
      
      console.log('AIAgentEngine - agent.invoke result get successfully:', result)
      
      let finalOutput = result.output
      
      // 如果Agent返回空字符串或无效输出，使用模型直接回答
      if (!finalOutput || finalOutput.trim() === '') {
        console.log('AIAgentEngine - Agent returned empty output, using direct model response')
        try {
          const directResponse = await this.model!.invoke([
            new SystemMessage(this.config.systemPrompt),
            ...this.buildChatHistory(),
            new HumanMessage(message)
          ])
          finalOutput = directResponse.content as string
        } catch (directError) {
          console.error('AIAgentEngine - Direct model call failed:', directError)
          finalOutput = '抱歉，我现在无法处理您的请求。请稍后再试。'
        }
      }
      
      // 添加AI回复到历史
      const aiMessage: ChatMessage = {
        id: this.generateMessageId(),
        type: MessageType.ASSISTANT,
        content: finalOutput,
        timestamp: Date.now(),
        metadata: {
          tokenUsage: this.extractTokenUsage(result),
          toolCalls: this.extractToolCalls(result)
        }
      }
      this.conversationHistory.push(aiMessage)
      
      // 限制历史长度
      this.trimConversationHistory()
      
      this.setState({ status: AgentStatus.IDLE, message: '消息处理完成' })
      
      return finalOutput
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      console.error('AIAgentEngine - sendMessage调用失败:', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      })
      this.setState({
        status: AgentStatus.ERROR,
        error: errorMessage,
        message: `消息处理失败: ${errorMessage}`
      })
      throw error
    }
  }

  /**
   * 添加工具
   */
  async addTool(tool: Tool): Promise<void> {
    this.tools.push(tool)
    
    // 如果Agent已初始化，重新创建Agent以包含新工具
    if (this.agent && this.config) {
      await this.createAgent()
    }
  }

  /**
   * 更新配置
   */
  async updateConfig(newConfig: Partial<AgentConfig>): Promise<void> {
    if (!this.config) {
      throw new Error('AI Agent未初始化')
    }

    const updatedConfig = { ...this.config, ...newConfig }
    
    // 如果模型配置发生变化，重新初始化模型
    if (newConfig.currentModel && 
        JSON.stringify(newConfig.currentModel) !== JSON.stringify(this.config.currentModel)) {
      await this.initializeModel(updatedConfig.currentModel)
      await this.createAgent()
    }
    
    this.config = updatedConfig
  }

  /**
   * 获取对话历史
   */
  getConversationHistory(): ChatMessage[] {
    return [...this.conversationHistory]
  }

  /**
   * 清空对话历史
   */
  clearConversationHistory(): void {
    this.conversationHistory = []
  }

  /**
   * 获取当前状态
   */
  getState(): AgentState {
    return { ...this.state }
  }

  /**
   * 获取当前配置
   */
  getConfig(): AgentConfig | null {
    return this.config ? { ...this.config } : null
  }

  /**
   * 初始化模型
   */
  private async initializeModel(modelConfig: ModelConfig): Promise<void> {
    // Initializing model configuration
    
    switch (modelConfig.provider) {
      case ModelProvider.OPENAI:
        this.model = new ChatOpenAI({
          apiKey: modelConfig.apiKey,
          modelName: modelConfig.modelName,
          temperature: modelConfig.temperature,
          maxTokens: modelConfig.maxTokens,
          maxRetries: modelConfig.maxRetries,
          timeout: modelConfig.timeout,
          ...(modelConfig.baseURL && { configuration: { baseURL: modelConfig.baseURL } })
        })
        break
        
      case ModelProvider.CLAUDE:
        this.model = new ChatAnthropic({
          anthropicApiKey: modelConfig.apiKey,
          modelName: modelConfig.modelName,
          temperature: modelConfig.temperature,
          maxTokens: modelConfig.maxTokens,
          maxRetries: modelConfig.maxRetries,
          ...(modelConfig.baseURL && { baseURL: modelConfig.baseURL })
        })
        break
        
      case ModelProvider.DEEPSEEK:
        // DeepSeek使用OpenAI兼容接口
        this.model = new ChatOpenAI({
          openAIApiKey: modelConfig.apiKey,
          modelName: modelConfig.modelName,
          temperature: modelConfig.temperature,
          maxTokens: modelConfig.maxTokens,
          maxRetries: modelConfig.maxRetries,
          timeout: modelConfig.timeout,
          configuration: {
            baseURL: modelConfig.baseURL || 'https://api.deepseek.com/v1'
          }
        })
        break
        
      default:
        throw new Error(`不支持的模型提供商: ${modelConfig.provider}`)
    }
  }

  /**
   * 初始化工具
   */
  private async initializeTools(): Promise<void> {
    // 工具将在后续任务中添加
    // 这里预留工具初始化逻辑
  }

  /**
   * 创建Agent
   */
  private async createAgent(): Promise<void> {
    if (!this.model || !this.config) {
      throw new Error('模型或配置未初始化')
    }

    try {
      // 创建提示模板
      const prompt = ChatPromptTemplate.fromMessages([
        ['system', this.config.systemPrompt],
        ['placeholder', '{chat_history}'],
        ['human', '{input}'],
        ['placeholder', '{agent_scratchpad}']
      ])

      // 创建Agent
      const agent = await createOpenAIFunctionsAgent({
        llm: this.model,
        tools: this.tools,
        prompt
      })

      // 创建Agent执行器
      this.agent = new AgentExecutor({
        agent,
        tools: this.tools,
        verbose: false,
        maxIterations: 10,
        returnIntermediateSteps: true,
        // 当没有工具可用时，允许Agent直接回答
        handleParsingErrors: true,
        // 设置早期停止方法，当Agent无法找到合适工具时直接返回回答
        earlyStoppingMethod: 'generate'
      })
      
      // Agent created successfully
    } catch (error) {
      throw new Error(`创建Agent失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  /**
   * 构建聊天历史
   */
  private buildChatHistory(): (HumanMessage | AIMessage | SystemMessage)[] {
    const history: (HumanMessage | AIMessage | SystemMessage)[] = []
    
    // 只取最近的消息，避免上下文过长
    const recentMessages = this.conversationHistory.slice(-this.config!.contextWindowSize)
    
    for (const message of recentMessages) {
      switch (message.type) {
        case MessageType.USER:
          history.push(new HumanMessage(message.content))
          break
        case MessageType.ASSISTANT:
          history.push(new AIMessage(message.content))
          break
        case MessageType.SYSTEM:
          history.push(new SystemMessage(message.content))
          break
      }
    }
    
    return history
  }

  /**
   * 限制对话历史长度
   */
  private trimConversationHistory(): void {
    if (!this.config) return
    
    const maxHistory = this.config.contextWindowSize * 2 // 保留更多历史用于持久化
    if (this.conversationHistory.length > maxHistory) {
      this.conversationHistory = this.conversationHistory.slice(-maxHistory)
    }
  }

  /**
   * 提取令牌使用信息
   */
  private extractTokenUsage(result: any): TokenUsage | undefined {
    // 从结果中提取令牌使用信息
    // 具体实现取决于Langchain的返回格式
    if (result.usage) {
      return {
        promptTokens: result.usage.prompt_tokens || 0,
        completionTokens: result.usage.completion_tokens || 0,
        totalTokens: result.usage.total_tokens || 0
      }
    }
    return undefined
  }

  /**
   * 提取工具调用信息
   */
  private extractToolCalls(result: any): ToolCall[] | undefined {
    // 从结果中提取工具调用信息
    // 具体实现取决于Langchain的返回格式
    if (result.intermediateSteps) {
      return result.intermediateSteps.map((step: any, index: number) => ({
        id: `tool_${Date.now()}_${index}`,
        name: step.action?.tool || 'unknown',
        arguments: step.action?.toolInput || {},
        result: step.observation,
        status: 'success' as const
      }))
    }
    return undefined
  }

  /**
   * 生成消息ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 更新状态
   */
  private setState(newState: Partial<AgentState>): void {
    this.state = { ...this.state, ...newState }
  }
}