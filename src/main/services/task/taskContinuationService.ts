import { AppDataSource } from '../../database'
import { TaskExecutionRecord } from '../../../share/entity/database/TaskExecutionRecord'
import { TaskRecord } from '../../../share/entity/database/TaskRecord'
import { worldbuildingService } from '../worldbuilding/worldbuildingService'
import { taskService } from './taskService'
import type { WorldEntityDetailPayload } from '@share/cache/worldbuilding/worldbuilding'
import {
  delegateCharacterEditorInputSchema,
  delegateCharacterEditorOutputSchema,
  delegateCharacterEditorTaskPayloadSchema
} from '../aiservice/ai-utils/tools/character/shared'
import { continueActiveChildAgentOutputSchema } from '../aiservice/ai-utils/tools/task/shared'
import * as z from 'zod'
import { subAgentExecutionQueueService } from './queue/subAgentExecutionQueueService'
import { subAgentRegistry } from './subAgentRegistry'
import { awaitingUserInputNode } from '../aiservice/runtime/nodes/awaitingUserInputNode'

type CharacterEditorStartInput = z.infer<typeof delegateCharacterEditorInputSchema>
type CharacterEditorStartResult = z.infer<typeof delegateCharacterEditorOutputSchema>
type CharacterEditorTaskPayload = z.infer<typeof delegateCharacterEditorTaskPayloadSchema>
type ContinueActiveChildAgentResult = z.infer<typeof continueActiveChildAgentOutputSchema>

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

  async continueActiveTask(
    userReply: string,
    options?: { skipIntentCheck?: boolean }
  ): Promise<ContinueActiveChildAgentResult> {
    const activeTask = await taskService.getActiveTask()
    if (!activeTask || activeTask.status !== 'awaiting_user_input') {
      throw new Error('No active child-agent task is currently waiting for user input.')
    }

    if (!options?.skipIntentCheck) {
      const pendingContext = await taskService.getPendingContext(activeTask.id)
      const decision = await awaitingUserInputNode.resolve({
        userInput: userReply,
        activeTask: {
          id: activeTask.id,
          title: activeTask.title,
          status: activeTask.status,
          executorKind: activeTask.executorKind
        },
        pendingContext
      })

      if (decision.type === 'cancel_task') {
        throw new Error('The latest user reply looks like a cancellation request, not continuation input.')
      }
      if (decision.type === 'ask_status') {
        throw new Error('The latest user reply is asking about task status, not supplying continuation input.')
      }
      if (decision.type !== 'continue_task') {
        throw new Error('The latest user reply does not yet provide enough information to safely resume the child-agent task.')
      }
    }

    const handler = subAgentRegistry[activeTask.executorKind].continuationHandler
    if (!handler) {
      throw new Error(
        `Current active task #${activeTask.id} does not have a registered continuation handler for ${activeTask.executorKind}.`
      )
    }

    const result = await handler({
      task: activeTask,
      userReply
    })

    return continueActiveChildAgentOutputSchema.parse({
      accepted: true,
      taskId: result.taskId,
      executionId: result.executionId,
      executorKind: activeTask.executorKind,
      status: 'running',
      summary: result.summary,
      nextAction: 'await_subagent_result'
    })
  }
}

export const taskContinuationService = new TaskContinuationService()
