import type { TaskExecutionRecord } from '../../../share/entity/database/TaskExecutionRecord'
import type { TaskExecutorKind } from '@share/cache/AItype/states/taskLifecycleState'
import type {
  TaskExecutionInspectionField,
  TaskExecutionInspectionSection
} from '@share/cache/AItype/states/taskExecutionInspection'
import { parseSubAgentProtocolPayload } from '@share/cache/AItype/states/taskCommunication'

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

const normalizeText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

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

const formatCharacterDirection = (value: unknown): string => {
  if (value === 'character_deeds') return '人物事迹'
  if (value === 'character_profile') return '人物档案'
  if (value === 'demographic_facts') return '基础属性'
  return formatValue(value)
}

const formatCharacterSource = (value: unknown): string => {
  if (value === 'chat') return '聊天'
  if (value === 'world_entity_view') return '世界实体面板'
  return formatValue(value)
}

const formatCharacterPendingPhase = (value: unknown): string => {
  if (value === 'resolve_world') return '解析世界'
  if (value === 'resolve_character') return '解析人物'
  if (value === 'apply_edit') return '执行编辑'
  return formatValue(value)
}

const formatOutcome = (value: unknown): string => {
  if (value === 'completed') return '完成'
  if (value === 'needs_input') return '需要补参'
  if (value === 'failed') return '失败'
  if (value === 'cancelled') return '已取消'
  return formatValue(value)
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

const buildCharacterEditorInputSection = (
  payload: Record<string, unknown>
): TaskExecutionInspectionSection | undefined => {
  if (!isNonEmptyRecord(payload)) return undefined

  const fields: TaskExecutionInspectionField[] = []
  pushField(fields, 'originalUserRequest', '用户原始请求', payload.originalUserRequest)
  if (normalizeText(payload.userRequest) !== normalizeText(payload.originalUserRequest)) {
    pushField(fields, 'userRequest', '本轮执行请求', payload.userRequest)
  }
  pushField(fields, 'characterName', '目标人物', payload.characterName)
  pushField(fields, 'entityId', '实体 ID', payload.entityId)
  pushField(fields, 'worldName', '所属世界', payload.worldName)
  pushField(fields, 'worldId', '世界 ID', payload.worldId)
  pushField(fields, 'editingDirection', '编辑方向', formatCharacterDirection(payload.editingDirection))
  pushField(fields, 'expectedOutcome', '预期结果', payload.expectedOutcome)
  pushField(fields, 'source', '任务来源', formatCharacterSource(payload.source))
  pushField(fields, 'editingScope', '建议编辑范围', payload.editingScope)

  const pendingContext = isRecord(payload.pendingContext) ? payload.pendingContext : undefined
  if (pendingContext) {
    pushField(fields, 'pendingPhase', '续跑阶段', formatCharacterPendingPhase(pendingContext.phase))
    pushField(
      fields,
      'lastNeedsInputMessage',
      '上轮补参提示',
      pendingContext.lastNeedsInputMessage
    )
  }

  return {
    title: '输入',
    summary:
      normalizeText(payload.originalUserRequest) || normalizeText(payload.userRequest) || undefined,
    fields,
    rawJson: formatJson(payload)
  }
}

const buildCharacterEditorOutputSection = (
  payload: Record<string, unknown>,
  summary?: string
): TaskExecutionInspectionSection | undefined => {
  if (!isNonEmptyRecord(payload)) {
    return summary?.trim()
      ? {
          title: '输出',
          summary: summary.trim(),
          fields: []
        }
      : undefined
  }

  const protocol = parseSubAgentProtocolPayload(payload, {
    summary: summary?.trim()
  })

  const hasPayload =
    Boolean(protocol.summary || protocol.message || protocol.errorMessage)
  if (!hasPayload) return undefined

  const fields: TaskExecutionInspectionField[] = []
  pushField(fields, 'outcome', '执行结果', formatOutcome(protocol.outcome))
  pushField(fields, 'message', '回报给主 Agent', protocol.message)
  pushField(fields, 'errorMessage', '错误信息', protocol.errorMessage)

  if (isRecord(protocol.pendingContext)) {
    pushField(
      fields,
      'pendingPhase',
      '待补参阶段',
      formatCharacterPendingPhase(protocol.pendingContext.phase)
    )
    pushField(
      fields,
      'lastNeedsInputMessage',
      '待补参提示',
      protocol.pendingContext.lastNeedsInputMessage
    )
  }

  const details = isRecord(protocol.details) ? protocol.details : undefined
  if (details) {
    pushField(fields, 'changedScopes', '变更范围', details.changedScopes)
    pushField(
      fields,
      'appliedTools',
      '调用工具',
      Array.isArray(details.appliedTools)
        ? details.appliedTools.map((item) => {
            if (isRecord(item)) {
              const name = normalizeText(item.name)
              const status = normalizeText(item.status)
              return status ? `${name} (${status})` : name
            }
            return formatValue(item)
          })
        : details.appliedTools
    )
    pushField(fields, 'suggestedFollowUp', '建议下一步', details.suggestedFollowUp)
  }

  return {
    title: '输出',
    summary: protocol.summary || summary?.trim() || undefined,
    fields,
    rawJson: formatJson(payload)
  }
}

const buildExecutionInputSection = (
  executorKind: TaskExecutorKind,
  payload: Record<string, unknown>
): TaskExecutionInspectionSection | undefined => {
  if (executorKind === 'character_editor') {
    return buildCharacterEditorInputSection(payload)
  }
  return buildGenericSection('输入', payload)
}

const buildExecutionOutputSection = (
  executorKind: TaskExecutorKind,
  payload: Record<string, unknown>,
  summary?: string
): TaskExecutionInspectionSection | undefined => {
  if (executorKind === 'character_editor') {
    return buildCharacterEditorOutputSection(payload, summary)
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
