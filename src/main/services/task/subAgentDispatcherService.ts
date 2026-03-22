import { AppDataSource } from '../../database'
import { TaskRecord } from '../../../share/entity/database/TaskRecord'
import { taskExecutionService } from './taskExecutionService'
import { taskNotificationService } from './taskNotificationService'
import { taskService } from './taskService'
import { taskTraceService } from './taskTraceService'
import { mainAgentDispatchService } from '../middlelayer/event-in-wait/mainAgentDispatchService'
import type { TaskExecutionRecord } from '../../../share/entity/database/TaskExecutionRecord'
import type { TaskExecutorKind } from '@share/cache/AItype/states/taskLifecycleState'
import { runCharacterEditorExecution } from '../aiservice/child-agent-system/characterEditorExecution'

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

const normalizeErrorMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error)
  if (/^abort$/i.test(raw.trim())) {
    return '子 agent 的模型调用被中止了，通常表示本轮后台执行超时（当前 character_editor 单次模型调用上限为 30 秒）。'
  }
  return raw
}

const enqueueNotificationSafely = async (
  taskId: number,
  notificationId: number
): Promise<void> => {
  try {
    await mainAgentDispatchService.enqueueTaskNotification({
      taskId,
      notificationId
    })
  } catch (error) {
    console.error(
      `Failed to enqueue notification #${notificationId} for task #${taskId}:`,
      error
    )
  }
}

const characterEditorHandler: DispatchHandler = async ({ payload }) => {
  try {
    const result = await runCharacterEditorExecution(payload)

    return {
      type: result.outcome,
      summary: result.summary,
      payload: {
        message: result.userFacingMessage,
        changedScopes: result.changedScopes,
        appliedTools: result.appliedTools,
        suggestedFollowUp: result.suggestedFollowUp,
        pendingContext: result.pendingContext
      },
      errorReport: result.outcome === 'failed' ? result.userFacingMessage : undefined
    }
  } catch (error) {
    return {
      type: 'failed',
      summary: '人物编辑子 agent 在执行过程中抛出异常。',
      payload: {
        message: normalizeErrorMessage(error)
      },
      errorReport: normalizeErrorMessage(error)
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
    await taskTraceService.emit({
      taskId: task.id,
      executionId: execution.id,
      actor: 'subagent',
      stage: 'subagent_activated',
      message: `子 agent ${execution.executorKind} 已激活并开始执行。`
    })

    const handler = HANDLERS[execution.executorKind]
    const payload = parseJsonObject(execution.inputPayloadJson)

    if (!handler) {
      const notification = await taskNotificationService.publishExecutionEvent({
        taskId: task.id,
        executionId: execution.id,
        type: 'subagent_failed',
        summary: `当前没有为执行器 ${execution.executorKind} 注册 dispatcher handler。`,
        payload: {
          message: `当前没有为执行器 ${execution.executorKind} 注册子 agent 处理器，无法继续执行。`
        },
        errorReport: `Missing dispatcher handler for executor ${execution.executorKind}`
      })
      await taskTraceService.emit({
        taskId: task.id,
        executionId: execution.id,
        actor: 'subagent',
        stage: 'subagent_notify_main',
        message: '子 agent 因缺少 handler 无法继续，已向主 agent 发起响应请求。',
        payload: {
          outcome: 'failed',
          reason: 'missing_handler'
        }
      })
      await enqueueNotificationSafely(task.id, notification.id)
      return
    }

    try {
      const result = await handler({ task, execution, payload })
      await taskService.setPendingContext(
        task.id,
        result.type === 'needs_input' &&
          result.payload?.pendingContext &&
          typeof result.payload.pendingContext === 'object' &&
          !Array.isArray(result.payload.pendingContext)
          ? (result.payload.pendingContext as Record<string, unknown>)
          : null
      )
      const notification = await taskNotificationService.publishExecutionEvent({
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
      await taskTraceService.emit({
        taskId: task.id,
        executionId: execution.id,
        actor: 'subagent',
        stage: 'subagent_notify_main',
        message: '子 agent 已结束本轮 execution，并向主 agent 发起响应请求。',
        payload: {
          outcome: result.type,
          summary: result.summary
        }
      })
      await enqueueNotificationSafely(task.id, notification.id)
    } catch (error) {
      const message = normalizeErrorMessage(error)
      const notification = await taskNotificationService.publishExecutionEvent({
        taskId: task.id,
        executionId: execution.id,
        type: 'subagent_failed',
        summary: `执行器 ${execution.executorKind} 在后台运行时抛出异常。`,
        payload: {
          message: `执行器 ${execution.executorKind} 在后台运行时抛出异常：${message}`
        },
        errorReport: message
      })
      await taskTraceService.emit({
        taskId: task.id,
        executionId: execution.id,
        actor: 'subagent',
        stage: 'subagent_notify_main',
        message: '子 agent 在异常结束后，已向主 agent 发起响应请求。',
        payload: {
          outcome: 'failed',
          error: message
        }
      })
      await enqueueNotificationSafely(task.id, notification.id)
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
