import type { ConfiguredModelRuntime } from '../../model-adapters/modelProviderAdapter'

export const resolveMainAgentTimeoutMs = (runtime: ConfiguredModelRuntime): number =>
  Math.max(10_000, Number(runtime.effectiveOptions.mainAgentTimeoutMs) || 60_000)

export type ModelCallAbortScope = {
  signal: AbortSignal
  didTimeout: () => boolean
  dispose: () => void
}

export const createModelCallAbortScope = (input: {
  timeoutMs: number
  externalSignal?: AbortSignal
}): ModelCallAbortScope => {
  const controller = new AbortController()
  let timedOut = false

  const abortFromExternalSignal = () => controller.abort(input.externalSignal?.reason)
  if (input.externalSignal?.aborted) abortFromExternalSignal()
  else input.externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true })

  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('model_call_timeout'))
  }, input.timeoutMs)

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timeout)
      input.externalSignal?.removeEventListener('abort', abortFromExternalSignal)
    }
  }
}
