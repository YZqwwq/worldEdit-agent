import type { ModelOptions } from '@share/cache/AItype/model/modelOptions'
import type {
  ModelConfigInput,
  ModelConfigPayload
} from '@share/cache/AItype/model/modelConfigPayload'
import type { ModelVendor } from '@share/cache/AItype/model/modelVender'
import { AppDataSource } from '../../database'
import { ModelConfig } from '../../../share/entity/database/ModelConfig'

const SUPPORTED_VENDORS: ModelVendor[] = ['openai', 'anthropic']

const DEFAULT_CONFIG: ModelConfigInput = {
  modelKey: process.env.MODEL_API_KEY ?? '',
  vendor: 'openai',
  model: process.env.MODEL_NAME ?? 'qwen-plus',
  modelName: '默认模型',
  baseURL: process.env.MODEL_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  temperature: 0.9,
  streaming: true,
  useResponsesApi: false
}

const clampTemperature = (value: number): number => Math.min(2, Math.max(0, value))

const normalizeInput = (input: ModelConfigInput): ModelConfigInput => {
  const vendor = String(input.vendor || '').trim().toLowerCase() as ModelVendor
  if (!SUPPORTED_VENDORS.includes(vendor)) {
    throw new Error(`Unsupported vendor: ${vendor}`)
  }

  const model = String(input.model || '').trim()
  if (!model) {
    throw new Error('Model is required')
  }

  const modelName = String(input.modelName || '').trim() || '默认模型'

  const temperatureRaw = Number(input.temperature)
  const temperature = Number.isFinite(temperatureRaw) ? clampTemperature(temperatureRaw) : 0.9

  return {
    modelKey: String(input.modelKey || '').trim(),
    vendor,
    model,
    modelName,
    baseURL: String(input.baseURL || '').trim(),
    temperature,
    streaming: Boolean(input.streaming),
    useResponsesApi: Boolean(input.useResponsesApi)
  }
}

const toPayload = (entity: ModelConfig): ModelConfigPayload => ({
  id: entity.id,
  modelKey: entity.modelkey || '',
  vendor: (entity.modeltype as ModelVendor) || 'openai',
  model: entity.model || 'qwen-plus',
  modelName: entity.modelname || '默认模型',
  baseURL: entity.baseurl || '',
  temperature: Number.isFinite(entity.temperature) ? entity.temperature : 0.9,
  streaming: entity.streaming !== false,
  useResponsesApi: entity.useresponsesapi === true,
  updatedAt: entity.updatedAt ? entity.updatedAt.toISOString() : undefined
})

class ModelConfigService {
  private get repo() {
    return AppDataSource.getRepository(ModelConfig)
  }

  private async ensureConfigRow(): Promise<ModelConfig> {
    let config = await this.repo.findOneBy({ id: 1 })

    if (!config) {
      const first = await this.repo.find({
        order: { id: 'ASC' },
        take: 1
      })
      config = first[0]
    }

    if (!config) {
      config = this.repo.create({
        modelkey: DEFAULT_CONFIG.modelKey,
        modeltype: DEFAULT_CONFIG.vendor,
        model: DEFAULT_CONFIG.model,
        modelname: DEFAULT_CONFIG.modelName,
        baseurl: DEFAULT_CONFIG.baseURL,
        temperature: DEFAULT_CONFIG.temperature,
        streaming: DEFAULT_CONFIG.streaming,
        useresponsesapi: DEFAULT_CONFIG.useResponsesApi
      })
      config = await this.repo.save(config)
      return config
    }

    let changed = false
    if (!config.modeltype) {
      config.modeltype = DEFAULT_CONFIG.vendor
      changed = true
    }
    if (!config.model) {
      config.model = DEFAULT_CONFIG.model
      changed = true
    }
    if (!config.modelname) {
      config.modelname = DEFAULT_CONFIG.modelName
      changed = true
    }
    if (config.baseurl == null) {
      config.baseurl = DEFAULT_CONFIG.baseURL
      changed = true
    }
    if (!Number.isFinite(config.temperature)) {
      config.temperature = DEFAULT_CONFIG.temperature
      changed = true
    }
    if (changed) {
      config = await this.repo.save(config)
    }

    return config
  }

  async getModelConfig(): Promise<ModelConfigPayload> {
    const config = await this.ensureConfigRow()
    return toPayload(config)
  }

  async saveModelConfig(input: ModelConfigInput): Promise<ModelConfigPayload> {
    const normalized = normalizeInput(input)
    const config = await this.ensureConfigRow()

    config.modelkey = normalized.modelKey
    config.modeltype = normalized.vendor
    config.model = normalized.model
    config.modelname = normalized.modelName
    config.baseurl = normalized.baseURL
    config.temperature = normalized.temperature
    config.streaming = normalized.streaming
    config.useresponsesapi = normalized.useResponsesApi

    const saved = await this.repo.save(config)
    return toPayload(saved)
  }

  async getModelOptions(): Promise<ModelOptions> {
    const config = await this.getModelConfig()
    return {
      vendor: config.vendor,
      model: config.model,
      temperature: config.temperature,
      apiKey: config.modelKey,
      baseURL: config.baseURL || undefined,
      streaming: config.streaming,
      useResponsesApi: config.useResponsesApi
    }
  }
}

export const modelConfigService = new ModelConfigService()
