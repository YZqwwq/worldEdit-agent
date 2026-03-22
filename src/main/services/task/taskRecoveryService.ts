import { AppDataSource } from '../../database'
import { TaskNotificationRecord } from '../../../share/entity/database/TaskNotificationRecord'
import { TaskRecord } from '../../../share/entity/database/TaskRecord'
import { mainAgentDispatchService } from '../middlelayer/event-in-wait/mainAgentDispatchService'
import { taskExecutionService } from './taskExecutionService'
import { taskNotificationService } from './taskNotificationService'
import { taskTraceService } from './taskTraceService'

class TaskRecoveryService {
  private get notificationRepo() {
    return AppDataSource.getRepository(TaskNotificationRecord)
  }

  private get taskRepo() {
    return AppDataSource.getRepository(TaskRecord)
  }

  async recoverInterruptedExecutions(): Promise<void> {
    const interruptedRuns = await taskExecutionService.listRunsByStatus(['dispatching', 'running'])

    for (const run of interruptedRuns) {
      const existingNotification = await this.notificationRepo.findOne({
        where: { executionId: run.id },
        order: { id: 'DESC' }
      })
      if (existingNotification) {
        continue
      }

      const task = await this.taskRepo.findOneBy({ id: run.taskId })
      if (!task) {
        continue
      }

      await taskNotificationService.publishExecutionEvent({
        taskId: task.id,
        executionId: run.id,
        type: 'subagent_failed',
        summary: `执行器 ${run.executorKind} 在应用重启前中断，当前已转入人工恢复流程。`,
        payload: {
          message:
            `任务「${task.title}」对应的子 agent 在应用关闭或重启时被中断。` +
            ' 当前不会自动重放该 execution，以避免重复写入；请向用户说明情况，并由主 agent 决定是否重试。'
        },
        errorReport: `Execution ${run.id} was interrupted before completion and was reconciled during startup.`
      })

      await taskTraceService.emit({
        taskId: task.id,
        executionId: run.id,
        actor: 'system',
        stage: 'main_response_silent',
        message: '系统在启动恢复时检测到中断 execution，已转换为失败通知等待主 agent 处理。',
        payload: {
          executionStatus: run.status,
          executorKind: run.executorKind
        }
      })
    }
  }

  async enqueuePendingNotifications(): Promise<void> {
    const pendingNotifications = await this.notificationRepo.find({
      where: { status: 'pending' },
      order: { createdAt: 'ASC', id: 'ASC' }
    })

    for (const notification of pendingNotifications) {
      await mainAgentDispatchService.enqueueTaskNotification({
        taskId: notification.taskId,
        notificationId: notification.id
      })
    }
  }
}

export const taskRecoveryService = new TaskRecoveryService()
