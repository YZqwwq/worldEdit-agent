import { createHash, randomUUID } from 'node:crypto'
import type {
  AgentTraceLevel,
  AgentTracePhase,
  AgentTraceRecord
} from '@share/cache/render/aiagent/agentTrace'
import type {
  AgentStageChunk,
  AgentThoughtChunk,
  AgentTurnPhaseChunk
} from '@share/cache/render/aiagent/aiContent'
import { captureTraceRecord, getTraceContext } from './agentTraceRuntime'
import { appendAgentTraceRecord, persistAgentTraceArtifact } from './agentTraceStore'

type AgentTraceDetail = {
  title?: string
  summary?: string
  data?: Record<string, unknown>
  level?: AgentTraceLevel
  parentId?: string
  durationMs?: number
}

const MAX_INLINE_STRING_CHARS = 2_000
const MAX_INLINE_VALUE_CHARS = 6_000
const SENSITIVE_KEY =
  /^(?:authorization|cookie|password|secret|api[-_]?key|access[-_]?token|refresh[-_]?token)$/i

type TraceArtifactReference = {
  $artifactRef: string
  kind: 'text' | 'json'
  chars: number
  sha256: string
  preview: string
}

const persistArtifact = (value: unknown, kind: 'text' | 'json'): TraceArtifactReference => {
  const context = getTraceContext()
  const runId = context?.runId || 'unscoped'
  const serialized = kind === 'text' ? String(value) : JSON.stringify(value)
  const artifactId = randomUUID()
  const relativePath = persistAgentTraceArtifact({
    runId,
    artifactId,
    extension: kind === 'text' ? 'txt' : 'json',
    content: serialized
  })
  return {
    $artifactRef: relativePath.replace(/\\/g, '/'),
    kind,
    chars: serialized.length,
    sha256: createHash('sha256').update(serialized).digest('hex'),
    preview: serialized.slice(0, 240)
  }
}

const redactSensitiveValue = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return { circular: true }
  seen.add(value)
  if (Array.isArray(value)) return value.map((item) => redactSensitiveValue(item, seen))
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactSensitiveValue(item, seen)
    ])
  )
}

const sanitizeRedactedValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return value.length > MAX_INLINE_STRING_CHARS ? persistArtifact(value, 'text') : value
  }
  if (!value || typeof value !== 'object') return value

  let serialized = ''
  try {
    serialized = JSON.stringify(value)
  } catch {
    return { unserializable: true }
  }
  if (serialized.length > MAX_INLINE_VALUE_CHARS) return persistArtifact(value, 'json')
  if (Array.isArray(value)) return value.map(sanitizeRedactedValue)
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      sanitizeRedactedValue(item)
    ])
  )
}

const sanitizeValue = (value: unknown): unknown =>
  sanitizeRedactedValue(redactSensitiveValue(value))

const sanitizeData = (
  data: Record<string, unknown> | undefined
): Record<string, unknown> | undefined => {
  if (!data) return undefined
  try {
    return sanitizeValue(data) as Record<string, unknown>
  } catch {
    return {
      unserializable: true
    }
  }
}

const buildRecord = (
  node: string,
  phase: AgentTracePhase,
  detail?: AgentTraceDetail
): AgentTraceRecord | null => {
  const context = getTraceContext()
  if (!context) return null

  return {
    id: randomUUID(),
    runId: context.runId,
    turnId: context.turnId,
    parentId: detail?.parentId,
    node,
    phase,
    title: detail?.title || `${phase}: ${node}`,
    summary: detail?.summary,
    data: sanitizeData(detail?.data),
    timestamp: Date.now(),
    durationMs: detail?.durationMs,
    level: detail?.level || 'info',
    sequence: context.recordCount + 1
  }
}

const emitRecord = (record: AgentTraceRecord | null): AgentTraceRecord | null => {
  if (!record) return null
  captureTraceRecord(record)

  const context = getTraceContext()
  if (context?.emitChunk) {
    context.emitChunk({
      type: 'agent_trace',
      record
    })
  }

  appendAgentTraceRecord(record)

  return record
}

export const emitAgentStage = (stage: Omit<AgentStageChunk, 'type'>): void => {
  const context = getTraceContext()
  if (!context?.emitChunk) return

  context.emitChunk({
    type: 'agent_stage',
    ...stage
  })
}

export const emitAgentThought = (thought: Omit<AgentThoughtChunk, 'type'>): void => {
  const context = getTraceContext()
  if (!context?.emitChunk) return

  context.emitChunk({
    type: 'agent_thought',
    ...thought
  })
}

export const emitAgentTurnPhase = (phase: Omit<AgentTurnPhaseChunk, 'type'>): void => {
  const context = getTraceContext()
  if (!context?.emitChunk) return

  context.emitChunk({
    type: 'agent_turn_phase',
    ...phase
  })
}

export const traceEnter = (node: string, detail?: AgentTraceDetail): AgentTraceRecord | null =>
  emitRecord(
    buildRecord(node, 'enter', {
      title: detail?.title || `进入: ${node}`,
      ...detail
    })
  )

export const traceState = (node: string, detail?: AgentTraceDetail): AgentTraceRecord | null =>
  emitRecord(
    buildRecord(node, 'state', {
      title: detail?.title || `状态: ${node}`,
      ...detail
    })
  )

export const traceDecision = (node: string, detail?: AgentTraceDetail): AgentTraceRecord | null =>
  emitRecord(
    buildRecord(node, 'decision', {
      title: detail?.title || `决策: ${node}`,
      ...detail
    })
  )

export const traceArtifact = (node: string, detail?: AgentTraceDetail): AgentTraceRecord | null =>
  emitRecord(
    buildRecord(node, 'artifact', {
      title: detail?.title || `产物: ${node}`,
      ...detail
    })
  )

export const traceExit = (node: string, detail?: AgentTraceDetail): AgentTraceRecord | null =>
  emitRecord(
    buildRecord(node, 'exit', {
      title: detail?.title || `完成: ${node}`,
      ...detail
    })
  )

export const traceError = (
  node: string,
  error: unknown,
  detail?: Omit<AgentTraceDetail, 'level'>
): AgentTraceRecord | null =>
  emitRecord(
    buildRecord(node, 'error', {
      title: detail?.title || `异常: ${node}`,
      summary:
        detail?.summary ||
        (error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'unknown error'),
      data: {
        ...(detail?.data || {}),
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack
              }
            : String(error)
      },
      durationMs: detail?.durationMs,
      parentId: detail?.parentId,
      level: 'error'
    })
  )
