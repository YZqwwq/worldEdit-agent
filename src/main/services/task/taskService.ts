import { AppDataSource } from '../../database'
import { TaskRecord } from '../../../share/entity/database/TaskRecord'
import type {
  ActiveTaskSnapshot,
  TaskExecutorKind,
  TaskStatus
} from '@share/cache/AItype/states/taskLifecycleState'

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

const ACTIVE_TASK_STATUSES: TaskStatus[] = ['active', 'running', 'awaiting_user_confirmation']

const toSnapshot = (task: TaskRecord): ActiveTaskSnapshot => ({
  id: task.id,
  title: task.title,
  goal: task.goal,
  summary: task.summary,
  status: task.status,
  executorKind: task.executorKind,
  progressNotes: task.progressNotes || undefined
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

    task.status = input.status
    if (input.closureSummary) {
      task.closureSummary = input.closureSummary.trim()
    }
    if (input.status === 'done' || input.status === 'cancelled') {
      task.closedAt = new Date()
    }
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
