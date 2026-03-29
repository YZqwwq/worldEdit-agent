import { AppDataSource } from '../../database'
import { TaskExecutionRecord } from '../../../share/entity/database/TaskExecutionRecord'
import { TaskRecord } from '../../../share/entity/database/TaskRecord'
import { worldbuildingService } from '../worldbuilding/worldbuildingService'
import { subAgentExecutionQueueService } from '../task/subAgentExecutionQueueService'
import { taskExecutionService } from '../task/taskExecutionService'
import { taskService } from '../task/taskService'
import { taskTraceService } from '../task/taskTraceService'
import type { TaskExecutorKind } from '@share/cache/AItype/states/taskLifecycleState'
import type { WorldEntityDetailPayload } from '@share/cache/worldbuilding/worldbuilding'
import {
  characterEditorPendingContextSchema,
  delegateCharacterEditorInputSchema,
  delegateCharacterEditorOutputSchema,
  delegateCharacterEditorTaskPayloadSchema
} from './ai-utils/tools/character/shared'
import * as z from 'zod'

type CharacterEditorStartInput = z.infer<typeof delegateCharacterEditorInputSchema>
type CharacterEditorStartResult = z.infer<typeof delegateCharacterEditorOutputSchema>
type CharacterEditorTaskPayload = z.infer<typeof delegateCharacterEditorTaskPayloadSchema>

const CANCEL_PATTERNS = [/取消/, /结束/, /算了/, /不用了/, /先这样/, /停止/]
const ACTIVE_TASK_STATUSES = [
  'active',
  'running',
  'pending_main_ack',
  'awaiting_user_input',
  'awaiting_user_confirmation'
] as const

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

const assertNoInFlightExecution = async (taskId: number): Promise<void> => {
  const latestRun = await taskExecutionService.getLatestRun(taskId)
  if (!latestRun) {
    return
  }

  if (['queued', 'dispatching', 'running'].includes(latestRun.status)) {
    throw new Error(
      `Task #${taskId} already has an in-flight execution (#${latestRun.id}, status=${latestRun.status}).`
    )
  }
}

const queueCharacterEditorExecution = async (
  task: TaskRecord,
  payload: CharacterEditorTaskPayload
): Promise<CharacterEditorStartResult> => {
  await assertNoInFlightExecution(task.id)

  const queuedRun = await taskExecutionService.queueRun({
    taskId: task.id,
    executorKind: 'character_editor',
    inputPayload: {}
  })

  const finalPayload = delegateCharacterEditorTaskPayloadSchema.parse({
    ...payload,
    taskId: task.id,
    executionId: queuedRun.id
  })

  await taskExecutionService.updateRunInputPayload(queuedRun.id, finalPayload)
  await taskService.setTaskStatus(task.id, { status: 'running' })
  await subAgentExecutionQueueService.enqueueExecution(queuedRun.id)

  return delegateCharacterEditorOutputSchema.parse({
    accepted: true,
    taskId: task.id,
    executionId: queuedRun.id,
    executorKind: 'character_editor',
    status: 'running',
    target: {
      entityId: finalPayload.entityId,
      characterName: finalPayload.characterName,
      worldId: finalPayload.worldId,
      worldName: finalPayload.worldName
    },
    summary: `人物编辑任务已进入后台执行链：${finalPayload.userRequest.slice(0, 160)}`,
    nextAction: 'await_subagent_result'
  })
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

type ContinuationHandler = (input: {
  task: TaskRecord
  userReply: string
}) => Promise<CharacterEditorStartResult>

const continueCharacterEditorTask: ContinuationHandler = async ({ task, userReply }) => {
  if (CANCEL_PATTERNS.some((pattern) => pattern.test(userReply))) {
    throw new Error('The user reply looks like a cancellation, not a continuation payload.')
  }

  const pendingContextRaw = await taskService.getPendingContext(task.id)
  const parsedPendingContext = characterEditorPendingContextSchema.safeParse(pendingContextRaw)
  if (!parsedPendingContext.success) {
    throw new Error('Active task pendingContext is missing or incompatible with character_editor.')
  }

  const pendingContext = parsedPendingContext.data
  const trimmedInput = userReply.trim()

  await taskTraceService.emit({
    taskId: task.id,
    actor: 'user',
    stage: 'user_replied_to_task',
    message: '主 agent 已通过 continuation service 吸收用户补参。',
    payload: {
      userInput: trimmedInput,
      phase: pendingContext.phase
    }
  })

  const nextCharacterName =
    pendingContext.phase === 'resolve_character' && !pendingContext.targetCharacterName
      ? trimmedInput
      : pendingContext.targetCharacterName
  const nextWorldName =
    pendingContext.phase === 'resolve_world' ? trimmedInput : pendingContext.targetWorldName

  const result = await queueCharacterEditorExecution(task, {
    taskId: task.id,
    executionId: 0,
    worldId: pendingContext.resolvedWorldId,
    worldName: nextWorldName,
    entityId: pendingContext.resolvedEntityId,
    characterName: nextCharacterName,
    userRequest: trimmedInput,
    originalUserRequest: pendingContext.originalUserRequest,
    editingScope: pendingContext.editingScope,
    editingDirection: pendingContext.editingDirection,
    expectedOutcome: pendingContext.expectedOutcome,
    source: pendingContext.source,
    pendingContext
  })

  await taskTraceService.emit({
    taskId: task.id,
    executionId: result.executionId,
    actor: 'main_agent',
    stage: 'main_response_silent',
    message: '主 agent 已通过 continuation service 续跑子 agent execution。',
    payload: {
      phase: pendingContext.phase
    }
  })

  return result
}

const CONTINUATION_HANDLERS: Partial<Record<TaskExecutorKind, ContinuationHandler>> = {
  character_editor: continueCharacterEditorTask
}

class TaskContinuationService {
  async startCharacterEditorTask(input: CharacterEditorStartInput): Promise<CharacterEditorStartResult> {
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

  async continueActiveTask(userReply: string): Promise<CharacterEditorStartResult> {
    const activeTask = await taskService.getActiveTask()
    if (!activeTask || activeTask.status !== 'awaiting_user_input') {
      throw new Error('No active child-agent task is currently waiting for user input.')
    }

    const handler = CONTINUATION_HANDLERS[activeTask.executorKind]
    if (!handler) {
      throw new Error(
        `Current active task #${activeTask.id} does not have a registered continuation handler for ${activeTask.executorKind}.`
      )
    }

    return handler({
      task: activeTask,
      userReply
    })
  }
}

export const taskContinuationService = new TaskContinuationService()
