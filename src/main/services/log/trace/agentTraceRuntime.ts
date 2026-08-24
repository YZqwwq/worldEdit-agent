import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type { AgentTraceRecord } from '@share/cache/render/aiagent/agentTrace'
import { appendAgentTraceRecord, prepareAgentTraceRun } from './agentTraceStore'

export type AgentTraceRuntimeContext = {
  runId: string
  turnId?: number
  emitChunk?: (chunk: StreamChunk) => void
  startedAt: number
  recordCount: number
  nodePath: string[]
  toolNames: Set<string>
  failureNode?: string
}

const agentTraceStorage = new AsyncLocalStorage<AgentTraceRuntimeContext>()
export const captureTraceRecord = (record: AgentTraceRecord): void => {
  const context = agentTraceStorage.getStore()
  if (!context) return
  context.recordCount += 1
  if (record.phase === 'enter') context.nodePath.push(record.node)
  if (record.phase === 'error') context.failureNode = record.node

  const toolName = record.data?.toolName
  if (typeof toolName === 'string' && toolName.trim()) context.toolNames.add(toolName)
  const toolNames = record.data?.toolNames
  if (Array.isArray(toolNames)) {
    for (const name of toolNames) {
      if (typeof name === 'string' && name.trim()) context.toolNames.add(name)
    }
  }
}

const finalizeTraceContext = (context: AgentTraceRuntimeContext, thrown?: unknown): void => {
  const failureNode = context.failureNode || (thrown ? 'runtime' : undefined)
  const durationMs = Date.now() - context.startedAt
  const record: AgentTraceRecord = {
    id: randomUUID(),
    runId: context.runId,
    turnId: context.turnId,
    node: 'turnSummary',
    phase: failureNode ? 'error' : 'exit',
    title: failureNode ? 'Turn 运行失败' : 'Turn 运行完成',
    summary: failureNode
      ? `失败节点=${failureNode}，耗时=${durationMs}ms`
      : `节点=${context.nodePath.length}，工具=${context.toolNames.size}，耗时=${durationMs}ms`,
    data: {
      status: failureNode ? 'failed' : 'completed',
      nodePath: context.nodePath,
      tools: [...context.toolNames],
      failureNode: failureNode ?? null,
      recordCount: context.recordCount
    },
    timestamp: Date.now(),
    durationMs,
    level: failureNode ? 'error' : 'info',
    sequence: context.recordCount + 1
  }
  appendAgentTraceRecord(record)
  context.emitChunk?.({ type: 'agent_trace', record })
}

export function runWithTraceContext<T>(
  runId: string,
  options: {
    turnId?: number
    emitChunk?: (chunk: StreamChunk) => void
  },
  fn: () => Promise<T>
): Promise<T> {
  prepareAgentTraceRun()
  const context: AgentTraceRuntimeContext = {
    runId,
    turnId: options.turnId,
    emitChunk: options.emitChunk,
    startedAt: Date.now(),
    recordCount: 0,
    nodePath: [],
    toolNames: new Set<string>()
  }
  return agentTraceStorage.run(context, async () => {
    let thrown: unknown
    try {
      return await fn()
    } catch (error) {
      thrown = error
      throw error
    } finally {
      finalizeTraceContext(context, thrown)
    }
  })
}

export function getTraceContext(): AgentTraceRuntimeContext | undefined {
  return agentTraceStorage.getStore()
}
