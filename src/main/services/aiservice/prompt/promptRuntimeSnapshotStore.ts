import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getAiServicePromptDir } from '../../../config/pathConfig'
import { findLatestAgentTraceArtifact } from '../../log/trace/agentTraceStore'

export type PromptRuntimeSnapshotMessage = {
  type: string
  content: unknown
  additionalKwargs?: Record<string, unknown>
  toolCalls?: unknown[]
  toolCallId?: string
  name?: string
}

export type PromptRuntimeSnapshot = {
  source: 'runtime' | 'trace'
  capturedAt: string
  modelStep: number
  model?: string
  profile?: string
  reasoningProtocol?: string
  messages: PromptRuntimeSnapshotMessage[]
}

const getPath = (): string => join(getAiServicePromptDir(), 'latest-cognition-prompt.json')

export const savePromptRuntimeSnapshot = async (
  snapshot: PromptRuntimeSnapshot
): Promise<void> => {
  await mkdir(getAiServicePromptDir(), { recursive: true })
  await writeFile(getPath(), JSON.stringify(snapshot, null, 2), 'utf8')
}

export const getPromptRuntimeSnapshot = async (): Promise<PromptRuntimeSnapshot | null> => {
  try {
    if (existsSync(getPath())) {
      const parsed = JSON.parse(await readFile(getPath(), 'utf8')) as PromptRuntimeSnapshot
      if (parsed && Array.isArray(parsed.messages)) return { ...parsed, source: 'runtime' }
    }
  } catch {
    // Fall through to the latest diagnostics artifact.
  }

  const artifact = findLatestAgentTraceArtifact(/^cognition-prompt-step-\d+\.json$/)
  if (!artifact) return null
  try {
    const parsed = JSON.parse(artifact.content) as {
      model?: string
      profile?: string
      reasoningProtocol?: string
      messages?: Array<{
        type?: string
        content?: unknown
        additional_kwargs?: Record<string, unknown>
      }>
    }
    if (!Array.isArray(parsed.messages)) return null
    const modelStepMatch = artifact.path.match(/cognition-prompt-step-(\d+)\.json$/)
    return {
      source: 'trace',
      capturedAt: new Date(artifact.mtimeMs).toISOString(),
      modelStep: Number(modelStepMatch?.[1] ?? 0),
      model: parsed.model,
      profile: parsed.profile,
      reasoningProtocol: parsed.reasoningProtocol,
      messages: parsed.messages.map((message) => ({
        type: message.type || 'BaseMessage',
        content: message.content ?? '',
        additionalKwargs: message.additional_kwargs
      }))
    }
  } catch {
    return null
  }
}
