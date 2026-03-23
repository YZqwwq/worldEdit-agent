import { AppDataSource } from '../../database'
import { TaskRecord } from '../../../share/entity/database/TaskRecord'
import { taskExecutionService } from './taskExecutionService'
import { taskNotificationService } from './taskNotificationService'
import { taskService } from './taskService'
import { taskTraceService } from './taskTraceService'
import type { TaskExecutionRecord } from '../../../share/entity/database/TaskExecutionRecord'
import type { TaskExecutorKind } from '@share/cache/AItype/states/taskLifecycleState'
import {
  buildSubAgentProtocolPayload,
  subAgentOutcomeToNotificationType,
  type SubAgentOutcome
} from '@share/cache/AItype/states/taskCommunication'
import { runCharacterEditorExecution } from '../aiservice/child-agent-system/characterEditorExecution'
import { mainAgentEntryService } from '../aiservice/runtime/mainAgentEntryService'

type DispatchResult = {
  outcome: SubAgentOutcome
  summary: string
  userMessage: string
  pendingContext?: Record<string, unknown>
  details?: Record<string, unknown>
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
    await mainAgentEntryService.enqueueTaskNotification({
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
      outcome: result.outcome,
      summary: result.summary,
      userMessage: result.userFacingMessage,
      pendingContext: result.pendingContext,
      details: {
        changedScopes: result.changedScopes,
        appliedTools: result.appliedTools,
        suggestedFollowUp: result.suggestedFollowUp
      },
      errorReport: result.outcome === 'failed' ? result.userFacingMessage : undefined
    }
  } catch (error) {
    return {
      outcome: 'failed',
      summary: '人物编辑子 agent 在执行过程中抛出异常。',
      userMessage: normalizeErrorMessage(error),
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
        payload: buildSubAgentProtocolPayload({
          outcome: 'failed',
          summary: `当前没有为执行器 ${execution.executorKind} 注册 dispatcher handler。`,
          message: `当前没有为执行器 ${execution.executorKind} 注册子 agent 处理器，无法继续执行。`,
          errorMessage: `Missing dispatcher handler for executor ${execution.executorKind}`
        }),
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
        result.outcome === 'needs_input' &&
          result.pendingContext &&
          typeof result.pendingContext === 'object' &&
          !Array.isArray(result.pendingContext)
          ? result.pendingContext
          : null
      )
      const notification = await taskNotificationService.publishExecutionEvent({
        taskId: task.id,
        executionId: execution.id,
        type: subAgentOutcomeToNotificationType(result.outcome),
        summary: result.summary,
        payload: buildSubAgentProtocolPayload({
          outcome: result.outcome,
          summary: result.summary,
          message: result.userMessage,
          pendingContext: result.pendingContext,
          errorMessage: result.errorReport,
          details: result.details
        }),
        errorReport: result.errorReport
      })
      await taskTraceService.emit({
        taskId: task.id,
        executionId: execution.id,
        actor: 'subagent',
        stage: 'subagent_notify_main',
        message: '子 agent 已结束本轮 execution，并向主 agent 发起响应请求。',
        payload: {
          outcome: result.outcome,
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
        payload: buildSubAgentProtocolPayload({
          outcome: 'failed',
          summary: `执行器 ${execution.executorKind} 在后台运行时抛出异常。`,
          message: `执行器 ${execution.executorKind} 在后台运行时抛出异常：${message}`,
          errorMessage: message
        }),
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
