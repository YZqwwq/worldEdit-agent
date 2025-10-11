/**
 * AI Agent 工具函数
 * 提供AI Agent相关的工具函数和辅助方法
 */

import type {
  ChatSession,
  ModelConfig,
  TokenUsage,
  ConnectionStatus,
  UsageStats,
  WritingTemplate,
  OptimizationSuggestion,
  ExportOptions,
  SearchResult,
  BatchOperation
} from '../../../shared/cache-types/agent/agent'
import { MessageType } from '../../../shared/entities'

/**
 * 格式化时间戳
 */
export function formatTimestamp(timestamp: number, format: 'relative' | 'absolute' | 'time' = 'relative'): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - timestamp

  if (format === 'absolute') {
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  if (format === 'time') {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // 相对时间
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) {
    return '刚刚'
  } else if (minutes < 60) {
    return `${minutes}分钟前`
  } else if (hours < 24) {
    return `${hours}小时前`
  } else if (days < 7) {
    return `${days}天前`
  } else {
    return date.toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit'
    })
  }
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * 格式化Token使用量
 */
export function formatTokenUsage(usage: TokenUsage): string {
  const total = usage.promptTokens + usage.completionTokens
  return `${total.toLocaleString()} tokens (输入: ${usage.promptTokens.toLocaleString()}, 输出: ${usage.completionTokens.toLocaleString()})`
}

/**
 * 计算Token成本（估算）
 */
export function calculateTokenCost(usage: TokenUsage, modelName: string): number {
  // 简化的成本计算，实际应该根据具体模型定价
  const costPerToken = {
    'gpt-4': 0.00003,
    'gpt-3.5-turbo': 0.000002,
    'claude-3': 0.000015,
    'default': 0.00001
  }
  
  const rate = costPerToken[modelName as keyof typeof costPerToken] || costPerToken.default
  return (usage.promptTokens + usage.completionTokens) * rate
}

/**
 * 生成唯一ID
 */
export function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substr(2, 9)
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`
}

/**
 * 深拷贝对象
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item)) as unknown as T
  }
  
  if (typeof obj === 'object') {
    const cloned = {} as T
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key])
      }
    }
    return cloned
  }
  
  return obj
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout)
    }
    
    timeout = setTimeout(() => {
      func.apply(null, args)
    }, wait)
  }
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let lastTime = 0
  
  return (...args: Parameters<T>) => {
    const now = Date.now()
    
    if (now - lastTime >= wait) {
      lastTime = now
      func.apply(null, args)
    }
  }
}

/**
 * 验证邮箱格式
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * 验证URL格式
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * 截断文本
 */
export function truncateText(text: string, maxLength: number, suffix: string = '...'): string {
  if (text.length <= maxLength) {
    return text
  }
  
  return text.substring(0, maxLength - suffix.length) + suffix
}

/**
 * 高亮搜索关键词
 */
export function highlightText(text: string, keyword: string): string {
  if (!keyword.trim()) {
    return text
  }
  
  const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return text.replace(regex, '<mark>$1</mark>')
}

/**
 * 提取消息中的代码块
 */
export function extractCodeBlocks(text: string): Array<{ language: string; code: string }> {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
  const blocks: Array<{ language: string; code: string }> = []
  let match
  
  while ((match = codeBlockRegex.exec(text)) !== null) {
    blocks.push({
      language: match[1] || 'text',
      code: match[2].trim()
    })
  }
  
  return blocks
}

/**
 * 计算文本相似度（简单实现）
 */
export function calculateSimilarity(text1: string, text2: string): number {
  const words1 = text1.toLowerCase().split(/\s+/)
  const words2 = text2.toLowerCase().split(/\s+/)
  
  const set1 = new Set(words1)
  const set2 = new Set(words2)
  
  const intersection = new Set([...set1].filter(x => set2.has(x)))
  const union = new Set([...set1, ...set2])
  
  return intersection.size / union.size
}

/**
 * 导出聊天记录
 */
export function exportChatHistory(
  sessions: ChatSession[],
  options: ExportOptions
): string {
  const { format, includeMetadata, dateRange } = options
  
  let filteredSessions = sessions
  
  // 日期过滤
  if (dateRange?.start || dateRange?.end) {
    filteredSessions = sessions.filter(session => {
      const sessionDate = session.createdAt
      if (dateRange.start && sessionDate < dateRange.start) return false
      if (dateRange.end && sessionDate > dateRange.end) return false
      return true
    })
  }
  
  if (format === 'json') {
    return JSON.stringify(filteredSessions, null, 2)
  }
  
  if (format === 'csv') {
    const headers = ['会话ID', '标题', '创建时间', '消息数量', '总Token']
    const rows = filteredSessions.map(session => [
      session.id,
      session.title,
      formatTimestamp(session.createdAt, 'absolute'),
      session.messages.length.toString(),
      session.tokenUsage ? (session.tokenUsage.promptTokens + session.tokenUsage.completionTokens).toString() : '0'
    ])
    
    return [headers, ...rows].map(row => row.join(',')).join('\n')
  }
  
  // Markdown格式
  let markdown = '# AI对话记录\n\n'
  
  filteredSessions.forEach(session => {
    markdown += `## ${session.title}\n\n`
    
    if (includeMetadata) {
      markdown += `- **会话ID**: ${session.id}\n`
      markdown += `- **创建时间**: ${formatTimestamp(session.createdAt, 'absolute')}\n`
      markdown += `- **消息数量**: ${session.messages.length}\n`
      if (session.tokenUsage) {
        markdown += `- **Token使用**: ${formatTokenUsage(session.tokenUsage)}\n`
      }
      markdown += '\n'
    }
    
    session.messages.forEach(message => {
      const role = message.type === MessageType.USER ? '用户' : message.type === MessageType.ASSISTANT ? '助手' : '系统'
      markdown += `### ${role}\n\n${message.content}\n\n`
    })
    
    markdown += '---\n\n'
  })
  
  return markdown
}

/**
 * 搜索聊天记录
 */
export function searchChatHistory(
  sessions: ChatSession[],
  query: string,
  options: {
    searchInContent?: boolean
    searchInTitle?: boolean
    caseSensitive?: boolean
    limit?: number
  } = {}
): SearchResult<ChatSession> {
  const {
    searchInContent = true,
    searchInTitle = true,
    caseSensitive = false,
    limit = 50
  } = options
  
  if (!query.trim()) {
    return {
      items: sessions.slice(0, limit),
      total: sessions.length,
      query,
      filters: {}
    }
  }
  
  const searchQuery = caseSensitive ? query : query.toLowerCase()
  
  const results = sessions.filter(session => {
    // 搜索标题
    if (searchInTitle) {
      const title = caseSensitive ? session.title : session.title.toLowerCase()
      if (title.includes(searchQuery)) {
        return true
      }
    }
    
    // 搜索消息内容
    if (searchInContent) {
      return session.messages.some(message => {
        const content = caseSensitive ? message.content : message.content.toLowerCase()
        return content.includes(searchQuery)
      })
    }
    
    return false
  })
  
  return {
    items: results.slice(0, limit),
    total: results.length,
    query,
    filters: {}
  }
}

/**
 * 批量操作聊天记录
 */
export function batchOperateSessions(
  sessions: ChatSession[],
  operation: BatchOperation
): {
  success: boolean
  processedCount: number
  errors: string[]
} {
  const errors: string[] = []
  let processedCount = 0
  
  try {
    switch (operation.type) {
      case 'delete':
        // 删除操作的具体实现需要调用API
        processedCount = operation.items.length
        break
        
      case 'export':
        // 导出操作
        const sessionsToExport = sessions.filter(s => operation.items.includes(s.id))
        const exportData = exportChatHistory(sessionsToExport, { format: 'json' })
        
        // 触发下载
        const blob = new Blob([exportData], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `chat-history-${Date.now()}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        
        processedCount = sessionsToExport.length
        break
        
      case 'move':
        // 移动操作的具体实现需要调用API
        processedCount = operation.items.length
        break
        
      default:
        errors.push(`不支持的操作类型: ${operation.type}`)
    }
  } catch (error) {
    errors.push(`批量操作失败: ${error instanceof Error ? error.message : String(error)}`)
  }
  
  return {
    success: errors.length === 0,
    processedCount,
    errors
  }
}

/**
 * 获取连接状态显示文本
 */
export function getConnectionStatusText(status: ConnectionStatus): string {
  if (status.connected) {
    return '已连接'
  } else if (status.error) {
    return '连接错误'
  } else {
    return '未连接'
  }
}

/**
 * 获取连接状态颜色类
 */
export function getConnectionStatusClass(status: ConnectionStatus): string {
  if (status.connected) {
    return 'text-success'
  } else if (status.error) {
    return 'text-error'
  } else {
    return 'text-tertiary'
  }
}

/**
 * 验证模型配置
 */
export function validateModelConfig(config: Partial<ModelConfig>): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []
  
  if (!config.provider) {
    errors.push('请选择模型提供商')
  }
  
  if (!config.modelName) {
    errors.push('请选择模型')
  }
  
  if (!config.apiKey?.trim()) {
    errors.push('请输入API密钥')
  }
  
  if (config.baseURL && !isValidUrl(config.baseURL)) {
    errors.push('请输入有效的基础URL')
  }
  
  if (config.temperature !== undefined) {
    if (config.temperature < 0 || config.temperature > 2) {
      errors.push('温度值应在0-2之间')
    }
  }
  
  if (config.maxTokens !== undefined) {
    if (config.maxTokens < 1 || config.maxTokens > 32000) {
      errors.push('最大Token数应在1-32000之间')
    }
  }
  
  if (config.topP !== undefined) {
    if (config.topP < 0 || config.topP > 1) {
      errors.push('Top P值应在0-1之间')
    }
  }
  
  if (config.frequencyPenalty !== undefined) {
    if (config.frequencyPenalty < -2 || config.frequencyPenalty > 2) {
      errors.push('频率惩罚值应在-2到2之间')
    }
  }
  
  if (config.presencePenalty !== undefined) {
    if (config.presencePenalty < -2 || config.presencePenalty > 2) {
      errors.push('存在惩罚值应在-2到2之间')
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * 生成写作模板
 */
export function generateWritingTemplates(): WritingTemplate[] {
  return [
    {
      id: 'blog-post',
      name: '博客文章',
      description: '创建引人入胜的博客文章',
      category: 'content',
      prompt: `# {title}

## 引言
{introduction}

## 主要内容
{main_content}

## 结论
{conclusion}

---
标签: {tags}
发布日期: {date}`,
      variables: [
        { name: 'title', label: '标题', description: '文章的标题', type: 'text', required: true },
        { name: 'introduction', label: '引言', description: '文章的引言部分', type: 'textarea', required: true },
        { name: 'main_content', label: '主要内容', description: '文章的主体内容', type: 'textarea', required: true },
        { name: 'conclusion', label: '结论', description: '文章的结论部分', type: 'textarea', required: true },
        { name: 'tags', label: '标签', description: '文章的标签', type: 'text', required: false },
        { name: 'date', label: '日期', description: '发布日期', type: 'date', required: false }
      ]
    },
    {
      id: 'email-template',
      name: '邮件模板',
      description: '专业的邮件模板',
      category: 'communication',
      prompt: `主题: {subject}

尊敬的 {recipient_name}，

{greeting}

{body}

{closing}

此致
敬礼

{sender_name}
{sender_title}
{contact_info}`,
      variables: [
        { name: 'subject', label: '邮件主题', description: '邮件的主题', type: 'text', required: true },
        { name: 'recipient_name', label: '收件人姓名', description: '收件人的姓名', type: 'text', required: true },
        { name: 'greeting', label: '问候语', description: '邮件开头的问候语', type: 'text', required: false },
        { name: 'body', label: '邮件正文', description: '邮件的主要内容', type: 'textarea', required: true },
        { name: 'closing', label: '结束语', description: '邮件结尾的客套话', type: 'text', required: false },
        { name: 'sender_name', label: '发件人姓名', description: '发件人的姓名', type: 'text', required: true },
        { name: 'sender_title', label: '发件人职位', description: '发件人的职位', type: 'text', required: false },
        { name: 'contact_info', label: '联系方式', description: '发件人的联系方式', type: 'text', required: false }
      ]
    },
    {
      id: 'meeting-notes',
      name: '会议纪要',
      description: '结构化的会议记录模板',
      category: 'business',
      prompt: `# 会议纪要

**会议主题**: {meeting_title}
**日期时间**: {date_time}
**参会人员**: {attendees}
**会议主持**: {host}

## 会议议程
{agenda}

## 讨论要点
{discussion_points}

## 决议事项
{decisions}

## 行动计划
{action_items}

## 下次会议
{next_meeting}`,
      variables: [
        { name: 'meeting_title', label: '会议主题', description: '会议的主要主题', type: 'text', required: true },
        { name: 'date_time', label: '日期时间', description: '会议的日期和时间', type: 'text', required: true },
        { name: 'attendees', label: '参会人员', description: '参加会议的人员列表', type: 'textarea', required: true },
        { name: 'host', label: '会议主持', description: '会议主持人', type: 'text', required: true },
        { name: 'agenda', label: '会议议程', description: '会议的议程安排', type: 'textarea', required: true },
        { name: 'discussion_points', label: '讨论要点', description: '会议中的主要讨论点', type: 'textarea', required: true },
        { name: 'decisions', label: '决议事项', description: '会议中做出的决定', type: 'textarea', required: true },
        { name: 'action_items', label: '行动计划', description: '后续需要执行的行动项', type: 'textarea', required: true },
        { name: 'next_meeting', label: '下次会议', description: '下次会议的安排', type: 'text', required: false }
      ]
    }
  ]
}

/**
 * 应用写作模板
 */
export function applyWritingTemplate(
  template: WritingTemplate,
  variables: Record<string, string>
): string {
  let result = template.prompt
  
  template.variables?.forEach(variable => {
    const value = variables[variable.name] || ''
    const placeholder = `{${variable.name}}`
    result = result.replace(new RegExp(placeholder, 'g'), value)
  })
  
  return result
}

/**
 * 生成优化建议
 */
export function generateOptimizationSuggestions(
  text: string,
  type: 'grammar' | 'style' | 'clarity' | 'engagement'
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = []
  
  // 这里是简化的实现，实际应该使用更复杂的文本分析
  switch (type) {
    case 'grammar':
      // 检查常见语法问题
      if (text.includes('的的')) {
        suggestions.push({
          id: generateId('grammar'),
          type: 'grammar',
          severity: 'medium',
          message: '发现重复的"的"字，建议删除其中一个',
          suggestion: '删除重复的"的"字',
          position: { start: text.indexOf('的的'), end: text.indexOf('的的') + 2 }
        })
      }
      break
      
    case 'style':
      // 检查文体风格
      if (text.length < 50) {
        suggestions.push({
          id: generateId('style'),
          type: 'style',
          severity: 'low',
          message: '文本较短，建议增加更多细节和描述',
          suggestion: '添加更多具体的例子和详细说明'
        })
      }
      break
      
    case 'clarity':
      // 检查清晰度
      const sentences = text.split(/[。！？]/).filter(s => s.trim())
      const longSentences = sentences.filter(s => s.length > 50)
      if (longSentences.length > 0) {
        suggestions.push({
          id: generateId('clarity'),
          type: 'clarity',
          severity: 'medium',
          message: '发现过长的句子，建议拆分以提高可读性',
          suggestion: '将长句拆分为多个短句'
        })
      }
      break
      
    case 'engagement':
      // 检查吸引力
      if (!text.includes('?') && !text.includes('？')) {
        suggestions.push({
          id: generateId('engagement'),
          type: 'engagement',
          severity: 'low',
          message: '文本缺少互动性，建议添加问题来吸引读者',
          suggestion: '在适当位置添加反问句或引导性问题'
        })
      }
      break
  }
  
  return suggestions
}

/**
 * 计算使用统计
 */
export function calculateUsageStats(sessions: ChatSession[]): UsageStats {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  
  const todaySessions = sessions.filter(s => s.createdAt >= today.getTime())
  const weekSessions = sessions.filter(s => s.createdAt >= thisWeek.getTime())
  const monthSessions = sessions.filter(s => s.createdAt >= thisMonth.getTime())
  
  const totalMessages = sessions.reduce((sum, s) => sum + s.messages.length, 0)
  const totalTokens = sessions.reduce((sum, s) => {
    if (s.tokenUsage) {
      return sum + s.tokenUsage.promptTokens + s.tokenUsage.completionTokens
    }
    return sum
  }, 0)
  
  const todayMessages = todaySessions.reduce((sum, s) => sum + s.messages.length, 0)
  const todayTokens = todaySessions.reduce((sum, s) => {
    if (s.tokenUsage) {
      return sum + s.tokenUsage.promptTokens + s.tokenUsage.completionTokens
    }
    return sum
  }, 0)
  
  return {
    messages: todayMessages,
    totalMessages,
    tokens: todayTokens,
    totalTokens,
    sessions: todaySessions.length,
    totalSessions: sessions.length,
    todaySessions: todaySessions.length,
    weekSessions: weekSessions.length,
    monthSessions: monthSessions.length,
    averageMessagesPerSession: sessions.length > 0 ? Math.round(totalMessages / sessions.length) : 0,
    averageTokensPerSession: sessions.length > 0 ? Math.round(totalTokens / sessions.length) : 0
  }
}

/**
 * 本地存储工具
 */
export const storage = {
  get<T>(key: string, defaultValue?: T): T | undefined {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch {
      return defaultValue
    }
  },
  
  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      console.error('Failed to save to localStorage:', error)
    }
  },
  
  remove(key: string): void {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      console.error('Failed to remove from localStorage:', error)
    }
  },
  
  clear(): void {
    try {
      localStorage.clear()
    } catch (error) {
      console.error('Failed to clear localStorage:', error)
    }
  }
}

/**
 * 事件总线
 */
class EventBus {
  public events: Map<string, Function[]> = new Map()
  
  on(event: string, callback: Function): void {
    if (!this.events.has(event)) {
      this.events.set(event, [])
    }
    this.events.get(event)!.push(callback)
  }
  
  off(event: string, callback?: Function): void {
    if (!this.events.has(event)) return
    
    if (callback) {
      const callbacks = this.events.get(event)!
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
    } else {
      this.events.delete(event)
    }
  }
  
  emit(event: string, ...args: any[]): void {
    if (!this.events.has(event)) return
    
    this.events.get(event)!.forEach(callback => {
      try {
        callback(...args)
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error)
      }
    })
  }
  
  once(event: string, callback: Function): void {
    const onceCallback = (...args: any[]) => {
      callback(...args)
      this.off(event, onceCallback)
    }
    this.on(event, onceCallback)
  }
  
  removeAllListeners(): void {
    this.events.clear()
  }
}

export const eventBus = new EventBus()

/**
 * 错误处理工具
 */
export function handleError(error: unknown, context?: string): string {
  let message = '发生未知错误'
  
  if (error instanceof Error) {
    message = error.message
  } else if (typeof error === 'string') {
    message = error
  } else if (error && typeof error === 'object' && 'message' in error) {
    message = String(error.message)
  }
  
  if (context) {
    console.error(`[${context}] ${message}`, error)
  } else {
    console.error(message, error)
  }
  
  return message
}

/**
 * 重试机制
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number
    delay?: number
    backoff?: boolean
  } = {}
): Promise<T> {
  const { maxAttempts = 3, delay = 1000, backoff = true } = options
  
  let lastError: unknown
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      
      if (attempt === maxAttempts) {
        throw error
      }
      
      const waitTime = backoff ? delay * Math.pow(2, attempt - 1) : delay
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }
  
  throw lastError
}