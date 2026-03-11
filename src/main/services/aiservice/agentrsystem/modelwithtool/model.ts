import { ChatOpenAI } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { ModelAdaptor } from '@share/cache/AItype/model/modelAdaptor'
import { type ModelOptions } from '@share/cache/AItype/model/modelOptions'
import { modelConfigService } from '../../../modelconfig/modelConfigService'

export function createChatModel(options: ModelOptions): ModelAdaptor {
  let model: ModelAdaptor = new ChatOpenAI({})

  if (options.vendor === 'openai') {
    model = new ChatOpenAI({
      model: options.model,
      temperature: options.temperature,
      apiKey: options.apiKey,
      streaming: options.streaming,
      useResponsesApi: options.useResponsesApi,
      configuration: options.baseURL ? { baseURL: options.baseURL } : undefined
    })
  } else if (options.vendor === 'anthropic') {
    model = new ChatAnthropic({
      model: options.model,
      temperature: options.temperature
    })
  } else {
    throw new Error(`Unsupported vendor: ${options.vendor}`)
  }
  return model
}

export async function getConfiguredModelOptions(): Promise<ModelOptions> {
  return modelConfigService.getModelOptions()
}

export async function getConfiguredModel(): Promise<ModelAdaptor> {
  const options = await getConfiguredModelOptions()
  return createChatModel(options)
}

export async function getConfiguredQuickModel(): Promise<ModelAdaptor> {
  const options = await getConfiguredModelOptions()
  return createChatModel({
    ...options,
    temperature: Math.min(options.temperature ?? 0.7, 0.7),
    streaming: false
  })
}
