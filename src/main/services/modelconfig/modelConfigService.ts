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
  quickModelKey: process.env.MODEL_API_KEY ?? '',
  quickVendor: 'openai',
  quickModel: 'qwen3.5-flash',
  quickModelName: '快速模型',
  quickBaseURL: process.env.MODEL_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  quickTemperature: 0.3,
  streaming: true,
  useResponsesApi: false,
  mainAgentTimeoutMs: 60000,
  childAgentTimeoutMs: 30000
}

const clampTemperature = (value: number): number => Math.min(2, Math.max(0, value))
const clampChildAgentTimeoutMs = (value: number): number => Math.min(300000, Math.max(5000, value))
const clampMainAgentTimeoutMs = (value: number): number => Math.min(300000, Math.max(10000, value))

const normalizeInput = (input: ModelConfigInput): ModelConfigInput => {
  const vendor = String(input.vendor || '').trim().toLowerCase() as ModelVendor
  if (!SUPPORTED_VENDORS.includes(vendor)) {
    throw new Error(`Unsupported vendor: ${vendor}`)
  }
  const quickVendor = String(input.quickVendor || '').trim().toLowerCase() as ModelVendor
  if (!SUPPORTED_VENDORS.includes(quickVendor)) {
    throw new Error(`Unsupported quick vendor: ${quickVendor}`)
  }

  const model = String(input.model || '').trim()
  if (!model) {
    throw new Error('Model is required')
  }
  const quickModel = String(input.quickModel || '').trim()
  if (!quickModel) {
    throw new Error('Quick model is required')
  }

  const modelName = String(input.modelName || '').trim() || '默认模型'
  const quickModelName = String(input.quickModelName || '').trim() || '快速模型'

  const temperatureRaw = Number(input.temperature)
  const temperature = Number.isFinite(temperatureRaw) ? clampTemperature(temperatureRaw) : 0.9
  const quickTemperatureRaw = Number(input.quickTemperature)
  const quickTemperature = Number.isFinite(quickTemperatureRaw)
    ? clampTemperature(quickTemperatureRaw)
    : DEFAULT_CONFIG.quickTemperature
  const mainTimeoutRaw = Number(input.mainAgentTimeoutMs)
  const mainAgentTimeoutMs = Number.isFinite(mainTimeoutRaw)
    ? clampMainAgentTimeoutMs(Math.round(mainTimeoutRaw))
    : DEFAULT_CONFIG.mainAgentTimeoutMs
  const timeoutRaw = Number(input.childAgentTimeoutMs)
  const childAgentTimeoutMs = Number.isFinite(timeoutRaw)
    ? clampChildAgentTimeoutMs(Math.round(timeoutRaw))
    : DEFAULT_CONFIG.childAgentTimeoutMs

  return {
    modelKey: String(input.modelKey || '').trim(),
    vendor,
    model,
    modelName,
    baseURL: String(input.baseURL || '').trim(),
    temperature,
    quickModelKey: String(input.quickModelKey || '').trim(),
    quickVendor,
    quickModel,
    quickModelName,
    quickBaseURL: String(input.quickBaseURL || '').trim(),
    quickTemperature,
    streaming: Boolean(input.streaming),
    useResponsesApi: Boolean(input.useResponsesApi),
    mainAgentTimeoutMs,
    childAgentTimeoutMs
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
  quickModelKey: entity.quickmodelkey || '',
  quickVendor: (entity.quickmodeltype as ModelVendor) || 'openai',
  quickModel: entity.quickmodel || DEFAULT_CONFIG.quickModel,
  quickModelName: entity.quickmodelname || DEFAULT_CONFIG.quickModelName,
  quickBaseURL: entity.quickbaseurl || '',
  quickTemperature: Number.isFinite(entity.quicktemperature)
    ? entity.quicktemperature
    : DEFAULT_CONFIG.quickTemperature,
  streaming: entity.streaming !== false,
  useResponsesApi: entity.useresponsesapi === true,
  mainAgentTimeoutMs:
    Number.isFinite(entity.mainagenttimeoutms) && entity.mainagenttimeoutms > 0
      ? entity.mainagenttimeoutms
      : DEFAULT_CONFIG.mainAgentTimeoutMs,
  childAgentTimeoutMs:
    Number.isFinite(entity.childagenttimeoutms) && entity.childagenttimeoutms > 0
      ? entity.childagenttimeoutms
      : DEFAULT_CONFIG.childAgentTimeoutMs,
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
        quickmodelkey: DEFAULT_CONFIG.quickModelKey,
        quickmodeltype: DEFAULT_CONFIG.quickVendor,
        quickmodel: DEFAULT_CONFIG.quickModel,
        quickmodelname: DEFAULT_CONFIG.quickModelName,
        quickbaseurl: DEFAULT_CONFIG.quickBaseURL,
        quicktemperature: DEFAULT_CONFIG.quickTemperature,
        streaming: DEFAULT_CONFIG.streaming,
        useresponsesapi: DEFAULT_CONFIG.useResponsesApi,
        mainagenttimeoutms: DEFAULT_CONFIG.mainAgentTimeoutMs,
        childagenttimeoutms: DEFAULT_CONFIG.childAgentTimeoutMs
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
    if (!config.quickmodeltype) {
      config.quickmodeltype = DEFAULT_CONFIG.quickVendor
      changed = true
    }
    if (!config.quickmodel) {
      config.quickmodel = DEFAULT_CONFIG.quickModel
      changed = true
    }
    if (!config.quickmodelname) {
      config.quickmodelname = DEFAULT_CONFIG.quickModelName
      changed = true
    }
    if (config.baseurl == null) {
      config.baseurl = DEFAULT_CONFIG.baseURL
      changed = true
    }
    if (config.quickbaseurl == null) {
      config.quickbaseurl = DEFAULT_CONFIG.quickBaseURL
      changed = true
    }
    if (!Number.isFinite(config.temperature)) {
      config.temperature = DEFAULT_CONFIG.temperature
      changed = true
    }
    if (!Number.isFinite(config.quicktemperature)) {
      config.quicktemperature = DEFAULT_CONFIG.quickTemperature
      changed = true
    }
    if (!Number.isFinite(config.childagenttimeoutms) || config.childagenttimeoutms <= 0) {
      config.childagenttimeoutms = DEFAULT_CONFIG.childAgentTimeoutMs
      changed = true
    }
    if (!Number.isFinite(config.mainagenttimeoutms) || config.mainagenttimeoutms <= 0) {
      config.mainagenttimeoutms = DEFAULT_CONFIG.mainAgentTimeoutMs
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
    config.quickmodelkey = normalized.quickModelKey
    config.quickmodeltype = normalized.quickVendor
    config.quickmodel = normalized.quickModel
    config.quickmodelname = normalized.quickModelName
    config.quickbaseurl = normalized.quickBaseURL
    config.quicktemperature = normalized.quickTemperature
    config.streaming = normalized.streaming
    config.useresponsesapi = normalized.useResponsesApi
    config.mainagenttimeoutms = normalized.mainAgentTimeoutMs
    config.childagenttimeoutms = normalized.childAgentTimeoutMs

    const saved = await this.repo.save(config)
    return toPayload(saved)
  }

  async getChildAgentTimeoutMs(): Promise<number> {
    const config = await this.getModelConfig()
    return config.childAgentTimeoutMs
  }

  buildModelOptionsFromInput(input: ModelConfigInput): ModelOptions {
    const config = normalizeInput(input)
    return {
      vendor: config.vendor,
      model: config.model,
      temperature: config.temperature,
      apiKey: config.modelKey,
      baseURL: config.baseURL || undefined,
      streaming: config.streaming,
      useResponsesApi: config.useResponsesApi,
      mainAgentTimeoutMs: config.mainAgentTimeoutMs
    }
  }

  buildQuickModelOptionsFromInput(input: ModelConfigInput): ModelOptions {
    const config = normalizeInput(input)
    return {
      vendor: config.quickVendor,
      model: config.quickModel,
      temperature: config.quickTemperature,
      apiKey: config.quickModelKey || config.modelKey,
      baseURL: config.quickBaseURL || config.baseURL || undefined,
      streaming: false,
      useResponsesApi: false,
      mainAgentTimeoutMs: config.mainAgentTimeoutMs
    }
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
      useResponsesApi: config.useResponsesApi,
      mainAgentTimeoutMs: config.mainAgentTimeoutMs
    }
  }

  async getQuickModelOptions(): Promise<ModelOptions> {
    const config = await this.getModelConfig()
    return {
      vendor: config.quickVendor,
      model: config.quickModel,
      temperature: config.quickTemperature,
      apiKey: config.quickModelKey || config.modelKey,
      baseURL: config.quickBaseURL || config.baseURL || undefined,
      streaming: false,
      useResponsesApi: false,
      mainAgentTimeoutMs: config.mainAgentTimeoutMs
    }
  }
}

export const modelConfigService = new ModelConfigService()
