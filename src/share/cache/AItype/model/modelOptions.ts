import { ModelVendor } from './modelVender'

export interface ModelOptions {
  vendor: ModelVendor
  model: string
  temperature?: number
  apiKey?: string
  baseURL?: string
  streaming?: boolean
  useResponsesApi?: boolean
  mainAgentTimeoutMs?: number
  modelKwargs?: Record<string, unknown>
  systemPrompt?: string
}
