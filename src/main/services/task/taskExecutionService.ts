import { AppDataSource } from '../../database'
import { TaskExecutionRecord } from '../../../share/entity/database/TaskExecutionRecord'
import type {
  TaskExecutionStatus,
  TaskExecutorKind
} from '@share/cache/AItype/states/taskLifecycleState'

type QueueTaskRunInput = {
  taskId: number
  executorKind: TaskExecutorKind
  inputPayload?: unknown
}

class TaskExecutionService {
  private get repo() {
    return AppDataSource.getRepository(TaskExecutionRecord)
  }

  async getRun(runId: number): Promise<TaskExecutionRecord | null> {
    return this.repo.findOneBy({ id: runId })
  }

  async getLatestRun(taskId: number): Promise<TaskExecutionRecord | null> {
    const runs = await this.repo.find({
      where: { taskId },
      order: { runNumber: 'DESC' },
      take: 1
    })
    return runs[0] ?? null
  }

  async listRunsByStatus(statuses: TaskExecutionStatus[]): Promise<TaskExecutionRecord[]> {
    if (statuses.length === 0) return []

    return this.repo.find({
      where: statuses.map((status) => ({ status })),
      order: { createdAt: 'ASC' }
    })
  }

  async queueRun(input: QueueTaskRunInput): Promise<TaskExecutionRecord> {
    const latestRun = await this.getLatestRun(input.taskId)
    const run = this.repo.create({
      taskId: input.taskId,
      runNumber: latestRun ? latestRun.runNumber + 1 : 1,
      executorKind: input.executorKind,
      status: 'queued',
      inputPayloadJson: JSON.stringify(input.inputPayload ?? {})
    })
    return this.repo.save(run)
  }

  async updateRunInputPayload(runId: number, inputPayload: unknown): Promise<TaskExecutionRecord> {
    const run = await this.repo.findOneBy({ id: runId })
    if (!run) throw new Error(`Task run not found: ${runId}`)

    run.inputPayloadJson = JSON.stringify(inputPayload ?? {})
    return this.repo.save(run)
  }

  async setRunStatus(
    runId: number,
    status: TaskExecutionStatus,
    input?: {
      resultSummary?: string
      reportPayload?: unknown
      errorReport?: string
    }
  ): Promise<TaskExecutionRecord> {
    const run = await this.repo.findOneBy({ id: runId })
    if (!run) throw new Error(`Task run not found: ${runId}`)

    run.status = status
    if ((status === 'dispatching' || status === 'running') && !run.startedAt) {
      run.startedAt = new Date()
    }
    if (
      status === 'awaiting_input' ||
      status === 'reported_done' ||
      status === 'failed' ||
      status === 'cancelled'
    ) {
      run.finishedAt = new Date()
    }
    if (input?.resultSummary) {
      run.resultSummary = input.resultSummary.trim()
    }
    if (input?.reportPayload !== undefined) {
      run.reportPayloadJson = JSON.stringify(input.reportPayload)
    }
    if (input?.errorReport) {
      run.errorReport = input.errorReport.trim()
    }
    return this.repo.save(run)
  }
}

export const taskExecutionService = new TaskExecutionService()
