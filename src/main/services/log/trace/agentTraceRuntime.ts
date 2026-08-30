import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { AgentTraceRecord } from '@share/cache/render/aiagent/agentTrace'
import { appendAgentTraceRecord, prepareAgentTraceRun } from './agentTraceStore'
import { emitAgentTraceChunk } from '../../aiservice/runtime/agentRuntimeOutput'

export type AgentTraceRuntimeContext = {
  runId: string
  sessionId: string
  eventId: string
  turnId: number
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
  const interrupted =
    thrown instanceof Error &&
    (thrown.name === 'AbortError' || /interrupted|aborted/i.test(thrown.message))
  const failureNode = interrupted ? undefined : context.failureNode || (thrown ? 'runtime' : undefined)
  const durationMs = Date.now() - context.startedAt
  const status = interrupted ? 'interrupted' : failureNode ? 'failed' : 'completed'
  const record: AgentTraceRecord = {
    id: randomUUID(),
    sessionId: context.sessionId,
    eventId: context.eventId,
    turnId: context.turnId,
    runId: context.runId,
    scope: 'run',
    node: 'runSummary',
    phase: failureNode ? 'error' : 'exit',
    status,
    title:
      status === 'interrupted'
        ? 'Run 执行中断'
        : status === 'failed'
          ? 'Run 执行失败'
          : 'Run 执行完成',
    summary:
      status === 'interrupted'
        ? `用户或运行时中断，耗时=${durationMs}ms`
        : failureNode
          ? `失败节点=${failureNode}，耗时=${durationMs}ms`
          : `节点=${context.nodePath.length}，工具=${context.toolNames.size}，耗时=${durationMs}ms`,
    data: {
      status,
      nodePath: context.nodePath,
      tools: [...context.toolNames],
      failureNode: failureNode ?? null,
      recordCount: context.recordCount
    },
    timestamp: Date.now(),
    durationMs,
    level: failureNode ? 'error' : interrupted ? 'warn' : 'info',
    sequence: context.recordCount + 1
  }
  appendAgentTraceRecord(record)
  emitAgentTraceChunk(record)
}

export function runWithTraceStorage<T>(
  options: {
    runId: string
    sessionId: string
    eventId: string
    turnId: number
  },
  fn: () => Promise<T>
): Promise<T> {
  prepareAgentTraceRun()
  const context: AgentTraceRuntimeContext = {
    runId: options.runId,
    sessionId: options.sessionId,
    eventId: options.eventId,
    turnId: options.turnId,
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
