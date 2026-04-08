import { ModelAdaptor } from '@share/cache/AItype/model/modelAdaptor'
import { type ModelOptions } from '@share/cache/AItype/model/modelOptions'
import { modelConfigService } from '../../../modelconfig/modelConfigService'
import {
  createConfiguredModelRuntime,
  type ConfiguredModelRuntime
} from '../../model-adapters/modelProviderAdapter'

export function createChatModel(options: ModelOptions): ModelAdaptor {
  return createConfiguredModelRuntime(options).model
}

export function createChatModelRuntime(options: ModelOptions): ConfiguredModelRuntime {
  return createConfiguredModelRuntime(options)
}

export async function getConfiguredModelOptions(): Promise<ModelOptions> {
  return modelConfigService.getModelOptions()
}

export async function getConfiguredModel(): Promise<ModelAdaptor> {
  const options = await getConfiguredModelOptions()
  return createChatModel(options)
}

export async function getConfiguredModelRuntime(): Promise<ConfiguredModelRuntime> {
  const options = await getConfiguredModelOptions()
  return createChatModelRuntime(options)
}

export async function getConfiguredQuickModel(): Promise<ModelAdaptor> {
  const options = await getConfiguredModelOptions()
  return createChatModel({
    ...options,
    temperature: Math.min(options.temperature ?? 0.7, 0.7),
    streaming: false
  })
}

export async function getConfiguredQuickModelRuntime(): Promise<ConfiguredModelRuntime> {
  const options = await getConfiguredModelOptions()
  return createChatModelRuntime({
    ...options,
    temperature: Math.min(options.temperature ?? 0.7, 0.7),
    streaming: false
  })
}
