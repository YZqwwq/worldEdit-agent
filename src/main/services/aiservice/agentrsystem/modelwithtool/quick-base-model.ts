import { type ModelOptions } from '@share/cache/AItype/model/modelOptions'
import { createChatModel } from './model'

const quickModelOptions: ModelOptions = {
  vendor: 'openai',
  model: 'qwen-flash',
  temperature: 0.5,
  apiKey: 'sk-523977e60e64460db438c9d7d33ba19d',
  streaming: true,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
}

export const quickModel = createChatModel(quickModelOptions)
