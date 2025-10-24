/**
 * 服务代理配置值对象
 */
export interface ServiceAgentConfigVO {
  id: string
  name: string
  description?: string
  provider: string
  model: string
  apiKey?: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  stream?: boolean
  timeout?: number
  maxRetries?: number
  stop?: string[]
  systemPrompt?: string
  tools?: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}