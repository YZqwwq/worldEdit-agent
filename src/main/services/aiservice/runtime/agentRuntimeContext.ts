import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import { runWithAgentRuntimeOutput } from './agentRuntimeOutput'
import { runWithTraceStorage } from '../../log/trace/agentTraceRuntime'

export function runWithAgentRuntimeContext<T>(
  runId: string,
  options: {
    sessionId: string
    eventId: string
    turnId: number
    emitChunk?: (chunk: StreamChunk) => void
  },
  fn: () => Promise<T>
): Promise<T> {
  return runWithAgentRuntimeOutput(
    { runId, sessionId: options.sessionId, eventId: options.eventId, turnId: options.turnId, emitChunk: options.emitChunk },
    () => runWithTraceStorage({ runId, sessionId: options.sessionId, eventId: options.eventId, turnId: options.turnId }, fn)
  )
}
