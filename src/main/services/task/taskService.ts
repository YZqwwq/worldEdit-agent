import { AppDataSource } from '../../database'
import { TaskRecord } from '../../../share/entity/database/TaskRecord'
import type {
  ActiveTaskSnapshot,
  TaskExecutionSnapshot,
  TaskExecutorKind,
  TaskMonitorSnapshot,
  TaskStatus
} from '@share/cache/AItype/states/taskLifecycleState'
import { assertTaskStatusTransition } from '@share/cache/AItype/states/taskLifecycleRules'
import { taskExecutionService } from './taskExecutionService'
import { taskTraceService } from './taskTraceService'
import { mainAgentDispatchService } from '../middlelayer/event-in-wait/mainAgentDispatchService'

type CreateTaskInput = {
  title: string
  goal: string
  summary?: string
  executorKind?: TaskExecutorKind
  createdFromMessageId?: number | null
  lastRelatedMessageId?: number | null
}

type UpdateTaskStatusInput = {
  status: TaskStatus
  closureSummary?: string
}

const ACTIVE_TASK_STATUSES: TaskStatus[] = [
  'active',
  'running',
  'pending_main_ack',
  'awaiting_user_input',
  'awaiting_user_confirmation'
]

const parsePendingContext = (input: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(input)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // ignore bad persisted payloads
  }
  return {}
}

const toSnapshot = (task: TaskRecord): ActiveTaskSnapshot => ({
  id: task.id,
  title: task.title,
  goal: task.goal,
  summary: task.summary,
  status: task.status,
  executorKind: task.executorKind,
  progressNotes: task.progressNotes || undefined
})

const toExecutionSnapshot = (run: {
  id: number
  taskId: number
  runNumber: number
  executorKind: TaskExecutorKind
  status: string
  resultSummary: string
  errorReport: string
  createdAt: Date
  startedAt: Date | null
  finishedAt: Date | null
}): TaskExecutionSnapshot => ({
  id: run.id,
  taskId: run.taskId,
  runNumber: run.runNumber,
  executorKind: run.executorKind,
  status: run.status as TaskExecutionSnapshot['status'],
  resultSummary: run.resultSummary,
  errorReport: run.errorReport || undefined,
  createdAt: run.createdAt.toISOString(),
  startedAt: run.startedAt?.toISOString(),
  finishedAt: run.finishedAt?.toISOString()
})

class TaskService {
  private get repo() {
    return AppDataSource.getRepository(TaskRecord)
  }

  async getActiveTask(): Promise<TaskRecord | null> {
    const tasks = await this.repo.find({
      where: ACTIVE_TASK_STATUSES.map((status) => ({ status })),
      order: { updatedAt: 'DESC' },
      take: 1
    })
    return tasks[0] ?? null
  }

  async getActiveTaskSnapshot(): Promise<ActiveTaskSnapshot | undefined> {
    const activeTask = await this.getActiveTask()
    return activeTask ? toSnapshot(activeTask) : undefined
  }

  async getTaskMonitorSnapshot(): Promise<TaskMonitorSnapshot> {
    const activeTask = await this.getActiveTask()
    if (!activeTask) {
      return {
        activeTask: undefined,
        executions: [],
        traces: [],
        dispatch: mainAgentDispatchService.getSnapshot()
      }
    }

    const runs = await taskExecutionService.listRunsForTask(activeTask.id, 6)
    const traces = await taskTraceService.listTaskTraces(activeTask.id, 24)
    return {
      activeTask: toSnapshot(activeTask),
      executions: runs.map((run) => toExecutionSnapshot(run)),
      traces,
      dispatch: mainAgentDispatchService.getSnapshot()
    }
  }

  async createTask(input: CreateTaskInput): Promise<TaskRecord> {
    const existing = await this.getActiveTask()
    if (existing) {
      throw new Error(`Active task already exists: #${existing.id} ${existing.title}`)
    }

    const task = this.repo.create({
      title: input.title.trim(),
      goal: input.goal.trim(),
      summary: input.summary?.trim() || input.goal.trim(),
      executorKind: input.executorKind || 'general_task_worker',
      status: 'active',
      createdFromMessageId: input.createdFromMessageId ?? null,
      lastRelatedMessageId: input.lastRelatedMessageId ?? null
    })
    return this.repo.save(task)
  }

  async updateTaskSummary(taskId: number, summary: string, progressNotes?: string): Promise<TaskRecord> {
    const task = await this.repo.findOneBy({ id: taskId })
    if (!task) throw new Error(`Task not found: ${taskId}`)

    task.summary = summary.trim()
    if (typeof progressNotes === 'string') {
      task.progressNotes = progressNotes.trim()
    }
    return this.repo.save(task)
  }

  async appendUserInstruction(taskId: number, instruction: string): Promise<TaskRecord> {
    const task = await this.repo.findOneBy({ id: taskId })
    if (!task) throw new Error(`Task not found: ${taskId}`)

    const extra = instruction.trim()
    if (extra) {
      task.progressNotes = task.progressNotes
        ? `${task.progressNotes}\n- ${extra}`
        : `- ${extra}`
    }
    return this.repo.save(task)
  }

  async setTaskStatus(taskId: number, input: UpdateTaskStatusInput): Promise<TaskRecord> {
    const task = await this.repo.findOneBy({ id: taskId })
    if (!task) throw new Error(`Task not found: ${taskId}`)

    assertTaskStatusTransition(task.status, input.status)
    task.status = input.status
    if (input.closureSummary) {
      task.closureSummary = input.closureSummary.trim()
    }
    if (input.status === 'done' || input.status === 'cancelled') {
      task.closedAt = new Date()
      task.pendingContextJson = '{}'
    }
    return this.repo.save(task)
  }

  async getPendingContext(taskId: number): Promise<Record<string, unknown>> {
    const task = await this.repo.findOneBy({ id: taskId })
    if (!task) throw new Error(`Task not found: ${taskId}`)

    return parsePendingContext(task.pendingContextJson)
  }

  async setPendingContext(taskId: number, pendingContext?: Record<string, unknown> | null): Promise<TaskRecord> {
    const task = await this.repo.findOneBy({ id: taskId })
    if (!task) throw new Error(`Task not found: ${taskId}`)

    task.pendingContextJson = JSON.stringify(pendingContext ?? {})
    return this.repo.save(task)
  }

  async touchTask(taskId: number, messageId?: number | null): Promise<TaskRecord> {
    const task = await this.repo.findOneBy({ id: taskId })
    if (!task) throw new Error(`Task not found: ${taskId}`)

    if (typeof messageId === 'number') {
      task.lastRelatedMessageId = messageId
    }
    return this.repo.save(task)
  }
}

export const taskService = new TaskService()
