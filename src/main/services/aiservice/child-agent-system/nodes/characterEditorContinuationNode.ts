import type { TaskRecord } from '../../../../../share/entity/database/TaskRecord'
import { subAgentExecutionQueueService } from '../../../task/queue/subAgentExecutionQueueService'
import { taskExecutionService } from '../../../task/taskExecutionService'
import { taskService } from '../../../task/taskService'
import { taskTraceService } from '../../../task/taskTraceService'
import {
  characterEditorPendingContextSchema,
  delegateCharacterEditorTaskPayloadSchema
} from '../../ai-utils/tools/character/shared'
import { continueActiveChildAgentOutputSchema } from '../../ai-utils/tools/task/shared'
import * as z from 'zod'

type CharacterEditorTaskPayload = z.infer<typeof delegateCharacterEditorTaskPayloadSchema>
export type CharacterEditorContinuationResult = z.infer<typeof continueActiveChildAgentOutputSchema>

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
): Promise<CharacterEditorContinuationResult> => {
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

  return continueActiveChildAgentOutputSchema.parse({
    accepted: true,
    taskId: task.id,
    executionId: queuedRun.id,
    executorKind: 'character_editor',
    status: 'running',
    summary: `人物编辑任务已进入后台执行链：${finalPayload.userRequest.slice(0, 160)}`,
    nextAction: 'await_subagent_result'
  })
}

export const continueCharacterEditorTask = async (input: {
  task: TaskRecord
  userReply: string
}): Promise<CharacterEditorContinuationResult> => {
  const pendingContextRaw = await taskService.getPendingContext(input.task.id)
  const parsedPendingContext = characterEditorPendingContextSchema.safeParse(pendingContextRaw)
  if (!parsedPendingContext.success) {
    throw new Error('Active task pendingContext is missing or incompatible with character_editor.')
  }

  const pendingContext = parsedPendingContext.data
  const trimmedInput = input.userReply.trim()

  await taskTraceService.emit({
    taskId: input.task.id,
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

  const result = await queueCharacterEditorExecution(input.task, {
    taskId: input.task.id,
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
    taskId: input.task.id,
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
