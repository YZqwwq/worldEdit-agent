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
  model: 'gpt-5.2',
  temperature: 0.9,
  apiKey: 'sk-PcyKJs0RiLFIkS8F9kFaZZA8CbSsXwWaDtCkLXXq7eNgUYvb',
  streaming: true,
  useResponsesApi: true,
  baseURL: 'https://api1.uiuiapi.com/v1'
}

// 对外暴露的模型配置
export const model = createChatModel(defaultModelOptions)
