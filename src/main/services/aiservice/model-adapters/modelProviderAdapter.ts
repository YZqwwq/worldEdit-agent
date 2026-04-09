import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { convertToOpenAITool } from '@langchain/core/utils/function_calling'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'
import type { ModelAdaptor } from '@share/cache/AItype/model/modelAdaptor'
import type { ModelOptions } from '@share/cache/AItype/model/modelOptions'
import type { ModelProviderProfile } from '@share/cache/AItype/model/modelProvider'
import type { ModelProtocolFamily } from '@share/cache/AItype/model/modelProtocolFamily'
import type { ProxyResponseMetadata } from '@share/cache/AItype/model/proxyResponseMetadata'
import type { ModelVendor } from '@share/cache/AItype/model/modelVender'
import {
  buildQwenInputContent,
  getMainAgentContentPartsFromMessage,
  isQwenVisionModel,
  messageHasMainAgentFiles,
  parseMainAgentContentForPersistence,
  stripMainAgentContentPartsMetadata
} from '../messagecontent/mainAgentMessageContentService'

export type ModelProtocolFamilyAdapter = {
  family: ModelProtocolFamily
  vendor: ModelVendor
  createModel: (options: ModelOptions) => ModelAdaptor
  formatTools: (tools: DynamicStructuredTool[]) => unknown[]
  prepareMessages: (
    messages: BaseMessage[],
    runtime: ConfiguredModelRuntime
  ) => Promise<BaseMessage[]>
  normalizeResponse: (response: BaseMessage) => BaseMessage
}

export type ModelProviderProfileSpec = {
  profile: ModelProviderProfile
  family: ModelProtocolFamily
  vendor: ModelVendor
  applyOptions: (options: ModelOptions) => ModelOptions
}

export type ConfiguredModelRuntime = {
  model: ModelAdaptor
  options: ModelOptions
  effectiveOptions: ModelOptions
  family: ModelProtocolFamily
  profile: ModelProviderProfile
  familyAdapter: ModelProtocolFamilyAdapter
  profileSpec: ModelProviderProfileSpec
}

const cleanSchema = (schema: unknown): unknown => {
  if (typeof schema !== 'object' || schema === null) return schema
  if (Array.isArray(schema)) return schema.map(cleanSchema)

  const newSchema = { ...(schema as Record<string, unknown>) }
  if ('additionalProperties' in newSchema) {
    delete newSchema.additionalProperties
  }
  if ('schema' in newSchema) {
    delete newSchema.schema
  }
  if ('$schema' in newSchema) {
    delete newSchema.$schema
  }

  for (const key of Object.keys(newSchema)) {
    newSchema[key] = cleanSchema(newSchema[key])
  }

  return newSchema
}

const formatOpenAICompatibleTools = (tools: DynamicStructuredTool[]): unknown[] =>
  tools.map((tool) => {
    const openAITool = convertToOpenAITool(tool)
    if (openAITool.function?.parameters) {
      openAITool.function.parameters = cleanSchema(openAITool.function.parameters) as any
    }
    return openAITool
  })

const normalizeOpenAICompatibleResponse = (response: BaseMessage): BaseMessage => {
  const isAIMessage =
    response instanceof AIMessage ||
    response.constructor.name === 'AIMessageChunk' ||
    (response as { _getType?: () => string })._getType?.() === 'ai'

  if (!isAIMessage) {
    return response
  }

  const aiMsg = response as AIMessage
  if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
    return response
  }

  const metadata = response.response_metadata as ProxyResponseMetadata | undefined
  if (!metadata?.output || !Array.isArray(metadata.output)) {
    return response
  }

  const toolCalls: Array<{
    name: string
    args: Record<string, any>
    id: string
    type: 'tool_call'
  }> = []
  for (const item of metadata.output) {
    if (item.type !== 'function_call' && item.type !== 'tool_call') {
      continue
    }

    try {
      const parsedArgs =
        typeof item.arguments === 'string' ? JSON.parse(item.arguments) : item.arguments
      const args =
        parsedArgs && typeof parsedArgs === 'object' && !Array.isArray(parsedArgs)
          ? (parsedArgs as Record<string, any>)
          : {}
      toolCalls.push({
        name: item.name,
        args,
        id: item.call_id || item.id || `call_${Math.random().toString(36).slice(2, 10)}`,
        type: 'tool_call'
      })
    } catch {
      // ignore malformed proxy args
    }
  }

  if (toolCalls.length === 0) {
    return response
  }

  return new AIMessage({
    content: response.content,
    additional_kwargs: response.additional_kwargs,
    response_metadata: response.response_metadata,
    tool_calls: toolCalls,
    id: response.id
  })
}

const prepareOpenAICompatibleMessages = async (
  messages: BaseMessage[],
  runtime: ConfiguredModelRuntime
): Promise<BaseMessage[]> => {
  const modelName = runtime.effectiveOptions.model || runtime.options.model

  return Promise.all(
    messages.map(async (message) => {
      if (!(message instanceof HumanMessage) || !messageHasMainAgentFiles(message)) {
        return message
      }

      const content = getMainAgentContentPartsFromMessage(message)
      const additionalKwargs = stripMainAgentContentPartsMetadata(message.additional_kwargs)
      const fallbackText =
        typeof message.content === 'string' && message.content.trim()
          ? message.content
          : parseMainAgentContentForPersistence(content)

      if (runtime.profile !== 'dashscope_qwen' || !isQwenVisionModel(modelName)) {
        return new HumanMessage({
          content: fallbackText,
          additional_kwargs: additionalKwargs
        })
      }

      return new HumanMessage({
        content: (await buildQwenInputContent(content)) as any,
        additional_kwargs: additionalKwargs
      })
    })
  )
}

const openAICompatibleFamilyAdapter: ModelProtocolFamilyAdapter = {
  family: 'openai_compatible',
  vendor: 'openai',
  createModel(options) {
    return new ChatOpenAI({
      model: options.model,
      temperature: options.temperature,
      apiKey: options.apiKey,
      streaming: options.streaming,
      useResponsesApi: options.useResponsesApi,
      configuration: options.baseURL ? { baseURL: options.baseURL } : undefined
    })
  },
  formatTools: formatOpenAICompatibleTools,
  prepareMessages: prepareOpenAICompatibleMessages,
  normalizeResponse: normalizeOpenAICompatibleResponse
}

const anthropicNativeFamilyAdapter: ModelProtocolFamilyAdapter = {
  family: 'anthropic_native',
  vendor: 'anthropic',
  createModel(options) {
    return new ChatAnthropic({
      model: options.model,
      temperature: options.temperature,
      apiKey: options.apiKey
    })
  },
  formatTools(tools) {
    return tools
  },
  async prepareMessages(messages) {
    return messages
  },
  normalizeResponse(response) {
    return response
  }
}

const openAIProfile: ModelProviderProfileSpec = {
  profile: 'openai',
  family: 'openai_compatible',
  vendor: 'openai',
  applyOptions(options) {
    return options
  }
}

const dashscopeQwenProfile: ModelProviderProfileSpec = {
  profile: 'dashscope_qwen',
  family: 'openai_compatible',
  vendor: 'openai',
  applyOptions(options) {
    return {
      ...options,
      useResponsesApi: false
    }
  }
}

const anthropicProfile: ModelProviderProfileSpec = {
  profile: 'anthropic',
  family: 'anthropic_native',
  vendor: 'anthropic',
  applyOptions(options) {
    return options
  }
}

export const resolveModelProviderProfile = (options: ModelOptions): ModelProviderProfile => {
  if (options.vendor === 'anthropic') {
    return 'anthropic'
  }

  if (options.vendor === 'openai') {
    const baseURL = String(options.baseURL || '').trim().toLowerCase()
    const model = String(options.model || '').trim().toLowerCase()
    if (baseURL.includes('dashscope.aliyuncs.com') || model.startsWith('qwen')) {
      return 'dashscope_qwen'
    }
    return 'openai'
  }

  throw new Error(`Unsupported vendor: ${options.vendor}`)
}

export const getModelProviderProfileSpec = (
  options: ModelOptions
): ModelProviderProfileSpec => {
  const profile = resolveModelProviderProfile(options)
  if (profile === 'anthropic') {
    return anthropicProfile
  }
  if (profile === 'dashscope_qwen') {
    return dashscopeQwenProfile
  }
  return openAIProfile
}

export const resolveModelProtocolFamily = (
  options: ModelOptions
): ModelProtocolFamily => getModelProviderProfileSpec(options).family

export const getModelProtocolFamilyAdapter = (
  family: ModelProtocolFamily
): ModelProtocolFamilyAdapter => {
  if (family === 'anthropic_native') {
    return anthropicNativeFamilyAdapter
  }
  return openAICompatibleFamilyAdapter
}

export const createConfiguredModelRuntime = (
  options: ModelOptions
): ConfiguredModelRuntime => {
  const profileSpec = getModelProviderProfileSpec(options)
  const effectiveOptions = profileSpec.applyOptions(options)
  const familyAdapter = getModelProtocolFamilyAdapter(profileSpec.family)
  return {
    model: familyAdapter.createModel(effectiveOptions),
    options,
    effectiveOptions,
    family: profileSpec.family,
    profile: profileSpec.profile,
    familyAdapter,
    profileSpec
  }
}

export const normalizeModelResponse = (
  runtime: ConfiguredModelRuntime,
  response: BaseMessage
): BaseMessage => runtime.familyAdapter.normalizeResponse(response)
