import { AppDataSource } from '../../database'
import { TaskTraceRecord } from '../../../share/entity/database/TaskTraceRecord'
import type {
  TaskTraceActor,
  TaskTraceSnapshot,
  TaskTraceStage
} from '@share/cache/AItype/states/taskLifecycleState'

type EmitTaskTraceInput = {
  taskId: number
  executionId?: number | null
  actor: TaskTraceActor
  stage: TaskTraceStage
  message: string
  dedupeKey?: string
  payload?: Record<string, unknown>
}

const toSnapshot = (trace: TaskTraceRecord): TaskTraceSnapshot => ({
  id: trace.id,
  taskId: trace.taskId,
  executionId: trace.executionId ?? undefined,
  actor: trace.actor,
  stage: trace.stage,
  message: trace.message,
  createdAt: trace.createdAt.toISOString()
})

class TaskTraceService {
  private get repo() {
    return AppDataSource.getRepository(TaskTraceRecord)
  }

  async emit(input: EmitTaskTraceInput): Promise<TaskTraceRecord> {
    const dedupeKey = input.dedupeKey?.trim()
    if (dedupeKey) {
      const existing = await this.repo.findOne({
        where: { dedupeKey },
        order: { id: 'DESC' }
      })
      if (existing) {
        return existing
      }
    }

    const trace = this.repo.create({
      taskId: input.taskId,
      executionId: input.executionId ?? null,
      actor: input.actor,
      stage: input.stage,
      message: input.message.trim(),
      dedupeKey: dedupeKey || null,
      payloadJson: JSON.stringify(input.payload ?? {})
    })
    return this.repo.save(trace)
  }

  async listTaskTraces(taskId: number, limit = 20): Promise<TaskTraceSnapshot[]> {
    const rows = await this.repo.find({
      where: { taskId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit
    })
    return rows.reverse().map(toSnapshot)
  }

  async clearAll(): Promise<void> {
    await this.repo.clear()
  }
}

export const taskTraceService = new TaskTraceService()
