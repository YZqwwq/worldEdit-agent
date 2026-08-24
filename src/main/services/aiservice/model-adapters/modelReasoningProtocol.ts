import type { ModelOptions } from '@share/cache/AItype/model/modelOptions'
import type { ModelProviderProfile } from '@share/cache/AItype/model/modelProvider'
import type { ReasoningProtocolPreference } from '@share/cache/AItype/states/reasoningChannel'

export const resolveProfileReasoningProtocol = (
  profile: ModelProviderProfile,
  options: ModelOptions
): ReasoningProtocolPreference => {
  if (options.reasoningProtocol) return options.reasoningProtocol
  if (profile === 'dashscope_qwen') {
    return options.modelKwargs?.enable_thinking === true ? 'auto' : 'emulated'
  }
  return 'auto'
}
