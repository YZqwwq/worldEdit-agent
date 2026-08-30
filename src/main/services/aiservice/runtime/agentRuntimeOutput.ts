import { AsyncLocalStorage } from 'node:async_hooks'
import type {
  AgentStageChunk,
  AgentThoughtChunk,
  AgentTurnPhaseChunk,
  StreamChunk
} from '@share/cache/render/aiagent/aiContent'
import type { AgentTraceRecord } from '@share/cache/render/aiagent/agentTrace'

export type AgentRuntimeOutputContext = {
  runId: string
  sessionId: string
  eventId: string
  turnId: number
  emitChunk?: (chunk: StreamChunk) => void
}

const outputStorage = new AsyncLocalStorage<AgentRuntimeOutputContext>()

export function runWithAgentRuntimeOutput<T>(context: AgentRuntimeOutputContext, fn: () => Promise<T>): Promise<T> {
  return outputStorage.run(context, fn)
}

export const emitAgentThought = (thought: Omit<AgentThoughtChunk, 'type'>): void => {
  outputStorage.getStore()?.emitChunk?.({ type: 'agent_thought', ...thought })
}

export const emitAgentStage = (stage: Omit<AgentStageChunk, 'type'>): void => {
  outputStorage.getStore()?.emitChunk?.({ type: 'agent_stage', ...stage })
}

export const emitAgentTurnPhase = (phase: Omit<AgentTurnPhaseChunk, 'type'>): void => {
  outputStorage.getStore()?.emitChunk?.({ type: 'agent_turn_phase', ...phase })
}

export const emitAgentTraceChunk = (record: AgentTraceRecord): void => {
  outputStorage.getStore()?.emitChunk?.({ type: 'agent_trace', record })
}
