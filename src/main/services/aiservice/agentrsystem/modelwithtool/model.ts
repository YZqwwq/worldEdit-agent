import { ChatOpenAI } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { ModelAdaptor } from '@share/cache/AItype/model/modelAdaptor'
import { type ModelOptions } from '@share/cache/AItype/model/modelOptions'

function createChatModel(options: ModelOptions): ModelAdaptor {
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

const defaultModelOptions: ModelOptions = {
  vendor: 'openai',
  model: 'gpt-3.5-turbo',
  temperature: 0.7,
  apiKey: '',
  streaming: false,
  useResponsesApi: false,
  baseURL: ''
}

// 对外暴露的模型配置
export const model = createChatModel(defaultModelOptions)
