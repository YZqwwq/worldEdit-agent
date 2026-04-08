import { z } from 'zod'
import { AppDataSource } from '../../../../../database'
import { TaskNotificationRecord } from '../../../../../../share/entity/database/TaskNotificationRecord'
import { TaskRecord } from '../../../../../../share/entity/database/TaskRecord'
import { taskExecutionService } from '../../../../task/taskExecutionService'
import { taskService } from '../../../../task/taskService'
import { taskTraceService } from '../../../../task/taskTraceService'
import { getSubAgentRuntimeSpec } from '../../../../task/subAgentRegistry'
import { defineAgentTool } from '../../core/agentTool'

const parseJsonObject = (input: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(input)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // ignore malformed payloads
  }
  return {}
}

const getTaskDetailInputSchema = z.object({
  taskId: z.number().int().positive().optional(),
  recentExecutionsLimit: z.number().int().min(1).max(10).optional(),
  traceLimit: z.number().int().min(1).max(30).optional()
})

const taskSummarySchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  goal: z.string(),
  summary: z.string(),
  status: z.string(),
  executorKind: z.string(),
  progressNotes: z.string().optional(),
  closureSummary: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().optional(),
  createdFromMessageId: z.number().int().positive().nullable().optional(),
  lastRelatedMessageId: z.number().int().positive().nullable().optional()
})

const executionSummarySchema = z.object({
  id: z.number().int().positive(),
  runNumber: z.number().int().positive(),
  executorKind: z.string(),
  status: z.string(),
  resultSummary: z.string(),
  errorReport: z.string().optional(),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional()
})

const traceSummarySchema = z.object({
  id: z.number().int().positive(),
  executionId: z.number().int().positive().optional(),
  actor: z.string(),
  stage: z.string(),
  message: z.string(),
  createdAt: z.string()
})

const notificationSummarySchema = z.object({
  id: z.number().int().positive(),
  executionId: z.number().int().positive(),
  type: z.string(),
  status: z.string(),
  outcome: z.string().optional(),
  summary: z.string().optional(),
  message: z.string().optional(),
  createdAt: z.string(),
  processingStartedAt: z.string().optional(),
  consumedAt: z.string().optional(),
  mainAgentEventId: z.string().optional()
})

const getTaskDetailOutputSchema = z.object({
  found: z.boolean(),
  source: z.enum(['task_id', 'active_task']),
  task: taskSummarySchema.nullable(),
  pendingContext: z.record(z.string(), z.unknown()),
  executions: z.array(executionSummarySchema),
  traces: z.array(traceSummarySchema),
  latestNotification: notificationSummarySchema.nullable()
})

export const getTaskDetailTool = defineAgentTool({
  name: 'get_task_detail',
  description: 'Inspect a task in detail, including its status, pendingContext, recent executions, traces, and latest notification.',
  inputSchema: getTaskDetailInputSchema,
  outputSchema: getTaskDetailOutputSchema,
  metadata: {
    whenToUse: [
      '主 agent 需要解释某个任务为什么失败、卡住或等待补参',
      '用户追问某个后台任务目前进展如何',
      '需要读取任务的 execution 与 trace 摘要来判断下一步'
    ],
    whenNotToUse: [
      '只需要知道当前是否有 active task，可先用 get_active_task_context',
      '问题与任何任务无关'
    ],
    inputSummary: '可选提供 taskId；不提供时读取当前 active task。可选 recentExecutionsLimit 和 traceLimit。',
    outputSummary: '返回 task 摘要、pendingContext、recent executions、recent traces 和 latest notification。',
    examples: [
      '当用户问“刚才那个任务为什么没继续跑”时，调用 get_task_detail 读取 execution 和 trace 摘要。'
    ],
    riskLevel: 'low',
    readOnly: true,
    idempotent: true
  },
  async execute(input) {
    const repo = AppDataSource.getRepository(TaskRecord)
    const notificationRepo = AppDataSource.getRepository(TaskNotificationRecord)
    const source = input.taskId ? 'task_id' as const : 'active_task' as const
    const task = input.taskId
      ? await repo.findOneBy({ id: input.taskId })
      : await taskService.getActiveTask()

    if (!task) {
      return {
        found: false,
        source,
        task: null,
        pendingContext: {},
        executions: [],
        traces: [],
        latestNotification: null
      }
    }

    const [pendingContext, executions, traces, latestNotification] = await Promise.all([
      taskService.getPendingContext(task.id),
      taskExecutionService.listRunsForTask(task.id, input.recentExecutionsLimit ?? 6),
      taskTraceService.listTaskTraces(task.id, input.traceLimit ?? 24),
      notificationRepo.find({
        where: { taskId: task.id },
        order: { updatedAt: 'DESC', createdAt: 'DESC', id: 'DESC' },
        take: 1
      }).then((rows) => rows[0] ?? null)
    ])

    const parsedNotification = latestNotification
      ? getSubAgentRuntimeSpec(task.executorKind).protocol.parsePayload(
          parseJsonObject(latestNotification.payloadJson)
        )
      : null

    return {
      found: true,
      source,
      task: {
        id: task.id,
        title: task.title,
        goal: task.goal,
        summary: task.summary,
        status: task.status,
        executorKind: task.executorKind,
        progressNotes: task.progressNotes || undefined,
        closureSummary: task.closureSummary || undefined,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
        closedAt: task.closedAt?.toISOString(),
        createdFromMessageId: task.createdFromMessageId,
        lastRelatedMessageId: task.lastRelatedMessageId
      },
      pendingContext,
      executions: executions.map((run) => ({
        id: run.id,
        runNumber: run.runNumber,
        executorKind: run.executorKind,
        status: run.status,
        resultSummary: run.resultSummary,
        errorReport: run.errorReport || undefined,
        createdAt: run.createdAt.toISOString(),
        startedAt: run.startedAt?.toISOString(),
        finishedAt: run.finishedAt?.toISOString()
      })),
      traces,
      latestNotification: latestNotification
        ? {
            id: latestNotification.id,
            executionId: latestNotification.executionId,
            type: latestNotification.type,
            status: latestNotification.status,
            outcome: parsedNotification?.outcome,
            summary: parsedNotification?.summary || undefined,
            message: parsedNotification?.message || undefined,
            createdAt: latestNotification.createdAt.toISOString(),
            processingStartedAt: latestNotification.processingStartedAt?.toISOString(),
            consumedAt: latestNotification.consumedAt?.toISOString(),
            mainAgentEventId: latestNotification.mainAgentEventId || undefined
          }
        : null
    }
  },
  successMessage(data) {
    return data.found
      ? `Loaded detailed context for task #${data.task?.id}.`
      : 'No matching task was found.'
  },
  nextSuggestions(data) {
    if (!data.found) {
      return ['If you need the current active task only, check whether an active task exists before retrying.']
    }
    return ['Use the returned executions, traces, and notification summary to explain progress, failure, or the next required user input.']
  }
})
