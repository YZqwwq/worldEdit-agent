/**
 * AI Agent 模块主入口文件
 * 整合所有AI Agent相关功能并提供统一的导出接口
 */

// ==================== 内部导入 ====================
import { createAIAgentAPIService, AIAgentAPIService, aiAgentAPI } from '../services/ai-agent-api'
import { createAIAgentPlugin, AIAgentPlugin, aiAgentPlugin } from '../plugins/ai-agent-plugins'
import { storage, eventBus, generateId, debounce, throttle, retry } from '../utils/ai-agent-utils'
import { useAIAgent, useSmartWriting, useTheme } from '../composables/useAIAgent'
import { DEFAULT_MODEL_CONFIGS, DEFAULT_AGENT_CONFIG } from '../../../shared/cache-types/agent/agent'

// ==================== 组件导出 ====================
export { default as AIAgentHub } from '../components/AIAgentHub.vue'
export { default as AIChat } from '../components/AIChat.vue'
export { default as ChatHistory } from '../components/ChatHistory.vue'
export { default as ModelConfigComponent } from '../components/ModelConfig.vue'
export { default as SmartWritingAssistant } from '../components/SmartWritingAssistant.vue'

// ==================== 类型定义导出 ====================
export type {
  // 基础类型
  ModelProvider,
  ModelConfig,
  AgentConfig,
  MessageType,
  ChatMessage,
  ToolCall,
  TokenUsage,
  ChatSession,
  AgentStatus,
  RuntimeAgentState,
  AnalysisType,
  WorldAnalysisRequest,
  WorldAnalysisResult,
  AnalysisIssue,
  MCPTool,
  MCPServerConfig,
  
  // 智能创作相关
  WritingTemplate,
  WritingTask,
  OptimizationSuggestion,
  
  // 通用类型
  ConnectionStatus,
  UsageStats,
  APIResponse,
  PaginationParams,
  PaginatedResult,
  ExportOptions,
  ConfigPreset,
  Notification,
  BatchOperation,
  SearchResult
} from '../../../shared/cache-types/agent/agent'

// ==================== 服务导出 ====================
export {
  aiAgentAPI,
  createAIAgentAPIService,
  AIAgentAPIService,
  AIAgentAPIClient,
  type APIConfig,
  type RequestOptions,
  type ResponseInterceptor,
  type RequestInterceptor
} from '../services/ai-agent-api'

// 从ai-agent.ts导出的服务（重命名以避免冲突）
export { AIAgentAPIService as LegacyAIAgentAPIService } from '../services/serviceImpl/ai-agent'

// ==================== 工具函数导出 ====================
export {
  // 格式化函数
  formatTimestamp,
  formatFileSize,
  formatTokenUsage,
  calculateTokenCost,
  
  // 工具函数
  generateId,
  deepClone,
  debounce,
  throttle,
  
  // 验证函数
  isValidEmail,
  isValidUrl,
  
  // 文本处理
  truncateText,
  highlightText,
  extractCodeBlocks,
  calculateSimilarity,
  
  // 聊天相关
  exportChatHistory,
  searchChatHistory,
  batchOperateSessions,
  
  // 状态相关
  getConnectionStatusText,
  getConnectionStatusClass,
  
  // 配置相关
  validateModelConfig,
  
  // 写作相关
  generateWritingTemplates,
  applyWritingTemplate,
  generateOptimizationSuggestions,
  
  // 统计相关
  calculateUsageStats,
  
  // 存储相关
  storage,
  
  // 事件总线
  eventBus,
  
  // 错误处理
  handleError,
  
  // 重试机制
  retry
} from '../utils/ai-agent-utils'

// ==================== 组合式API导出 ====================
export {
  useAIAgent,
  useSmartWriting,
  useTheme
} from '../composables/useAIAgent'

// ==================== 路由配置导入 ====================
import {
  aiAgentRoutes,
  quickTools,
  aiAgentGuards as routeGuards,
  breadcrumbConfig,
  pageTitles as pageTitleConfig,
  shortcuts
} from '../router/ai-agent'

// ==================== 路由配置导出 ====================
export {
  aiAgentRoutes,
  quickTools,
  routeGuards,
  breadcrumbConfig,
  pageTitleConfig,
  shortcuts
}

// ==================== 插件导出 ====================
export {
  aiAgentPlugin,
  createAIAgentPlugin,
  AIAgentPlugin,
  ShortcutManager,
  AutoSaveManager,
  ThemeManager,
  PerformanceMonitor,
  type AIAgentPluginOptions
} from '../plugins/ai-agent-plugins'

// ==================== 样式导出 ====================
// 注意：CSS文件需要在使用的地方手动导入
// import '../styles/ai-agent.css'

// ==================== 常量导出 ====================
export {
  DEFAULT_MODEL_CONFIGS,
  DEFAULT_AGENT_CONFIG
} from '../../../shared/cache-types/agent/agent'

// ==================== 版本信息 ====================
export const AI_AGENT_VERSION = '1.0.0'
export const AI_AGENT_BUILD_DATE = new Date().toISOString()

// ==================== 初始化函数 ====================

/**
 * AI Agent 初始化选项
 */
export interface AIAgentInitOptions {
  // API配置
  apiConfig?: {
    baseUrl?: string
    timeout?: number
    retries?: number
  }
  
  // 插件选项
  pluginOptions?: {
    enableShortcuts?: boolean
    enableAutoSave?: boolean
    autoSaveInterval?: number
    debug?: boolean
  }
  
  // 主题配置
  theme?: {
    defaultTheme?: string
    customThemes?: Record<string, any>
  }
  
  // 功能开关
  features?: {
    enableSmartWriting?: boolean
    enableChatHistory?: boolean
    enableModelConfig?: boolean
    enableToolManagement?: boolean
  }
  
  // 存储配置
  storage?: {
    prefix?: string
    enableEncryption?: boolean
  }
}

/**
 * 默认初始化选项
 */
const DEFAULT_INIT_OPTIONS: AIAgentInitOptions = {
  apiConfig: {
    baseUrl: 'http://localhost:3000/api',
    timeout: 30000,
    retries: 3
  },
  pluginOptions: {
    enableShortcuts: true,
    enableAutoSave: true,
    autoSaveInterval: 30000,
    debug: false
  },
  theme: {
    defaultTheme: 'auto',
    customThemes: {}
  },
  features: {
    enableSmartWriting: true,
    enableChatHistory: true,
    enableModelConfig: true,
    enableToolManagement: true
  },
  storage: {
    prefix: 'ai-agent-',
    enableEncryption: false
  }
}

/**
 * 初始化AI Agent模块
 */
export function initializeAIAgent(options: AIAgentInitOptions = {}): {
  plugin: AIAgentPlugin
  api: AIAgentAPIService
  version: string
} {
  const mergedOptions = {
    ...DEFAULT_INIT_OPTIONS,
    ...options,
    apiConfig: { ...DEFAULT_INIT_OPTIONS.apiConfig, ...options.apiConfig },
    pluginOptions: { ...DEFAULT_INIT_OPTIONS.pluginOptions, ...options.pluginOptions },
    theme: { ...DEFAULT_INIT_OPTIONS.theme, ...options.theme },
    features: { ...DEFAULT_INIT_OPTIONS.features, ...options.features },
    storage: { ...DEFAULT_INIT_OPTIONS.storage, ...options.storage }
  }

  // 创建API服务实例
  const api = createAIAgentAPIService(mergedOptions.apiConfig)

  // 创建插件实例
  const plugin = createAIAgentPlugin({
    ...mergedOptions.pluginOptions,
    customTheme: mergedOptions.theme?.customThemes,
    apiConfig: mergedOptions.apiConfig
  })

  // 注意：存储前缀功能暂未实现
  // TODO: 实现storage.setPrefix方法或使用其他方式处理存储前缀

  // 记录初始化信息
  console.log('[AI Agent] initialize module completed', {
    version: AI_AGENT_VERSION,
    buildDate: AI_AGENT_BUILD_DATE,
    options: mergedOptions
  })

  // 发送初始化完成事件
  eventBus.emit('ai-agent-initialized', {
    version: AI_AGENT_VERSION,
    options: mergedOptions
  })

  return {
    plugin,
    api,
    version: AI_AGENT_VERSION
  }
}

/**
 * 快速设置函数
 */
export function setupAIAgent(app: any, router?: any, options: AIAgentInitOptions = {}) {
  const { plugin, api } = initializeAIAgent(options)
  
  // 安装插件
  app.use(plugin, options.pluginOptions)
  
  // 注册路由
  if (router) {
    aiAgentRoutes.forEach(route => {
      router.addRoute(route)
    })
  }
  
  // 导入样式
  import('../styles/ai-agent.css')
  
  return { plugin, api }
}

/**
 * 获取模块信息
 */
export function getAIAgentInfo() {
  return {
    name: 'AI Agent',
    version: AI_AGENT_VERSION,
    buildDate: AI_AGENT_BUILD_DATE,
    description: 'AI智能助手模块，提供对话、创作、配置等功能',
    author: 'WorldEdit Agent Team',
    license: 'MIT',
    dependencies: {
      vue: '^3.0.0',
      'vue-router': '^4.0.0'
    },
    features: [
      'AI对话聊天',
      '智能创作辅助',
      '对话历史管理',
      '模型配置管理',
      'MCP工具集成',
      '主题切换',
      '快捷键支持',
      '自动保存',
      '性能监控',
      '批量操作',
      '数据导出',
      '搜索过滤'
    ]
  }
}

/**
 * 健康检查函数
 */
export async function healthCheck(): Promise<{
  status: 'healthy' | 'unhealthy'
  checks: Record<string, boolean>
  errors: string[]
}> {
  const checks: Record<string, boolean> = {}
  const errors: string[] = []

  try {
    // 检查API连接
    const connectionStatus = await aiAgentAPI.getConnectionStatus()
    checks.apiConnection = connectionStatus.connected
    if (!connectionStatus.connected && connectionStatus.error) {
      errors.push(`API连接失败: ${connectionStatus.error}`)
    }

    // 检查本地存储
    try {
      storage.set('health-check', Date.now())
      const value = storage.get('health-check')
      checks.localStorage = value !== null
      storage.remove('health-check')
    } catch (error) {
      checks.localStorage = false
      errors.push(`本地存储失败: ${error}`)
    }

    // 检查事件总线
    try {
      let eventReceived = false
      const handler = () => { eventReceived = true }
      eventBus.on('health-check', handler)
      eventBus.emit('health-check')
      eventBus.off('health-check', handler)
      checks.eventBus = eventReceived
    } catch (error) {
      checks.eventBus = false
      errors.push(`事件总线失败: ${error}`)
    }

    // 检查缓存
    try {
      const cacheStats = aiAgentAPI.getCacheStats()
      checks.cache = typeof cacheStats.size === 'number'
    } catch (error) {
      checks.cache = false
      errors.push(`缓存检查失败: ${error}`)
    }

  } catch (error) {
    errors.push(`健康检查失败: ${error}`)
  }

  const allHealthy = Object.values(checks).every(check => check === true)
  
  return {
    status: allHealthy ? 'healthy' : 'unhealthy',
    checks,
    errors
  }
}

/**
 * 清理函数
 */
export function cleanup(): void {
  try {
    // 取消所有API请求
    aiAgentAPI.cancelAllRequests()
    
    // 清除所有缓存
    aiAgentAPI.clearAllCache()
    
    // 清除事件监听器
    eventBus.removeAllListeners()
    
    // 销毁插件
    aiAgentPlugin.destroy()
    
    console.log('[AI Agent] cleanup module completed')
  } catch (error) {
    console.error('[AI Agent] cleanup module error:', error)
  }
}

// ==================== 默认导出 ====================
export default {
  // 核心功能
  initialize: initializeAIAgent,
  setup: setupAIAgent,
  cleanup,
  healthCheck,
  getInfo: getAIAgentInfo,
  
  // 版本信息
  version: AI_AGENT_VERSION,
  buildDate: AI_AGENT_BUILD_DATE,
  
  // 主要服务
  api: aiAgentAPI,
  plugin: aiAgentPlugin,
  
  // 工具函数
  utils: {
    eventBus,
    storage,
    generateId,
    debounce,
    throttle,
    retry
  },
  
  // 组合式API
  composables: {
    useAIAgent,
    useSmartWriting,
    useTheme
  },
  
  // 路由配置
  routes: aiAgentRoutes,
  
  // 常量
  constants: {
    DEFAULT_MODEL_CONFIGS,
    DEFAULT_AGENT_CONFIG
  }
}