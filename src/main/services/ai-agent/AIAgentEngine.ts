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
  MessageType
} from '../../../shared/entities'
import type {
  ChatMessage,
  TokenUsage,
  ToolCall,
} from '../../../shared/entities/agent';
import type { RuntimeAgentState } from '../../../shared/cache-types/agent/agent';
import { AgentStatus } from '../../../shared/entities/agent';
import { ModelProvider } from '../../../shared/cache-types/agent/modelEnum';
import { ServiceAgentConfig } from '../../../shared/cache-types/agent/agent'
import { PromptPipeline } from '../prompt/PromptPipeline'
import { buildMCPPromptWithTools } from '../../system-prompt/system-mcp-prompt'

/**
 * AI Agent引擎类
 */
export class AIAgentEngine {
  private agent: AgentExecutor | null = null
  private model: ChatOpenAI | ChatAnthropic | null = null
  private tools: Tool[] = []
  private config: ServiceAgentConfig | null = null
  private state: RuntimeAgentState = {
    status: AgentStatus.IDLE,
  }
  private conversationHistory: ChatMessage[] = []
  private promptPipeline: PromptPipeline | null = null

  /**
   * 初始化AI Agent(为index 提供 initialize方法)
   */
  async initialize(config: ServiceAgentConfig): Promise<void> {
    try {
      this.setState({ status: AgentStatus.INITIALIZING, message: 'initializeing AI Agent...' })
      
      this.config = config
      
      // 初始化模型
      await this.initializeModel(config)
      
      // 初始化工具
      await this.initializeTools()
      
      // 创建Agent
      await this.createAgent()
      
      this.setState({
        status: AgentStatus.IDLE,
        message: 'AI Agent initialized successfully'
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown error'
      this.setState({
        status: AgentStatus.ERROR,
        message: `initialize error: ${errorMessage}`
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
        createdAt: new Date.now()
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
  async updateConfig(newConfig: Partial<ServiceAgentConfig>): Promise<void> {
    if (!this.config) {
      throw new Error('AI Agent未初始化')
    }

    const updatedConfig = { ...this.config, ...newConfig }
    
    // 如果模型配置发生变化，重新初始化模型
    if ((newConfig.provider && newConfig.provider !== this.config.provider) ||
        (newConfig.modelName && newConfig.modelName !== this.config.modelName) ||
        (newConfig.apiKey && newConfig.apiKey !== this.config.apiKey) ||
        (newConfig.baseURL && newConfig.baseURL !== this.config.baseURL)) {
      await this.initializeModel(updatedConfig)
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
   * 添加消息到对话历史
   */
  addMessageToHistory(message: ChatMessage): void {
    this.conversationHistory.push(message)
    this.trimConversationHistory()
  }

  /**
   * 批量添加消息到对话历史
   */
  addMessagesToHistory(messages: ChatMessage[]): void {
    this.conversationHistory.push(...messages)
    this.trimConversationHistory()
  }

  /**
   * 加载消息历史到引擎
   * 替换当前的对话历史
   */
  loadMessageHistory(messages: ChatMessage[]): void {
    this.conversationHistory = [...messages]
    this.trimConversationHistory()
  }

  /**
   * 获取当前状态
   */
  getState(): RuntimeAgentState {
    return { ...this.state }
  }

  /**
   * 获取当前配置
   */
  getConfig(): ServiceAgentConfig | null {
    return this.config ? { ...this.config } : null
  }

  /**
   * 初始化模型(加载模型配置)
   */
  private async initializeModel(config: ServiceAgentConfig): Promise<void> {
    // Initializing model configuration
    
    switch (config.provider) {
      case ModelProvider.OPENAI:
        this.model = new ChatOpenAI({
          apiKey: config.apiKey,
          modelName: config.modelName,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          maxRetries: config.maxRetries,
          timeout: config.timeout,
          ...(config.baseURL && { configuration: { baseURL: config.baseURL } })
        })
        break
        
      case ModelProvider.CLAUDE:
        this.model = new ChatAnthropic({
          anthropicApiKey: config.apiKey,
          modelName: config.modelName,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          maxRetries: config.maxRetries,
          ...(config.baseURL && { baseURL: config.baseURL })
        })
        break
        
      case ModelProvider.DEEPSEEK:
        // DeepSeek使用OpenAI兼容接口
        this.model = new ChatOpenAI({
          openAIApiKey: config.apiKey,
          modelName: config.modelName,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          maxRetries: config.maxRetries,
          timeout: config.timeout,
          configuration: {
            baseURL: config.baseURL || 'https://api.deepseek.com/v1'
          }
        })
        break
        
      default:
        throw new Error(`不支持的模型提供商: ${config.provider}`)
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
      // 初始化提示词管道
      this.initializePromptPipeline()
      
      // 构建最终系统提示词
      const finalSystemPrompt = this.buildSystemPrompt()
      
      // 创建提示模板
      const prompt = ChatPromptTemplate.fromMessages([
        ['system', finalSystemPrompt],
        ['placeholder', '{chat_history}'],
        ['human', '{input}'],
        ['placeholder', '{agent_scratchpad}']
      ])

      // 创建Agent
      // 使用langchain的createOpenAIFunctionsAgent创建Agent
      const agent = await createOpenAIFunctionsAgent({
        llm: this.model,
        tools: this.tools,
        prompt,
        streamRunnable: true
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
   * 初始化提示词管道
   */
  private initializePromptPipeline(): void {
    if (!this.config) return

    // 如果配置中有提示词管道配置，使用它
    if (this.config.promptConfig) {
      this.promptPipeline = PromptPipeline.fromConfig(this.config.promptConfig)
    } else {
      // 否则创建默认管道，兼容旧配置
      this.promptPipeline = PromptPipeline.createDefault(this.config.systemPrompt)
      
      // 如果启用了MCP工具，添加工具提示词
      if (this.config.enableMCPTools && this.tools.length > 0) {
        const mcpPrompt = buildMCPPromptWithTools(this.tools.map(tool => `${tool.name}: ${tool.description}`))
        this.promptPipeline.setToolPrompt(mcpPrompt)
      }
    }
  }

  /**
   * 构建最终系统提示词
   */
  private buildSystemPrompt(): string {
    if (!this.promptPipeline) {
      // 回退到传统方式
      return this.config?.systemPrompt || 'You are a helpful AI assistant.'
    }

    return this.promptPipeline.buildPrompt()
  }

  /**
   * 更新用户提示词
   */
  updateUserPrompt(userPrompt: string): void {
    if (this.promptPipeline) {
      this.promptPipeline.setUserPrompt(userPrompt)
      // 重新创建Agent以应用新的提示词
      if (this.agent !== null) {
        this.createAgent().catch(error => {
          console.error('更新用户提示词后重新创建Agent失败:', error)
        })
      }
    }
  }

  /**
   * 更新系统提示词
   */
  updateSystemPrompt(systemPrompt: string): void {
    if (this.promptPipeline) {
      this.promptPipeline.setSystemPrompt(systemPrompt)
      // 重新创建Agent以应用新的提示词
      if (this.agent !== null) {
        this.createAgent().catch(error => {
          console.error('更新系统提示词后重新创建Agent失败:', error)
        })
      }
    }
  }

  /**
   * 获取提示词管道统计信息
   */
  getPromptStats() {
    return this.promptPipeline?.getStats() || null
  }

  /**
   * 构建聊天历史
   */
  private buildChatHistory(): (HumanMessage | AIMessage | SystemMessage)[] {
    const history: (HumanMessage | AIMessage | SystemMessage)[] = []
    
    // 只取最近的消息，避免上下文过长
    const contextWindowSize = this.config!.contextWindowSize || 10
    const recentMessages = this.conversationHistory.slice(-contextWindowSize)
    
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
    
    const contextWindowSize = this.config.contextWindowSize || 10
    const maxHistory = contextWindowSize * 2 // 保留更多历史用于持久化
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
  private setState(newState: Partial<RuntimeAgentState>): void {
    this.state = { ...this.state, ...newState }
  }
}