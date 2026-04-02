import type { TaskExecutionRecord } from '../../../share/entity/database/TaskExecutionRecord'
import type { TaskExecutorKind } from '@share/cache/AItype/states/taskLifecycleState'
import type {
  TaskExecutionInspectionField,
  TaskExecutionInspectionSection
} from '@share/cache/AItype/states/taskExecutionInspection'
import { getSubAgentRuntimeSpec } from './subAgentRegistry'

const parseJsonObject = (input: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(input)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // ignore bad persisted payloads
  }
  return {}
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isNonEmptyRecord = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && Object.keys(value).length > 0

const formatJson = (value: unknown): string | undefined => {
  if (!isNonEmptyRecord(value) && !Array.isArray(value)) {
    return undefined
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return undefined
  }
}

const formatValue = (value: unknown): string => {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const text = value
      .map((item) => formatValue(item))
      .filter((item) => item.length > 0)
      .join(' / ')
    return text || '[]'
  }
  if (isRecord(value)) {
    const json = formatJson(value)
    return json || '{}'
  }
  return ''
}

const pushField = (
  fields: TaskExecutionInspectionField[],
  key: string,
  label: string,
  value: unknown
): void => {
  const text = formatValue(value)
  if (!text) return
  fields.push({ key, label, value: text })
}

const buildGenericSection = (
  title: string,
  payload: Record<string, unknown>,
  summary?: string
): TaskExecutionInspectionSection | undefined => {
  if (!isNonEmptyRecord(payload) && !summary) return undefined

  const fields: TaskExecutionInspectionField[] = []
  Object.entries(payload).forEach(([key, value]) => {
    pushField(fields, key, key, value)
  })

  return {
    title,
    summary: summary?.trim() || undefined,
    fields,
    rawJson: formatJson(payload)
  }
}

const buildExecutionInputSection = (
  executorKind: TaskExecutorKind,
  payload: Record<string, unknown>
): TaskExecutionInspectionSection | undefined => {
  const inspection = getSubAgentRuntimeSpec(executorKind).inspection
  if (inspection?.buildInputSection) {
    return inspection.buildInputSection(payload)
  }
  return buildGenericSection('输入', payload)
}

const buildExecutionOutputSection = (
  executorKind: TaskExecutorKind,
  payload: Record<string, unknown>,
  summary?: string
): TaskExecutionInspectionSection | undefined => {
  const runtimeSpec = getSubAgentRuntimeSpec(executorKind)
  if (runtimeSpec.inspection?.buildOutputSection) {
    return runtimeSpec.inspection.buildOutputSection({
      payload,
      summary,
      protocol: runtimeSpec.protocol
    })
  }
  return buildGenericSection('输出', payload, summary)
}

export const mapTaskExecutionInspection = (
  run: Pick<
    TaskExecutionRecord,
    'executorKind' | 'inputPayloadJson' | 'reportPayloadJson' | 'resultSummary'
  >
): {
  input?: TaskExecutionInspectionSection
  output?: TaskExecutionInspectionSection
} => {
  const inputPayload = parseJsonObject(run.inputPayloadJson)
  const outputPayload = parseJsonObject(run.reportPayloadJson)

  return {
    input: buildExecutionInputSection(run.executorKind, inputPayload),
    output: buildExecutionOutputSection(run.executorKind, outputPayload, run.resultSummary)
  }
}
