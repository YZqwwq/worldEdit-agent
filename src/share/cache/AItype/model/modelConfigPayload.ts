import type { ModelVendor } from './modelVender'

export interface ModelConfigPayload {
  id: number
  modelKey: string
  vendor: ModelVendor
  model: string
  modelName: string
  baseURL: string
  temperature: number
  streaming: boolean
  useResponsesApi: boolean
  updatedAt?: string
}

export type ModelConfigInput = Omit<ModelConfigPayload, 'id' | 'updatedAt'>
