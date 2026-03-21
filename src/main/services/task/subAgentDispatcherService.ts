import { AppDataSource } from '../../database'
import { TaskRecord } from '../../../share/entity/database/TaskRecord'
import { taskExecutionService } from './taskExecutionService'
import { taskNotificationService } from './taskNotificationService'
import { taskService } from './taskService'
import type { TaskExecutionRecord } from '../../../share/entity/database/TaskExecutionRecord'
import type { TaskExecutorKind } from '@share/cache/AItype/states/taskLifecycleState'
import { delegateCharacterEditorTaskPayloadSchema } from '../aiservice/ai-utils/tools/character/shared'
import { worldbuildingService } from '../worldbuilding/worldbuildingService'

type DispatchResult = {
  type: 'completed' | 'failed' | 'needs_input'
  summary: string
  payload?: Record<string, unknown>
  errorReport?: string
}

type DispatchHandler = (input: {
  task: TaskRecord
  execution: TaskExecutionRecord
  payload: Record<string, unknown>
}) => Promise<DispatchResult>

const parseJsonObject = (input: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(input)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // ignore bad payloads
  }
  return {}
}

const toNotificationType = (
  resultType: DispatchResult['type']
): 'subagent_completed' | 'subagent_failed' | 'subagent_needs_input' => {
  switch (resultType) {
    case 'completed':
      return 'subagent_completed'
    case 'needs_input':
      return 'subagent_needs_input'
    case 'failed':
      return 'subagent_failed'
  }
}

const characterEditorHandler: DispatchHandler = async ({ payload }) => {
  const parsed = delegateCharacterEditorTaskPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      type: 'failed',
      summary: '人物编辑子 agent 收到的任务载荷不合法。',
      payload: {
        message: '人物编辑任务载荷校验失败，无法启动执行。',
        validationError: parsed.error.message
      },
      errorReport: parsed.error.message
    }
  }

  const detail = await worldbuildingService.getEntityDetail(parsed.data.entityId)
  if (!detail) {
    return {
      type: 'failed',
      summary: `目标人物不存在：${parsed.data.entityId}`,
      payload: {
        message: `人物编辑子 agent 无法找到目标人物 ${parsed.data.entityId}。`
      },
      errorReport: `Character not found: ${parsed.data.entityId}`
    }
  }

  return {
    type: 'needs_input',
    summary: `人物编辑子 agent 已收到任务「${detail.entity.name}」，但当前尚未接通写入型人物工具。`,
    payload: {
      message:
        `人物编辑子 agent 已收到对「${detail.entity.name}」的编辑任务，但当前仅具备只读人物查询能力，` +
        '尚未接入 profile / demographic / relation 写入工具，因此无法继续完成本轮编辑。请在补齐写入工具后重试。',
      entityId: detail.entity.id,
      entityName: detail.entity.name
    }
  }
}

const HANDLERS: Partial<Record<TaskExecutorKind, DispatchHandler>> = {
  character_editor: characterEditorHandler
}

class SubAgentDispatcherService {
  private async getTask(taskId: number): Promise<TaskRecord | null> {
    return AppDataSource.getRepository(TaskRecord).findOneBy({ id: taskId })
  }

  async dispatchExecution(executionId: number): Promise<void> {
    const execution = await taskExecutionService.getRun(executionId)
    if (!execution) {
      throw new Error(`Task execution not found: ${executionId}`)
    }

    if (!['queued', 'dispatching'].includes(execution.status)) {
      return
    }

    const task = await this.getTask(execution.taskId)
    if (!task) {
      throw new Error(`Task not found for execution: ${execution.taskId}`)
    }

    await taskExecutionService.setRunStatus(execution.id, 'dispatching')
    await taskExecutionService.setRunStatus(execution.id, 'running')
    await taskService.setTaskStatus(task.id, { status: 'running' })

    const handler = HANDLERS[execution.executorKind]
    const payload = parseJsonObject(execution.inputPayloadJson)

    if (!handler) {
      await taskNotificationService.publishExecutionEvent({
        taskId: task.id,
        executionId: execution.id,
        type: 'subagent_failed',
        summary: `当前没有为执行器 ${execution.executorKind} 注册 dispatcher handler。`,
        payload: {
          message: `当前没有为执行器 ${execution.executorKind} 注册子 agent 处理器，无法继续执行。`
        },
        errorReport: `Missing dispatcher handler for executor ${execution.executorKind}`
      })
      return
    }

    try {
      const result = await handler({ task, execution, payload })
      await taskNotificationService.publishExecutionEvent({
        taskId: task.id,
        executionId: execution.id,
        type: toNotificationType(result.type),
        summary: result.summary,
        payload: {
          summary: result.summary,
          ...(result.payload ?? {})
        },
        errorReport: result.errorReport
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await taskNotificationService.publishExecutionEvent({
        taskId: task.id,
        executionId: execution.id,
        type: 'subagent_failed',
        summary: `执行器 ${execution.executorKind} 在后台运行时抛出异常。`,
        payload: {
          message: `执行器 ${execution.executorKind} 在后台运行时抛出异常：${message}`
        },
        errorReport: message
      })
    }
  }

  async dispatchQueuedExecutions(): Promise<void> {
    const queuedRuns = await taskExecutionService.listRunsByStatus(['queued'])
    await Promise.all(
      queuedRuns.map((run) =>
        this.dispatchExecution(run.id).catch((error) => {
          console.error('Failed to dispatch queued execution:', error)
        })
      )
    )
  }
}

export const subAgentDispatcherService = new SubAgentDispatcherService()
