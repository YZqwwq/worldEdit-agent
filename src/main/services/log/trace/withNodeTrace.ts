import {
  traceEnter,
  traceError,
  traceExit
} from './agentTraceEmitter'

type TraceDetail = {
  title?: string
  summary?: string
  data?: Record<string, unknown>
}

type WithNodeTraceOptions<T, R> = {
  summarizeInput?: (state: T) => TraceDetail | undefined
  summarizeOutput?: (output: R, state: T) => TraceDetail | undefined
}

export function withNodeTrace<T, R, C = unknown>(
  nodeName: string,
  fn: (state: T, config?: C) => Promise<R>,
  options?: WithNodeTraceOptions<T, R>
): (state: T, config?: C) => Promise<R> {
  return async (state: T, config?: C): Promise<R> => {
    const startedAt = Date.now()
    traceEnter(nodeName, options?.summarizeInput?.(state))

    try {
      const output = await fn(state, config)
      traceExit(nodeName, {
        ...options?.summarizeOutput?.(output, state),
        durationMs: Date.now() - startedAt
      })
      return output
    } catch (error) {
      traceError(nodeName, error, {
        durationMs: Date.now() - startedAt
      })
      throw error
    }
  }
}
