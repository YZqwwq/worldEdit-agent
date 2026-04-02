import { AppDataSource } from '../../../database'
import { TaskExecutionRecord } from '@share/entity/database/TaskExecutionRecord'
import { TaskRecord } from '@share/entity/database/TaskRecord'
import type { WorldEntityDetailPayload } from '@share/cache/worldbuilding/worldbuilding'
import type {
  TaskExecutionInspectionField,
  TaskExecutionInspectionSection
} from '@share/cache/AItype/states/taskExecutionInspection'
import type { SubAgentProtocolDetails } from '@share/cache/AItype/states/taskCommunication'
import { worldbuildingService } from '../../worldbuilding/worldbuildingService'
import { subAgentExecutionQueueService } from '../../task/queue/subAgentExecutionQueueService'
import {
  delegateCharacterEditorInputSchema,
  delegateCharacterEditorOutputSchema,
  delegateCharacterEditorTaskPayloadSchema
} from '../ai-utils/tools/character/shared'
import * as z from 'zod'

type CharacterEditorStartInput = z.infer<typeof delegateCharacterEditorInputSchema>
type CharacterEditorStartResult = z.infer<typeof delegateCharacterEditorOutputSchema>
type CharacterEditorTaskPayload = z.infer<typeof delegateCharacterEditorTaskPayloadSchema>

const ACTIVE_TASK_STATUSES = [
  'active',
  'running',
  'pending_main_ack',
  'awaiting_user_input',
  'awaiting_user_confirmation'
] as const

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

const formatAppliedTools = (details: SubAgentProtocolDetails): string[] | undefined => {
  if (!('appliedTools' in details) || !Array.isArray(details.appliedTools)) {
    return undefined
  }
  const normalized = details.appliedTools.map((item) =>
    item.status ? `${item.name} (${item.status})` : item.name
  )
  return normalized.length > 0 ? normalized : undefined
}

const appendDetailsFields = (
  fields: TaskExecutionInspectionField[],
  details?: SubAgentProtocolDetails
): void => {
  if (!details) {
    return
  }

  pushField(fields, 'detailsKind', '详情类型', details.kind)

  switch (details.kind) {
    case 'completed':
      pushField(fields, 'changedScopes', '变更范围', details.changedScopes)
      pushField(fields, 'appliedTools', '调用工具', formatAppliedTools(details))
      pushField(fields, 'internalWarning', '内部警告', details.internalWarning)
      pushField(fields, 'suggestedFollowUp', '建议下一步', details.suggestedFollowUp)
      return
    case 'needs_input':
      pushField(fields, 'pendingPhase', '待补参阶段', formatCharacterPendingPhase(details.phase))
      pushField(fields, 'missingFields', '缺失字段', details.missingFields)
      pushField(fields, 'suggestedPrompt', '建议追问', details.suggestedPrompt)
      pushField(fields, 'appliedTools', '调用工具', formatAppliedTools(details))
      return
    case 'failed':
      pushField(fields, 'errorType', '错误类型', details.errorType)
      pushField(fields, 'retryable', '可重试', details.retryable)
      pushField(fields, 'internalWarning', '内部警告', details.internalWarning)
      pushField(fields, 'appliedTools', '调用工具', formatAppliedTools(details))
      return
    case 'cancelled':
      pushField(fields, 'cancelReason', '取消原因', details.reason)
      return
  }
}

const inferEditingScopeFromDirection = (
  editingDirection?: 'character_deeds' | 'character_profile' | 'demographic_facts'
): Array<'profile' | 'demographic'> | undefined => {
  if (editingDirection === 'character_deeds' || editingDirection === 'character_profile') {
    return ['profile']
  }
  if (editingDirection === 'demographic_facts') {
    return ['demographic']
  }
  return undefined
}

const buildTaskSummary = (input: {
  characterName: string
  userRequest: string
  editingDirection?: 'character_deeds' | 'character_profile' | 'demographic_facts'
  expectedOutcome?: string
}): string => {
  const requestSummary = input.userRequest.trim().slice(0, 180)
  const expected = input.expectedOutcome?.trim()
  const directionLabel =
    input.editingDirection === 'character_deeds'
      ? '人物事迹'
      : input.editingDirection === 'demographic_facts'
        ? '基础属性'
        : input.editingDirection === 'character_profile'
          ? '人物档案'
          : ''
  return expected
    ? `编辑人物「${input.characterName}」${directionLabel ? `（${directionLabel}）` : ''}：${expected}`
    : `编辑人物「${input.characterName}」${directionLabel ? `（${directionLabel}）` : ''}：${requestSummary}`
}

const resolveCharacterEditorTarget = async (input: CharacterEditorStartInput): Promise<{
  detail: WorldEntityDetailPayload | null
  resolvedWorldId?: string
  resolvedWorldName?: string
  resolvedEntityId?: string
  resolvedCharacterName?: string
}> => {
  let detail: WorldEntityDetailPayload | null = null
  if (input.entityId) {
    detail = await worldbuildingService.getEntityDetail(input.entityId)
    if (!detail) {
      throw new Error(`Character not found: ${input.entityId}`)
    }
    if (input.worldId && detail.entity.worldId !== input.worldId) {
      throw new Error(`Entity ${input.entityId} does not belong to world ${input.worldId}`)
    }
    if (detail.entity.type !== 'character') {
      throw new Error(`Entity ${input.entityId} is not a character`)
    }

    return {
      detail,
      resolvedWorldId: input.worldId || detail.entity.worldId,
      resolvedWorldName: input.worldName,
      resolvedEntityId: detail.entity.id,
      resolvedCharacterName: input.characterName || detail.entity.name
    }
  }

  let resolvedWorldId = input.worldId
  let resolvedWorldName = input.worldName

  if (!resolvedWorldId && input.worldName) {
    const exactWorlds = (await worldbuildingService.listWorlds()).filter(
      (world) => world.name.trim().toLowerCase() === input.worldName?.trim().toLowerCase()
    )
    if (exactWorlds.length === 1) {
      resolvedWorldId = exactWorlds[0].id
      resolvedWorldName = exactWorlds[0].name
    }
  }

  let resolvedEntityId: string | undefined
  let resolvedCharacterName = input.characterName

  if (input.characterName) {
    const normalizedCharacterName = input.characterName.trim().toLowerCase()
    const matches = await worldbuildingService.searchCharacterEntities({
      worldId: resolvedWorldId,
      name: input.characterName
    })

    const exactMatches = matches.filter(
      (match) => match.entity.name.trim().toLowerCase() === normalizedCharacterName
    )

    if (exactMatches.length === 1) {
      const match = exactMatches[0]
      resolvedWorldId = resolvedWorldId || match.worldId
      resolvedWorldName = resolvedWorldName || match.worldName
      resolvedEntityId = match.entity.id
      resolvedCharacterName = match.entity.name
      detail = await worldbuildingService.getEntityDetail(match.entity.id)
    }
  }

  return {
    detail,
    resolvedWorldId,
    resolvedWorldName,
    resolvedEntityId,
    resolvedCharacterName
  }
}

const createCharacterEditorTaskWithExecution = async (input: {
  title: string
  goal: string
  summary: string
  payload: Omit<CharacterEditorTaskPayload, 'taskId' | 'executionId'>
}): Promise<CharacterEditorStartResult> => {
  const created = await AppDataSource.transaction(async (manager) => {
    const taskRepo = manager.getRepository(TaskRecord)
    const executionRepo = manager.getRepository(TaskExecutionRecord)

    const existingActive = await taskRepo.find({
      where: ACTIVE_TASK_STATUSES.map((status) => ({ status })),
      order: { updatedAt: 'DESC' },
      take: 1
    })
    if (existingActive[0]) {
      throw new Error(
        `Active task #${existingActive[0].id} (${existingActive[0].title}) already exists. Continue or close it before delegating a new character task.`
      )
    }

    const task = taskRepo.create({
      title: input.title,
      goal: input.goal,
      summary: input.summary,
      executorKind: 'character_editor',
      status: 'running'
    })
    const savedTask = await taskRepo.save(task)

    const execution = executionRepo.create({
      taskId: savedTask.id,
      runNumber: 1,
      executorKind: 'character_editor',
      status: 'queued',
      inputPayloadJson: '{}'
    })
    const savedExecution = await executionRepo.save(execution)

    const finalPayload = delegateCharacterEditorTaskPayloadSchema.parse({
      ...input.payload,
      taskId: savedTask.id,
      executionId: savedExecution.id
    })

    savedExecution.inputPayloadJson = JSON.stringify(finalPayload)
    await executionRepo.save(savedExecution)

    return {
      taskId: savedTask.id,
      executionId: savedExecution.id,
      finalPayload
    }
  })

  await subAgentExecutionQueueService.enqueueExecution(created.executionId)

  return delegateCharacterEditorOutputSchema.parse({
    accepted: true,
    taskId: created.taskId,
    executionId: created.executionId,
    executorKind: 'character_editor',
    status: 'running',
    target: {
      entityId: created.finalPayload.entityId,
      characterName: created.finalPayload.characterName,
      worldId: created.finalPayload.worldId,
      worldName: created.finalPayload.worldName
    },
    summary: `人物编辑任务已进入后台执行链：${created.finalPayload.userRequest.slice(0, 160)}`,
    nextAction: 'await_subagent_result'
  })
}

export const startCharacterEditorTask = async (
  rawInput: unknown
): Promise<CharacterEditorStartResult> => {
  const input = delegateCharacterEditorInputSchema.parse(rawInput)
  const resolvedTarget = await resolveCharacterEditorTarget(input)
  const detail = resolvedTarget.detail

  const mergedEditingDirection = input.editingDirection
  const mergedEditingScope =
    input.editingScope || inferEditingScopeFromDirection(mergedEditingDirection)

  if (!resolvedTarget.resolvedCharacterName && !resolvedTarget.resolvedEntityId) {
    throw new Error('character_editor requires either entityId or characterName.')
  }

  return createCharacterEditorTaskWithExecution({
    title: `编辑人物：${resolvedTarget.resolvedCharacterName || detail?.entity.name || '待解析人物'}`,
    goal: input.expectedOutcome?.trim() || input.userRequest.trim(),
    summary: buildTaskSummary({
      characterName:
        resolvedTarget.resolvedCharacterName || detail?.entity.name || '待解析人物',
      userRequest: input.userRequest,
      editingDirection: input.editingDirection,
      expectedOutcome: input.expectedOutcome
    }),
    payload: {
      worldId: resolvedTarget.resolvedWorldId || detail?.entity.worldId,
      worldName: resolvedTarget.resolvedWorldName || input.worldName,
      entityId: resolvedTarget.resolvedEntityId || detail?.entity.id,
      characterName: resolvedTarget.resolvedCharacterName || detail?.entity.name,
      userRequest: input.userRequest,
      originalUserRequest: input.userRequest,
      editingScope: mergedEditingScope,
      editingDirection: mergedEditingDirection,
      expectedOutcome: input.expectedOutcome,
      source: input.source
    }
  })
}

export const buildCharacterEditorInspectionInputSection = (
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
    pushField(fields, 'lastNeedsInputMessage', '上轮补参提示', pendingContext.lastNeedsInputMessage)
  }

  return {
    title: '输入',
    summary:
      normalizeText(payload.originalUserRequest) || normalizeText(payload.userRequest) || undefined,
    fields,
    rawJson: formatJson(payload)
  }
}

export const buildCharacterEditorInspectionOutputSection = (input: {
  payload: Record<string, unknown>
  summary?: string
  parsePayload: (
    payload: Record<string, unknown>,
    fallback?: {
      summary?: string
    }
  ) => {
    outcome: string
    summary: string
    message: string
    errorMessage?: string
    pendingContext?: Record<string, unknown>
    details?: SubAgentProtocolDetails
  }
}): TaskExecutionInspectionSection | undefined => {
  if (!isNonEmptyRecord(input.payload)) {
    return input.summary?.trim()
      ? {
          title: '输出',
          summary: input.summary.trim(),
          fields: []
        }
      : undefined
  }

  const protocol = input.parsePayload(input.payload, {
    summary: input.summary?.trim()
  })

  const hasPayload = Boolean(protocol.summary || protocol.message || protocol.errorMessage)
  if (!hasPayload) return undefined

  const fields: TaskExecutionInspectionField[] = []
  pushField(fields, 'outcome', '执行结果', formatOutcome(protocol.outcome))
  pushField(fields, 'message', '回报给主 Agent', protocol.message)
  pushField(fields, 'errorMessage', '错误信息', protocol.errorMessage)

  if (isRecord(protocol.pendingContext)) {
    pushField(fields, 'pendingPhase', '待补参阶段', formatCharacterPendingPhase(protocol.pendingContext.phase))
    pushField(fields, 'lastNeedsInputMessage', '待补参提示', protocol.pendingContext.lastNeedsInputMessage)
  }

  appendDetailsFields(fields, protocol.details)

  return {
    title: '输出',
    summary: protocol.summary || input.summary?.trim() || undefined,
    fields,
    rawJson: formatJson(input.payload)
  }
}

export const getCharacterEditorMissingFields = (
  pendingContext: Record<string, unknown>
): string[] => {
  const phase = typeof pendingContext.phase === 'string' ? pendingContext.phase : ''
  if (phase === 'resolve_world') {
    return ['worldName']
  }
  if (phase === 'resolve_character') {
    return ['characterName']
  }
  return []
}

export const getCharacterEditorRecommendedNextTool = (input: {
  taskStatus: string
  delegateToolName: string
}): string | undefined => {
  if (input.taskStatus === 'awaiting_user_input') {
    return 'continue_active_child_agent'
  }
  if (input.taskStatus === 'active') {
    return input.delegateToolName
  }
  return undefined
}
