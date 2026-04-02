import { AppDataSource } from '../../database'
import { TaskRecord } from '../../../share/entity/database/TaskRecord'
import { taskExecutionService } from './taskExecutionService'
import { taskNotificationService } from './taskNotificationService'
import { taskService } from './taskService'
import { taskTraceService } from './taskTraceService'
import { taskNotificationDispatchBridge } from '../aiservice/runtime/queue/taskNotificationDispatchBridge'
import {
  subAgentOutcomeToNotificationType,
} from '@share/cache/AItype/states/taskCommunication'
import { modelConfigService } from '../modelconfig/modelConfigService'
import { getSubAgentRuntimeSpec } from './subAgentRegistry'

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

const normalizeErrorMessage = async (
  error: unknown,
  timeoutMsPromise?: Promise<number>
): Promise<string> => {
  const raw = error instanceof Error ? error.message : String(error)
  if (/^abort$/i.test(raw.trim())) {
    const timeoutMs = await (timeoutMsPromise ?? modelConfigService.getChildAgentTimeoutMs()).catch(
      () => null
    )
    const timeoutLabel =
      typeof timeoutMs === 'number' && timeoutMs > 0
        ? `（当前单次模型调用上限约 ${Math.ceil(timeoutMs / 1000)} 秒）`
        : ''
    return (
      '子 agent 的模型调用被中止了，可能是超时、上游连接中断或主动取消，' +
      `并不一定表示本轮写入失败${timeoutLabel}。`
    )
  }
  return raw
}

const enqueueNotificationSafely = async (
  taskId: number,
  notificationId: number
): Promise<void> => {
  try {
    await taskNotificationDispatchBridge.enqueueTaskNotification({
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

    const registryEntry = getSubAgentRuntimeSpec(execution.executorKind)
    const handler = registryEntry.dispatchHandler
    const payload = parseJsonObject(execution.inputPayloadJson)

    if (!handler) {
      const notification = await taskNotificationService.publishExecutionEvent({
        taskId: task.id,
        executionId: execution.id,
        type: 'subagent_failed',
        summary: `当前没有为执行器 ${execution.executorKind} 注册 dispatcher handler。`,
        payload: registryEntry.protocol.buildPayload({
          outcome: 'failed',
          summary: `当前没有为执行器 ${execution.executorKind} 注册 dispatcher handler。`,
          message: `当前没有为执行器 ${execution.executorKind} 注册子 agent 处理器，无法继续执行。`,
          errorMessage: `Missing dispatcher handler for executor ${execution.executorKind}`,
          details: {
            kind: 'failed',
            errorType: 'runtime_error',
            retryable: registryEntry.retryPolicy.defaultRetryable,
            internalWarning: 'dispatcher handler missing'
          }
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
      const result = await handler({ task, execution, payload, runtime: registryEntry })
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
        payload: registryEntry.protocol.buildPayload({
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
      const message = await normalizeErrorMessage(error, registryEntry.timeoutPolicy.resolveTimeoutMs())
      const notification = await taskNotificationService.publishExecutionEvent({
        taskId: task.id,
        executionId: execution.id,
        type: 'subagent_failed',
        summary: `执行器 ${execution.executorKind} 在后台运行时抛出异常。`,
        payload: registryEntry.protocol.buildPayload({
          outcome: 'failed',
          summary: `执行器 ${execution.executorKind} 在后台运行时抛出异常。`,
          message: `执行器 ${execution.executorKind} 在后台运行时抛出异常：${message}`,
          errorMessage: message,
          details: {
            kind: 'failed',
            errorType: 'runtime_error',
            retryable: registryEntry.retryPolicy.defaultRetryable
          }
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
}

export const subAgentDispatcherService = new SubAgentDispatcherService()
