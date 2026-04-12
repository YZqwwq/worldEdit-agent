import type { ModelVendor } from './modelVender'

export interface ModelConfigPayload {
  id: number
  modelKey: string
  vendor: ModelVendor
  model: string
  modelName: string
  baseURL: string
  temperature: number
  quickModelKey: string
  quickVendor: ModelVendor
  quickModel: string
  quickModelName: string
  quickBaseURL: string
  quickTemperature: number
  streaming: boolean
  useResponsesApi: boolean
  mainAgentTimeoutMs: number
  childAgentTimeoutMs: number
  updatedAt?: string
}

export type ModelConfigInput = Omit<ModelConfigPayload, 'id' | 'updatedAt'>

export type ModelSpeedTestTarget = 'main' | 'quick'

export interface ModelSpeedTestResult {
  target: ModelSpeedTestTarget
  ok: boolean
  elapsedMs: number
  model: string
  profile: string
  previewText?: string
  error?: string
}
