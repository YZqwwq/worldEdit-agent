import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { isAbsolute, join, normalize, relative } from 'node:path'
import type {
  AgentTraceQuery,
  AgentTraceQueryResult,
  AgentTraceRecord,
  AgentTraceRunSummary,
  AgentTraceRunSummaryQuery
} from '@share/cache/render/aiagent/agentTrace'

const MAX_TRACE_LOG_BYTES = 8 * 1024 * 1024
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024
const DEFAULT_QUERY_LIMIT = 40
const MAX_QUERY_LIMIT = 100
const DEFAULT_QUERY_CHAR_BUDGET = 12_000
const MAX_QUERY_CHAR_BUDGET = 40_000

let traceLogRoot =
  process.env.WORLDEDIT_AGENT_TRACE_ROOT?.trim() ||
  join(process.cwd(), 'src/main/services/log/logs')

export const configureAgentTraceStorage = (root: string): void => {
  traceLogRoot = root
}

const getTraceLogPath = (): string => join(traceLogRoot, 'agent-trace.jsonl')
const getPreviousTraceLogPath = (): string => join(traceLogRoot, 'agent-trace.previous.jsonl')
const getArtifactRoot = (): string => join(traceLogRoot, 'artifacts')
const safePathSegment = (value: string): string => {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]/g, '_')
  return normalized && normalized !== '.' && normalized !== '..' ? normalized : 'unscoped'
}

const readRecordsFromFile = (path: string): AgentTraceRecord[] => {
  if (!existsSync(path)) return []
  try {
    return readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as AgentTraceRecord]
        } catch {
          return []
        }
      })
  } catch {
    return []
  }
}

const readAvailableRecords = (): AgentTraceRecord[] => [
  ...readRecordsFromFile(getPreviousTraceLogPath()),
  ...readRecordsFromFile(getTraceLogPath())
]

export const prepareAgentTraceRun = (): void => {
  try {
    mkdirSync(traceLogRoot, { recursive: true })
    const current = getTraceLogPath()
    if (!existsSync(current) || statSync(current).size < MAX_TRACE_LOG_BYTES) return
    rmSync(getPreviousTraceLogPath(), { force: true })
    renameSync(current, getPreviousTraceLogPath())
  } catch {
    // Diagnostics must never prevent an Agent run.
  }
}

export const appendAgentTraceRecord = (record: AgentTraceRecord): void => {
  try {
    mkdirSync(traceLogRoot, { recursive: true })
    appendFileSync(getTraceLogPath(), `${JSON.stringify(record)}\n`)
  } catch {
    // Diagnostics must never prevent an Agent run.
  }
}

const listArtifactFiles = (
  root: string
): Array<{ path: string; size: number; mtimeMs: number }> => {
  if (!existsSync(root)) return []
  const files: Array<{ path: string; size: number; mtimeMs: number }> = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...listArtifactFiles(path))
    else if (entry.isFile()) {
      const stat = statSync(path)
      files.push({ path, size: stat.size, mtimeMs: stat.mtimeMs })
    }
  }
  return files
}

const pruneArtifacts = (): void => {
  try {
    const files = listArtifactFiles(getArtifactRoot()).sort((a, b) => a.mtimeMs - b.mtimeMs)
    let total = files.reduce((sum, file) => sum + file.size, 0)
    for (const file of files) {
      if (total <= MAX_ARTIFACT_BYTES) break
      rmSync(file.path, { force: true })
      total -= file.size
    }
  } catch {
    // Diagnostics must never prevent an Agent run.
  }
}

export const persistAgentTraceArtifact = (input: {
  runId: string
  artifactId: string
  extension: 'txt' | 'json'
  content: string
}): string => {
  const runDirectory = safePathSegment(input.runId)
  const artifactName = safePathSegment(input.artifactId)
  const relativePath = `${runDirectory}/${artifactName}.${input.extension}`
  try {
    const runRoot = join(getArtifactRoot(), runDirectory)
    mkdirSync(runRoot, { recursive: true })
    writeFileSync(join(getArtifactRoot(), relativePath), input.content, 'utf8')
    pruneArtifacts()
  } catch {
    // Keep the reference metadata even when artifact persistence is unavailable.
  }
  return relativePath.replace(/\\/g, '/')
}

const clampInteger = (value: number | undefined, fallback: number, max: number): number =>
  Math.min(max, Math.max(1, Math.floor(Number.isFinite(value) ? Number(value) : fallback)))

export const listAgentTraceRuns = (
  query: AgentTraceRunSummaryQuery = {}
): AgentTraceRunSummary[] => {
  const limit = clampInteger(query.limit, 10, 50)
  const grouped = new Map<string, AgentTraceRecord[]>()
  for (const record of readAvailableRecords()) {
    const records = grouped.get(record.runId) ?? []
    records.push(record)
    grouped.set(record.runId, records)
  }

  return [...grouped.entries()]
    .map(([runId, records]): AgentTraceRunSummary => {
      records.sort((a, b) => a.timestamp - b.timestamp || (a.sequence ?? 0) - (b.sequence ?? 0))
      const terminal = [...records].reverse().find((record) => record.node === 'turnSummary')
      const startedAt = records[0]?.timestamp ?? 0
      const completedAt = terminal?.timestamp
      const status = terminal?.phase === 'error' ? 'failed' : terminal ? 'completed' : 'running'
      return {
        runId,
        turnId: terminal?.turnId ?? records[0]?.turnId,
        status,
        startedAt,
        completedAt,
        durationMs: terminal?.durationMs,
        recordCount: records.length,
        nodePath: Array.isArray(terminal?.data?.nodePath)
          ? terminal.data.nodePath.filter((item): item is string => typeof item === 'string')
          : [],
        tools: Array.isArray(terminal?.data?.tools)
          ? terminal.data.tools.filter((item): item is string => typeof item === 'string')
          : [],
        failureNode:
          typeof terminal?.data?.failureNode === 'string' ? terminal.data.failureNode : undefined
      }
    })
    .filter((summary) => !query.status || summary.status === query.status)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit)
}

export const queryAgentTrace = (query: AgentTraceQuery): AgentTraceQueryResult => {
  const limit = clampInteger(query.limit, DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT)
  const charBudget = clampInteger(
    query.charBudget,
    DEFAULT_QUERY_CHAR_BUDGET,
    MAX_QUERY_CHAR_BUDGET
  )
  const cursor = Math.max(0, Math.floor(query.cursor ?? 0))
  const matching = readAvailableRecords()
    .filter((record) => record.runId === query.runId)
    .filter((record) => !query.node || record.node === query.node)
    .filter((record) => !query.phase || record.phase === query.phase)
    .filter((record) => !query.level || record.level === query.level)
    .sort((a, b) => a.timestamp - b.timestamp || (a.sequence ?? 0) - (b.sequence ?? 0))

  const records: AgentTraceRecord[] = []
  let usedChars = 0
  let index = cursor
  while (index < matching.length && records.length < limit) {
    const record = matching[index]
    const recordChars = JSON.stringify(record).length
    if (records.length > 0 && usedChars + recordChars > charBudget) break
    records.push(record)
    usedChars += recordChars
    index += 1
  }

  return {
    records,
    nextCursor: index < matching.length ? index : undefined,
    totalMatching: matching.length,
    returnedChars: usedChars,
    truncated: index < matching.length
  }
}

export const readAgentTraceArtifact = (input: {
  artifactRef: string
  maxChars?: number
}): { content: string; chars: number; truncated: boolean } => {
  const artifactRoot = normalize(getArtifactRoot())
  const resolved = normalize(join(artifactRoot, input.artifactRef))
  const relativePath = relative(artifactRoot, resolved)
  if (isAbsolute(relativePath) || relativePath.startsWith('..')) {
    throw new Error('Artifact reference escapes the trace artifact root.')
  }
  const content = readFileSync(resolved, 'utf8')
  const maxChars = clampInteger(input.maxChars, 8_000, MAX_QUERY_CHAR_BUDGET)
  return {
    content: content.slice(0, maxChars),
    chars: content.length,
    truncated: content.length > maxChars
  }
}
