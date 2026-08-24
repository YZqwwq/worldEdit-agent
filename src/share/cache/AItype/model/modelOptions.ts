import { ModelVendor } from './modelVender'
import type { ReasoningProtocolPreference } from '../states/reasoningChannel'

export interface ModelOptions {
  vendor: ModelVendor
  model: string
  temperature?: number
  apiKey?: string
  baseURL?: string
  streaming?: boolean
  useResponsesApi?: boolean
  mainAgentTimeoutMs?: number
  mainAgentMaxTokens?: number
  reasoningProtocol?: ReasoningProtocolPreference
  modelKwargs?: Record<string, unknown>
  systemPrompt?: string
}
