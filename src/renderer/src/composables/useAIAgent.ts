/**
 * AI Agent 组合式API
 * 提供AI Agent相关的状态管理和业务逻辑
 */

import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import type {
  ChatMessage,
  ChatSession,
  ModelConfig,
  AgentConfig,
  ConnectionStatus,
  UsageStats,
  TokenUsage,
  MCPTool,
  MCPServerConfig,
  WritingTemplate,
  OptimizationSuggestion,
  Notification,
  APIResponse
} from '../../../shared/types/agent'
import { AIAgentAPIService } from '../services/ai-agent'
import {
  generateId,
  formatTimestamp,
  calculateUsageStats,
  storage,
  eventBus,
  handleError,
  retry
} from '../utils/ai-agent-utils'

/**
 * AI Agent 主要状态管理
 */
export function useAIAgent() {
  // 基础状态
  const isInitialized = ref(false)
  const isLoading = ref(false)
  const connectionStatus = ref<ConnectionStatus>('disconnected')
  const currentModel = ref<string>('')
  const error = ref<string>('')

  // 配置状态
  const modelConfig = reactive<ModelConfig>({
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    apiKey: '',
    baseUrl: '',
    temperature: 0.7,
    maxTokens: 2000,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
    stream: true,
    timeout: 30000,
    maxRetries: 3
  })

  const agentConfig = reactive<AgentConfig>({
    systemPrompt: '你是一个有用的AI助手。',
    maxHistoryLength: 50,
    enableTools: true,
    enableMemory: true,
    autoSave: true,
    language: 'zh-CN'
  })

  // 会话状态
  const currentSession = ref<ChatSession | null>(null)
  const sessions = ref<ChatSession[]>([])
  const isStreaming = ref(false)

  // 工具状态
  const availableTools = ref<MCPTool[]>([])
  const mcpServers = ref<MCPServerConfig[]>([])

  // 统计信息
  const usageStats = ref<UsageStats>({
    totalSessions: 0,
    totalMessages: 0,
    totalTokens: 0,
    todaySessions: 0,
    weekSessions: 0,
    monthSessions: 0,
    averageMessagesPerSession: 0,
    averageTokensPerSession: 0
  })

  // 通知状态
  const notifications = ref<Notification[]>([])

  // 计算属性
  const isConnected = computed(() => connectionStatus.value === 'connected')
  const hasCurrentSession = computed(() => currentSession.value !== null)
  const currentSessionMessages = computed(() => currentSession.value?.messages || [])
  const canSendMessage = computed(() => isConnected.value && !isStreaming.value)

  /**
   * 初始化AI Agent
   */
  async function initialize(): Promise<void> {
    if (isInitialized.value) return

    try {
      isLoading.value = true
      error.value = ''

      // 加载保存的配置
      const savedModelConfig = storage.get<ModelConfig>('ai-agent-model-config')
      if (savedModelConfig) {
        Object.assign(modelConfig, savedModelConfig)
      }

      const savedAgentConfig = storage.get<AgentConfig>('ai-agent-config')
      if (savedAgentConfig) {
        Object.assign(agentConfig, savedAgentConfig)
      }

      // 初始化API服务
      await AIAgentAPIService.initialize()

      // 加载会话历史
      await loadSessions()

      // 加载工具和服务器配置
      await loadTools()
      await loadMCPServers()

      // 更新统计信息
      updateUsageStats()

      // 尝试连接
      if (modelConfig.apiKey) {
        await connect()
      }

      isInitialized.value = true
    } catch (err) {
      error.value = handleError(err, 'AI Agent初始化')
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 连接到AI服务
   */
  async function connect(): Promise<void> {
    try {
      connectionStatus.value = 'connecting'
      error.value = ''

      const response = await AIAgentAPIService.testConnection(modelConfig)
      
      if (response.success) {
        connectionStatus.value = 'connected'
        currentModel.value = modelConfig.model
        addNotification({
          id: generateId('notification'),
          type: 'success',
          title: '连接成功',
          message: `已连接到 ${modelConfig.provider} - ${modelConfig.model}`,
          timestamp: Date.now()
        })
      } else {
        throw new Error(response.error || '连接失败')
      }
    } catch (err) {
      connectionStatus.value = 'error'
      error.value = handleError(err, 'AI服务连接')
      addNotification({
        id: generateId('notification'),
        type: 'error',
        title: '连接失败',
        message: error.value,
        timestamp: Date.now()
      })
    }
  }

  /**
   * 断开连接
   */
  async function disconnect(): Promise<void> {
    try {
      await AIAgentAPIService.disconnect()
      connectionStatus.value = 'disconnected'
      currentModel.value = ''
    } catch (err) {
      error.value = handleError(err, 'AI服务断开')
    }
  }

  /**
   * 更新模型配置
   */
  async function updateModelConfig(config: Partial<ModelConfig>): Promise<void> {
    try {
      Object.assign(modelConfig, config)
      storage.set('ai-agent-model-config', modelConfig)
      
      // 如果已连接，重新连接以应用新配置
      if (isConnected.value) {
        await connect()
      }
    } catch (err) {
      error.value = handleError(err, '更新模型配置')
    }
  }

  /**
   * 更新Agent配置
   */
  function updateAgentConfig(config: Partial<AgentConfig>): void {
    try {
      Object.assign(agentConfig, config)
      storage.set('ai-agent-config', agentConfig)
    } catch (err) {
      error.value = handleError(err, '更新Agent配置')
    }
  }

  /**
   * 创建新会话
   */
  async function createSession(title?: string): Promise<ChatSession> {
    try {
      const session: ChatSession = {
        id: generateId('session'),
        title: title || '新对话',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        modelConfig: { ...modelConfig },
        tokenUsage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        }
      }

      const response = await AIAgentAPIService.createSession(session)
      if (response.success && response.data) {
        sessions.value.unshift(response.data)
        currentSession.value = response.data
        updateUsageStats()
        return response.data
      } else {
        throw new Error(response.error || '创建会话失败')
      }
    } catch (err) {
      error.value = handleError(err, '创建会话')
      throw err
    }
  }

  /**
   * 加载会话
   */
  async function loadSessions(): Promise<void> {
    try {
      const response = await AIAgentAPIService.getSessions()
      if (response.success && response.data) {
        sessions.value = response.data
        updateUsageStats()
      }
    } catch (err) {
      error.value = handleError(err, '加载会话')
    }
  }

  /**
   * 选择会话
   */
  async function selectSession(sessionId: string): Promise<void> {
    try {
      const session = sessions.value.find(s => s.id === sessionId)
      if (session) {
        currentSession.value = session
      } else {
        const response = await AIAgentAPIService.getSession(sessionId)
        if (response.success && response.data) {
          currentSession.value = response.data
        } else {
          throw new Error('会话不存在')
        }
      }
    } catch (err) {
      error.value = handleError(err, '选择会话')
    }
  }

  /**
   * 删除会话
   */
  async function deleteSession(sessionId: string): Promise<void> {
    try {
      const response = await AIAgentAPIService.deleteSession(sessionId)
      if (response.success) {
        sessions.value = sessions.value.filter(s => s.id !== sessionId)
        if (currentSession.value?.id === sessionId) {
          currentSession.value = null
        }
        updateUsageStats()
      } else {
        throw new Error(response.error || '删除会话失败')
      }
    } catch (err) {
      error.value = handleError(err, '删除会话')
    }
  }

  /**
   * 发送消息
   */
  async function sendMessage(content: string, attachments?: any[]): Promise<void> {
    if (!currentSession.value) {
      await createSession()
    }

    if (!currentSession.value) {
      throw new Error('无法创建会话')
    }

    try {
      isStreaming.value = true
      error.value = ''

      // 创建用户消息
      const userMessage: ChatMessage = {
        id: generateId('message'),
        role: 'user',
        content,
        timestamp: Date.now(),
        attachments
      }

      // 添加到当前会话
      currentSession.value.messages.push(userMessage)
      currentSession.value.updatedAt = Date.now()

      // 创建助手消息占位符
      const assistantMessage: ChatMessage = {
        id: generateId('message'),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true
      }

      currentSession.value.messages.push(assistantMessage)

      // 发送消息并处理流式响应
      await AIAgentAPIService.sendMessage(
        currentSession.value.id,
        userMessage,
        {
          onChunk: (chunk: string) => {
            if (assistantMessage) {
              assistantMessage.content += chunk
            }
          },
          onComplete: (response: any) => {
            if (assistantMessage) {
              assistantMessage.isStreaming = false
              if (response.tokenUsage) {
                assistantMessage.tokenUsage = response.tokenUsage
                updateSessionTokenUsage(currentSession.value!, response.tokenUsage)
              }
            }
          },
          onError: (error: string) => {
            if (assistantMessage) {
              assistantMessage.content = `错误: ${error}`
              assistantMessage.isStreaming = false
              assistantMessage.error = error
            }
          }
        }
      )

      // 保存会话
      await saveSession(currentSession.value)
      updateUsageStats()

    } catch (err) {
      error.value = handleError(err, '发送消息')
      // 移除失败的消息
      if (currentSession.value) {
        currentSession.value.messages = currentSession.value.messages.filter(
          m => !m.isStreaming
        )
      }
    } finally {
      isStreaming.value = false
    }
  }

  /**
   * 停止生成
   */
  async function stopGeneration(): Promise<void> {
    try {
      await AIAgentAPIService.stopGeneration()
      isStreaming.value = false
      
      // 更新当前流式消息状态
      if (currentSession.value) {
        const streamingMessage = currentSession.value.messages.find(m => m.isStreaming)
        if (streamingMessage) {
          streamingMessage.isStreaming = false
          streamingMessage.content += '\n\n[生成已停止]'
        }
      }
    } catch (err) {
      error.value = handleError(err, '停止生成')
    }
  }

  /**
   * 重新生成回复
   */
  async function regenerateResponse(messageId: string): Promise<void> {
    if (!currentSession.value) return

    try {
      const messageIndex = currentSession.value.messages.findIndex(m => m.id === messageId)
      if (messageIndex === -1) return

      // 移除当前消息及之后的所有消息
      const messagesToKeep = currentSession.value.messages.slice(0, messageIndex)
      currentSession.value.messages = messagesToKeep

      // 获取最后一条用户消息
      const lastUserMessage = messagesToKeep
        .slice()
        .reverse()
        .find(m => m.type === 'user')

      if (lastUserMessage) {
        await sendMessage(lastUserMessage.content, lastUserMessage.attachments)
      }
    } catch (err) {
      error.value = handleError(err, '重新生成回复')
    }
  }

  /**
   * 保存会话
   */
  async function saveSession(session: ChatSession): Promise<void> {
    try {
      const response = await AIAgentAPIService.updateSession(session)
      if (response.success) {
        // 更新本地会话列表
        const index = sessions.value.findIndex(s => s.id === session.id)
        if (index !== -1) {
          sessions.value[index] = session
        }
      }
    } catch (err) {
      error.value = handleError(err, '保存会话')
    }
  }

  /**
   * 更新会话Token使用量
   */
  function updateSessionTokenUsage(session: ChatSession, tokenUsage: TokenUsage): void {
    if (!session.tokenUsage) {
      session.tokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      }
    }

    session.tokenUsage.promptTokens += tokenUsage.promptTokens
    session.tokenUsage.completionTokens += tokenUsage.completionTokens
    session.tokenUsage.totalTokens += tokenUsage.totalTokens
  }

  /**
   * 加载工具
   */
  async function loadTools(): Promise<void> {
    try {
      const response = await AIAgentAPIService.getAvailableTools()
      if (response.success && response.data) {
        availableTools.value = response.data
      }
    } catch (err) {
      error.value = handleError(err, '加载工具')
    }
  }

  /**
   * 加载MCP服务器
   */
  async function loadMCPServers(): Promise<void> {
    try {
      const response = await AIAgentAPIService.getMCPServers()
      if (response.success && response.data) {
        mcpServers.value = response.data
      }
    } catch (err) {
      error.value = handleError(err, '加载MCP服务器')
    }
  }

  /**
   * 调用工具
   */
  async function callTool(toolName: string, parameters: any): Promise<any> {
    try {
      const response = await AIAgentAPIService.callTool(toolName, parameters)
      if (response.success) {
        return response.data
      } else {
        throw new Error(response.error || '工具调用失败')
      }
    } catch (err) {
      error.value = handleError(err, '工具调用')
      throw err
    }
  }

  /**
   * 更新使用统计
   */
  function updateUsageStats(): void {
    usageStats.value = calculateUsageStats(sessions.value)
  }

  /**
   * 添加通知
   */
  function addNotification(notification: Notification): void {
    notifications.value.unshift(notification)
    
    // 自动移除通知
    if (notification.autoClose !== false) {
      setTimeout(() => {
        removeNotification(notification.id)
      }, notification.duration || 5000)
    }
  }

  /**
   * 移除通知
   */
  function removeNotification(id: string): void {
    const index = notifications.value.findIndex(n => n.id === id)
    if (index !== -1) {
      notifications.value.splice(index, 1)
    }
  }

  /**
   * 清除所有通知
   */
  function clearNotifications(): void {
    notifications.value = []
  }

  /**
   * 导出数据
   */
  async function exportData(options: any): Promise<void> {
    try {
      const response = await AIAgentAPIService.exportData(options)
      if (response.success && response.data) {
        // 触发下载
        const blob = new Blob([response.data], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ai-agent-data-${Date.now()}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        
        addNotification({
          id: generateId('notification'),
          type: 'success',
          title: '导出成功',
          message: '数据已成功导出',
          timestamp: Date.now()
        })
      }
    } catch (err) {
      error.value = handleError(err, '导出数据')
    }
  }

  /**
   * 导入数据
   */
  async function importData(file: File): Promise<void> {
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      
      const response = await AIAgentAPIService.importData(data)
      if (response.success) {
        await loadSessions()
        updateUsageStats()
        
        addNotification({
          id: generateId('notification'),
          type: 'success',
          title: '导入成功',
          message: '数据已成功导入',
          timestamp: Date.now()
        })
      } else {
        throw new Error(response.error || '导入失败')
      }
    } catch (err) {
      error.value = handleError(err, '导入数据')
    }
  }

  // 事件监听
  onMounted(() => {
    // 监听连接状态变化
    eventBus.on('connection-status-changed', (status: ConnectionStatus) => {
      connectionStatus.value = status
    })

    // 监听错误事件
    eventBus.on('error', (errorMessage: string) => {
      error.value = errorMessage
      addNotification({
        id: generateId('notification'),
        type: 'error',
        title: '错误',
        message: errorMessage,
        timestamp: Date.now()
      })
    })

    // 自动初始化
    initialize()
  })

  onUnmounted(() => {
    eventBus.off('connection-status-changed')
    eventBus.off('error')
  })

  return {
    // 状态
    isInitialized,
    isLoading,
    connectionStatus,
    currentModel,
    error,
    modelConfig,
    agentConfig,
    currentSession,
    sessions,
    isStreaming,
    availableTools,
    mcpServers,
    usageStats,
    notifications,
    
    // 计算属性
    isConnected,
    hasCurrentSession,
    currentSessionMessages,
    canSendMessage,
    
    // 方法
    initialize,
    connect,
    disconnect,
    updateModelConfig,
    updateAgentConfig,
    createSession,
    loadSessions,
    selectSession,
    deleteSession,
    sendMessage,
    stopGeneration,
    regenerateResponse,
    saveSession,
    loadTools,
    loadMCPServers,
    callTool,
    updateUsageStats,
    addNotification,
    removeNotification,
    clearNotifications,
    exportData,
    importData
  }
}

/**
 * 智能创作相关状态管理
 */
export function useSmartWriting() {
  const isProcessing = ref(false)
  const currentTemplate = ref<WritingTemplate | null>(null)
  const templates = ref<WritingTemplate[]>([])
  const processingHistory = ref<any[]>([])
  const optimizationSuggestions = ref<OptimizationSuggestion[]>([])
  const error = ref<string>('')

  /**
   * 加载写作模板
   */
  async function loadTemplates(): Promise<void> {
    try {
      const response = await AIAgentAPIService.getWritingTemplates()
      if (response.success && response.data) {
        templates.value = response.data
      }
    } catch (err) {
      error.value = handleError(err, '加载写作模板')
    }
  }

  /**
   * 选择模板
   */
  function selectTemplate(template: WritingTemplate): void {
    currentTemplate.value = template
  }

  /**
   * 处理文本
   */
  async function processText(
    text: string,
    operation: string,
    options?: any
  ): Promise<string> {
    try {
      isProcessing.value = true
      error.value = ''

      const response = await AIAgentAPIService.processText({
        text,
        operation,
        options
      })

      if (response.success && response.data) {
        // 添加到处理历史
        processingHistory.value.unshift({
          id: generateId('processing'),
          operation,
          originalText: text,
          processedText: response.data.result,
          timestamp: Date.now(),
          options
        })

        return response.data.result
      } else {
        throw new Error(response.error || '文本处理失败')
      }
    } catch (err) {
      error.value = handleError(err, '文本处理')
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * 获取优化建议
   */
  async function getOptimizationSuggestions(
    text: string,
    type: 'grammar' | 'style' | 'clarity' | 'engagement'
  ): Promise<void> {
    try {
      const response = await AIAgentAPIService.getOptimizationSuggestions({
        text,
        type
      })

      if (response.success && response.data) {
        optimizationSuggestions.value = response.data
      }
    } catch (err) {
      error.value = handleError(err, '获取优化建议')
    }
  }

  /**
   * 应用优化建议
   */
  async function applySuggestion(
    text: string,
    suggestion: OptimizationSuggestion
  ): Promise<string> {
    try {
      const response = await AIAgentAPIService.applySuggestion({
        text,
        suggestion
      })

      if (response.success && response.data) {
        return response.data.result
      } else {
        throw new Error(response.error || '应用建议失败')
      }
    } catch (err) {
      error.value = handleError(err, '应用优化建议')
      throw err
    }
  }

  /**
   * 清除处理历史
   */
  function clearProcessingHistory(): void {
    processingHistory.value = []
  }

  /**
   * 清除优化建议
   */
  function clearOptimizationSuggestions(): void {
    optimizationSuggestions.value = []
  }

  onMounted(() => {
    loadTemplates()
  })

  return {
    // 状态
    isProcessing,
    currentTemplate,
    templates,
    processingHistory,
    optimizationSuggestions,
    error,
    
    // 方法
    loadTemplates,
    selectTemplate,
    processText,
    getOptimizationSuggestions,
    applySuggestion,
    clearProcessingHistory,
    clearOptimizationSuggestions
  }
}

/**
 * 主题管理
 */
export function useTheme() {
  const currentTheme = ref<'light' | 'dark' | 'auto'>('auto')
  const isDark = ref(false)

  /**
   * 设置主题
   */
  function setTheme(theme: 'light' | 'dark' | 'auto'): void {
    currentTheme.value = theme
    storage.set('ai-agent-theme', theme)
    applyTheme()
  }

  /**
   * 应用主题
   */
  function applyTheme(): void {
    const root = document.documentElement
    
    if (currentTheme.value === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      isDark.value = prefersDark
    } else {
      isDark.value = currentTheme.value === 'dark'
    }
    
    if (isDark.value) {
      root.setAttribute('data-theme', 'dark')
    } else {
      root.removeAttribute('data-theme')
    }
  }

  /**
   * 切换主题
   */
  function toggleTheme(): void {
    if (currentTheme.value === 'light') {
      setTheme('dark')
    } else if (currentTheme.value === 'dark') {
      setTheme('light')
    } else {
      setTheme(isDark.value ? 'light' : 'dark')
    }
  }

  onMounted(() => {
    // 加载保存的主题
    const savedTheme = storage.get<'light' | 'dark' | 'auto'>('ai-agent-theme', 'auto')
    currentTheme.value = savedTheme
    applyTheme()

    // 监听系统主题变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      if (currentTheme.value === 'auto') {
        applyTheme()
      }
    }
    
    mediaQuery.addEventListener('change', handleChange)
    
    onUnmounted(() => {
      mediaQuery.removeEventListener('change', handleChange)
    })
  })

  return {
    currentTheme,
    isDark,
    setTheme,
    toggleTheme
  }
}