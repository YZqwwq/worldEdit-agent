import {
  configureAgentTraceStorage,
  listAgentTraceRuns,
  queryAgentTrace,
  readAgentTraceArtifact
} from '../src/main/services/log/trace/agentTraceStore'
import type {
  AgentTraceLevel,
  AgentTracePhase,
  AgentTraceRunStatus
} from '../src/share/cache/render/aiagent/agentTrace'

const args = process.argv.slice(2)
const command = args[0] || 'list'

const option = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`)
  if (index >= 0) return args[index + 1]
  const prefixed = args.find((arg) => arg.startsWith(`--${name}=`))
  return prefixed?.slice(name.length + 3)
}

const numberOption = (name: string): number | undefined => {
  const value = option(name)
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`--${name} must be a number.`)
  return parsed
}

const root = option('root')
if (root) configureAgentTraceStorage(root)

const print = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

if (command === 'list') {
  print(
    listAgentTraceRuns({
      limit: numberOption('limit'),
      status: option('status') as AgentTraceRunStatus | undefined
    })
  )
} else if (command === 'run') {
  const runId = option('run')
  if (!runId) throw new Error('run requires --run <runId>.')
  print(
    queryAgentTrace({
      runId,
      cursor: numberOption('cursor'),
      limit: numberOption('limit'),
      charBudget: numberOption('chars'),
      node: option('node'),
      phase: option('phase') as AgentTracePhase | undefined,
      level: option('level') as AgentTraceLevel | undefined
    })
  )
} else if (command === 'artifact') {
  const artifactRef = option('ref')
  if (!artifactRef) throw new Error('artifact requires --ref <artifactRef>.')
  print(readAgentTraceArtifact({ artifactRef, maxChars: numberOption('chars') }))
} else {
  throw new Error('Usage: trace:inspect -- list|run|artifact [options]')
}
