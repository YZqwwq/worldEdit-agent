/**
 * AI Agent IPC通信处理器
 * 处理渲染进程与主进程之间的AI Agent相关通信
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { AIAgentService } from '../services/ai-agent'
import {
  AgentConfig,
  ChatMessage,
  ChatSession,
  RuntimeAgentState,
  MCPServerConfig,
  MCPTool
} from '../types/agent'
import { ModelConfig } from '../../shared/entities'
import { typeORMService } from '../services/database/TypeORMService'

/**
 * AI Agent服务实例
 */
let aiAgentService: AIAgentService | null = null

/**
 * IPC通道常量
 */
export const AI_AGENT_CHANNELS = {
  // 服务管理
  INITIALIZE: 'ai-agent:initialize',
  GET_STATE: 'ai-agent:get-state',
  UPDATE_CONFIG: 'ai-agent:update-config',
  DESTROY: 'ai-agent:destroy',
  
  // 对话管理
  SEND_MESSAGE: 'ai-agent:send-message',
  CREATE_SESSION: 'ai-agent:create-session',
  GET_ALL_SESSIONS: 'ai-agent:get-all-sessions',
  GET_SESSION_MESSAGES: 'ai-agent:get-session-messages',
  DELETE_SESSION: 'ai-agent:delete-session',
  UPDATE_SESSION_TITLE: 'ai-agent:update-session-title',
  CLEAR_ALL_SESSIONS: 'ai-agent:clear-all-sessions',
  
  // 模型管理
  VALIDATE_MODEL_CONFIG: 'ai-agent:validate-model-config',
  GET_MODEL_CONFIG: 'ai-agent:get-model-config',
  GET_ALL_MODEL_CONFIGS: 'ai-agent:get-all-model-configs',
  CREATE_MODEL_CONFIG: 'ai-agent:create-model-config',
  UPDATE_MODEL_CONFIG: 'ai-agent:update-model-config',
  DELETE_MODEL_CONFIG: 'ai-agent:delete-model-config',
  SET_DEFAULT_MODEL_CONFIG: 'ai-agent:set-default-model-config',
  GET_MODEL_INFO: 'ai-agent:get-model-info',
  GET_SUPPORTED_MODELS: 'ai-agent:get-supported-models',
  ESTIMATE_TOKENS: 'ai-agent:estimate-tokens',
  
  // 工具管理
  REGISTER_MCP_SERVER: 'ai-agent:register-mcp-server',
  GET_AVAILABLE_TOOLS: 'ai-agent:get-available-tools',
  
  // 数据管理
  SEARCH_MESSAGES: 'ai-agent:search-messages',
  GET_SESSION_STATS: 'ai-agent:get-session-stats',
  GET_GLOBAL_STATS: 'ai-agent:get-global-stats',
  EXPORT_SESSION: 'ai-agent:export-session',
  IMPORT_SESSION: 'ai-agent:import-session',
  
  // 事件通知
  STATE_CHANGED: 'ai-agent:state-changed',
  MESSAGE_RECEIVED: 'ai-agent:message-received',
  ERROR_OCCURRED: 'ai-agent:error-occurred'
} as const

/**
 * 注册AI Agent IPC处理器
 */
export function registerAIAgentIPC(): void {
  // Registering AI Agent IPC handlers...
  
  // 服务管理
  ipcMain.handle(AI_AGENT_CHANNELS.INITIALIZE, handleInitialize)
  ipcMain.handle(AI_AGENT_CHANNELS.GET_STATE, handleGetState)
  ipcMain.handle(AI_AGENT_CHANNELS.UPDATE_CONFIG, handleUpdateConfig)
  ipcMain.handle(AI_AGENT_CHANNELS.DESTROY, handleDestroy)
  
  // 对话管理
  ipcMain.handle(AI_AGENT_CHANNELS.SEND_MESSAGE, handleSendMessage)
  ipcMain.handle(AI_AGENT_CHANNELS.CREATE_SESSION, handleCreateSession)
  ipcMain.handle(AI_AGENT_CHANNELS.GET_ALL_SESSIONS, handleGetAllSessions)
  ipcMain.handle(AI_AGENT_CHANNELS.GET_SESSION_MESSAGES, handleGetSessionMessages)
  ipcMain.handle(AI_AGENT_CHANNELS.DELETE_SESSION, handleDeleteSession)
  ipcMain.handle(AI_AGENT_CHANNELS.UPDATE_SESSION_TITLE, handleUpdateSessionTitle)
  ipcMain.handle(AI_AGENT_CHANNELS.CLEAR_ALL_SESSIONS, handleClearAllSessions)
  
  // 模型管理
  ipcMain.handle(AI_AGENT_CHANNELS.VALIDATE_MODEL_CONFIG, handleValidateModelConfig)
  ipcMain.handle(AI_AGENT_CHANNELS.GET_MODEL_CONFIG, handleGetModelConfig)
  ipcMain.handle(AI_AGENT_CHANNELS.GET_ALL_MODEL_CONFIGS, handleGetAllModelConfigs)
  ipcMain.handle(AI_AGENT_CHANNELS.CREATE_MODEL_CONFIG, handleCreateModelConfig)
  ipcMain.handle(AI_AGENT_CHANNELS.UPDATE_MODEL_CONFIG, handleUpdateModelConfig)
  ipcMain.handle(AI_AGENT_CHANNELS.DELETE_MODEL_CONFIG, handleDeleteModelConfig)
  ipcMain.handle(AI_AGENT_CHANNELS.SET_DEFAULT_MODEL_CONFIG, handleSetDefaultModelConfig)
  ipcMain.handle(AI_AGENT_CHANNELS.GET_MODEL_INFO, handleGetModelInfo)
  ipcMain.handle(AI_AGENT_CHANNELS.GET_SUPPORTED_MODELS, handleGetSupportedModels)
  ipcMain.handle(AI_AGENT_CHANNELS.ESTIMATE_TOKENS, handleEstimateTokens)
  
  // 工具管理
  ipcMain.handle(AI_AGENT_CHANNELS.REGISTER_MCP_SERVER, handleRegisterMCPServer)
  ipcMain.handle(AI_AGENT_CHANNELS.GET_AVAILABLE_TOOLS, handleGetAvailableTools)
  
  // 数据管理
  ipcMain.handle(AI_AGENT_CHANNELS.SEARCH_MESSAGES, handleSearchMessages)
  ipcMain.handle(AI_AGENT_CHANNELS.GET_SESSION_STATS, handleGetSessionStats)
  ipcMain.handle(AI_AGENT_CHANNELS.GET_GLOBAL_STATS, handleGetGlobalStats)
  ipcMain.handle(AI_AGENT_CHANNELS.EXPORT_SESSION, handleExportSession)
  ipcMain.handle(AI_AGENT_CHANNELS.IMPORT_SESSION, handleImportSession)
  
  // AI Agent IPC handlers registered successfully
}

/**
 * 移除AI Agent IPC处理器
 */
export function unregisterAIAgentIPC(): void {
  // Removing AI Agent IPC handlers...
  
  // 移除所有处理器
  Object.values(AI_AGENT_CHANNELS).forEach(channel => {
    if (typeof channel === 'string' && !channel.includes('changed') && !channel.includes('received') && !channel.includes('occurred')) {
      ipcMain.removeHandler(channel)
    }
  })
  
  // AI Agent IPC handlers removed successfully
}

// ==================== 服务管理处理器 ====================

/**
 * 初始化AI Agent服务
 */
async function handleInitialize(
  event: IpcMainInvokeEvent,
  config: AgentConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    if (aiAgentService) {
      aiAgentService.destroy()
    }
    
    // 向AIAgent服务传递数据库工具
    aiAgentService = new AIAgentService(typeORMService)
    await aiAgentService.initialize(config)
    
    // 发送状态变化事件
    event.sender.send(AI_AGENT_CHANNELS.STATE_CHANGED, aiAgentService.getState())
    
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '初始化失败'
    console.error('AI Agent初始化失败:', error)
    console.log('AI Agent initialization failed:', error) // 添加console.log确保能看到
    
    // 发送错误事件
    event.sender.send(AI_AGENT_CHANNELS.ERROR_OCCURRED, errorMessage)
    
    return { success: false, error: errorMessage }
  }
}

/**
 * 获取当前状态
 */
async function handleGetState(_event: IpcMainInvokeEvent): Promise<RuntimeAgentState | null> {
  try {
    return aiAgentService?.getState() || null
  } catch (error) {
    console.error('获取状态失败:', error)
    return null
  }
}

/**
 * 更新配置
 */
async function handleUpdateConfig(
  event: IpcMainInvokeEvent,
  newConfig: Partial<AgentConfig>
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!aiAgentService) {
      throw new Error('AI Agent服务未初始化')
    }
    
    await aiAgentService.updateConfig(newConfig)
    
    // 发送状态变化事件
    event.sender.send(AI_AGENT_CHANNELS.STATE_CHANGED, aiAgentService.getState())
    
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '更新配置失败'
    console.error('更新配置失败:', error)
    
    event.sender.send(AI_AGENT_CHANNELS.ERROR_OCCURRED, errorMessage)
    
    return { success: false, error: errorMessage }
  }
}

/**
 * 销毁服务
 */
async function handleDestroy(_event: IpcMainInvokeEvent): Promise<{ success: boolean }> {
  try {
    if (aiAgentService) {
      aiAgentService.destroy()
      aiAgentService = null
    }
    
    return { success: true }
  } catch (error) {
    console.error('销毁服务失败:', error)
    return { success: false }
  }
}

// ==================== 对话管理处理器 ====================

/**
 * 发送消息
 */
async function handleSendMessage(
  event: IpcMainInvokeEvent,
  message: string,
  sessionId?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    if (!aiAgentService) {
      throw new Error('AI Agent服务未初始化')
    }
    
    const result = await aiAgentService.sendMessage(message, sessionId)
    
    // 发送消息接收事件
    event.sender.send(AI_AGENT_CHANNELS.MESSAGE_RECEIVED, {
      sessionId: result.sessionId,
      messageId: result.messageId,
      response: result.response
    })
    
    return { success: true, data: result }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '发送消息失败'
    console.error('发送消息失败:', error)
    
    event.sender.send(AI_AGENT_CHANNELS.ERROR_OCCURRED, errorMessage)
    
    return { success: false, error: errorMessage }
  }
}

/**
 * 创建会话
 */
async function handleCreateSession(
  _event: IpcMainInvokeEvent,
  title?: string
): Promise<ChatSession | null> {
  try {
    if (!aiAgentService) {
      throw new Error('AI Agent服务未初始化')
    }
    
    return aiAgentService.createSession(title)
  } catch (error) {
    console.error('创建会话失败:', error)
    return null
  }
}

/**
 * 获取所有会话
 */
async function handleGetAllSessions(_event: IpcMainInvokeEvent): Promise<ChatSession[]> {
  try {
    return aiAgentService?.getAllSessions() || []
  } catch (error) {
    console.error('获取会话列表失败:', error)
    return []
  }
}

/**
 * 获取会话消息
 */
async function handleGetSessionMessages(
  _event: IpcMainInvokeEvent,
  sessionId: string
): Promise<ChatMessage[]> {
  try {
    return aiAgentService?.getSessionMessages(sessionId) || []
  } catch (error) {
    console.error('获取会话消息失败:', error)
    return []
  }
}

/**
 * 删除会话
 */
async function handleDeleteSession(
  _event: IpcMainInvokeEvent,
  sessionId: string
): Promise<boolean> {
  try {
    return aiAgentService?.deleteSession(sessionId) || false
  } catch (error) {
    console.error('删除会话失败:', error)
    return false
  }
}

/**
 * 更新会话标题
 */
async function handleUpdateSessionTitle(
  _event: IpcMainInvokeEvent,
  sessionId: string,
  title: string
): Promise<boolean> {
  try {
    return aiAgentService?.updateSessionTitle(sessionId, title) || false
  } catch (error) {
    console.error('更新会话标题失败:', error)
    return false
  }
}

/**
 * 清空所有会话
 */
async function handleClearAllSessions(_event: IpcMainInvokeEvent): Promise<boolean> {
  try {
    aiAgentService?.clearAllSessions()
    return true
  } catch (error) {
    console.error('清空会话失败:', error)
    return false
  }
}

// ==================== 模型管理处理器 ====================

/**
 * 验证模型配置
 */
async function handleValidateModelConfig(
  _event: IpcMainInvokeEvent,
  config: ModelConfig
): Promise<boolean> {
  try {
    return await aiAgentService?.validateModelConfig(config) || false
  } catch (error) {
    console.error('验证模型配置失败:', error)
    return false
  }
}

/**
 * 获取模型配置
 */
async function handleGetModelConfig(
  _event: IpcMainInvokeEvent,
  id: string
): Promise<ModelConfig | null> {
  try {
    return await aiAgentService?.getModelConfig(id) || null
  } catch (error) {
    console.error('获取模型配置失败:', error)
    return null
  }
}

/**
 * 获取模型信息
 */
async function handleGetModelInfo(_event: IpcMainInvokeEvent) {
  try {
    return aiAgentService?.getModelInfo() || null
  } catch (error) {
    console.error('获取模型信息失败:', error)
    return null
  }
}

/**
 * 获取支持的模型列表
 */
async function handleGetSupportedModels(_event: IpcMainInvokeEvent) {
  try {
    return aiAgentService?.getSupportedModels() || {}
  } catch (error) {
    console.error('获取支持的模型列表失败:', error)
    return {}
  }
}

/**
 * 估算令牌数量
 */
async function handleEstimateTokens(
  _event: IpcMainInvokeEvent,
  text: string
): Promise<number> {
  try {
    return aiAgentService?.estimateTokens(text) || 0
  } catch (error) {
    console.error('估算令牌数量失败:', error)
    return 0
  }
}

// ==================== 工具管理处理器 ====================

/**
 * 注册MCP服务器
 */
async function handleRegisterMCPServer(
  _event: IpcMainInvokeEvent,
  config: MCPServerConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!aiAgentService) {
      throw new Error('AI Agent服务未初始化')
    }
    
    await aiAgentService.registerMCPServer(config)
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '注册MCP服务器失败'
    console.error('注册MCP服务器失败:', error)
    return { success: false, error: errorMessage }
  }
}

/**
 * 获取可用工具列表
 */
async function handleGetAvailableTools(_event: IpcMainInvokeEvent): Promise<MCPTool[]> {
  try {
    return aiAgentService?.getAvailableTools() || []
  } catch (error) {
    console.error('获取可用工具列表失败:', error)
    return []
  }
}

// ==================== 数据管理处理器 ====================

/**
 * 搜索消息
 */
async function handleSearchMessages(
  _event: IpcMainInvokeEvent,
  query: string,
  sessionId?: string
): Promise<ChatMessage[]> {
  try {
    return aiAgentService?.searchMessages(query, sessionId) || []
  } catch (error) {
    console.error('搜索消息失败:', error)
    return []
  }
}

/**
 * 获取会话统计
 */
async function handleGetSessionStats(
  _event: IpcMainInvokeEvent,
  sessionId?: string
) {
  try {
    return aiAgentService?.getSessionStats(sessionId) || null
  } catch (error) {
    console.error('获取会话统计失败:', error)
    return null
  }
}

/**
 * 获取全局统计
 */
async function handleGetGlobalStats(_event: IpcMainInvokeEvent) {
  try {
    return aiAgentService?.getGlobalStats() || null
  } catch (error) {
    console.error('获取全局统计失败:', error)
    return null
  }
}

/**
 * 导出会话
 */
async function handleExportSession(
  _event: IpcMainInvokeEvent,
  sessionId: string
): Promise<ChatSession | null> {
  try {
    return aiAgentService?.exportSession(sessionId) || null
  } catch (error) {
    console.error('导出会话失败:', error)
    return null
  }
}

/**
 * 导入会话
 */
async function handleImportSession(
  _event: IpcMainInvokeEvent,
  sessionData: ChatSession
): Promise<boolean> {
  try {
    return aiAgentService?.importSession(sessionData) || false
  } catch (error) {
    console.error('导入会话失败:', error)
    return false
  }
}

/**
 * 获取所有模型配置
 */
async function handleGetAllModelConfigs(
  _event: IpcMainInvokeEvent
): Promise<ModelConfig[]> {
  if (!aiAgentService) {
    return []
  }
  return await aiAgentService.getAllModelConfigs()
}

/**
 * 创建模型配置
 */
async function handleCreateModelConfig(
  _event: IpcMainInvokeEvent,
  configData: Partial<ModelConfig>
): Promise<ModelConfig | null> {
  if (!aiAgentService) {
    return null
  }
  try {
    return await aiAgentService.createModelConfig(configData)
  } catch (error) {
    console.error('创建模型配置失败:', error)
    return null
  }
}

/**
 * 更新模型配置
 */
async function handleUpdateModelConfig(
  _event: IpcMainInvokeEvent,
  id: string,
  configData: Partial<ModelConfig>
): Promise<ModelConfig | null> {
  if (!aiAgentService) {
    return null
  }
  try {
    return await aiAgentService.updateModelConfig(id, configData)
  } catch (error) {
    console.error('更新模型配置失败:', error)
    return null
  }
}

/**
 * 删除模型配置
 */
async function handleDeleteModelConfig(
  _event: IpcMainInvokeEvent,
  id: string
): Promise<boolean> {
  if (!aiAgentService) {
    return false
  }
  try {
    return await aiAgentService.deleteModelConfig(id)
  } catch (error) {
    console.error('删除模型配置失败:', error)
    return false
  }
}

/**
 * 设置默认模型配置
 */
async function handleSetDefaultModelConfig(
  _event: IpcMainInvokeEvent,
  id: string
): Promise<boolean> {
  if (!aiAgentService) {
    return false
  }
  try {
    return await aiAgentService.setDefaultModelConfig(id)
  } catch (error) {
    console.error('设置默认模型配置失败:', error)
    return false
  }
}