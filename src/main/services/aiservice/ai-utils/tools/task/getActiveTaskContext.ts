import * as z from 'zod'
import { taskExecutionService } from '../../../../task/taskExecutionService'
import { taskNotificationService } from '../../../../task/taskNotificationService'
import { taskService } from '../../../../task/taskService'
import { mainAgentDispatchService } from '../../../runtime/queue/mainAgentDispatchQueueService'
import { getSubAgentRuntimeSpec } from '../../../../task/subAgentRegistry'
import { defineAgentTool } from '../../core/agentTool'

const getActiveTaskContextInputSchema = z.object({
  recentExecutionsLimit: z.number().int().min(1).max(6).optional()
})

const activeTaskContextExecutionSchema = z.object({
  id: z.number().int().positive(),
  runNumber: z.number().int().positive(),
  executorKind: z.string().min(1),
  status: z.string().min(1),
  resultSummary: z.string(),
  errorReport: z.string().optional(),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional()
})

const activeTaskContextNotificationSchema = z.object({
  id: z.number().int().positive(),
  executionId: z.number().int().positive(),
  type: z.string().min(1),
  status: z.string().min(1),
  message: z.string().optional(),
  createdAt: z.string(),
  processingStartedAt: z.string().optional(),
  mainAgentEventId: z.string().optional()
})

const getActiveTaskContextOutputSchema = z.object({
  found: z.boolean(),
  task: z
    .object({
      id: z.number().int().positive(),
      title: z.string(),
      goal: z.string(),
      summary: z.string(),
      status: z.string(),
      executorKind: z.string(),
      progressNotes: z.string().optional(),
      createdAt: z.string(),
      updatedAt: z.string(),
      createdFromMessageId: z.number().int().positive().nullable().optional(),
      lastRelatedMessageId: z.number().int().positive().nullable().optional()
    })
    .nullable(),
  pendingContext: z.record(z.string(), z.unknown()),
  missingFields: z.array(z.string()),
  recentExecutions: z.array(activeTaskContextExecutionSchema),
  latestActiveNotification: activeTaskContextNotificationSchema.nullable(),
  dispatch: z.object({
    state: z.string(),
    queuedUserCount: z.number().int().min(0),
    queuedTaskNotificationCount: z.number().int().min(0),
    queuedBackgroundCount: z.number().int().min(0),
    totalQueued: z.number().int().min(0),
    currentSource: z.string().optional(),
    currentLabel: z.string().optional()
  }),
  recommendedNextTool: z.string().optional()
})

const parseJsonObject = (input: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(input)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // ignore malformed historical payload
  }
  return {}
}

export const getActiveTaskContextTool = defineAgentTool({
  name: 'get_active_task_context',
  description:
    'Inspect the current active child-agent task context, including pendingContext, recent executions, active notification, and dispatch state.',
  inputSchema: getActiveTaskContextInputSchema,
  outputSchema: getActiveTaskContextOutputSchema,
  metadata: {
    whenToUse: [
      '主 agent 需要知道当前是否存在 active task',
      '需要判断当前任务是否正在等待用户补参',
      '在调用 continue_active_child_agent 之前，先读取当前任务上下文'
    ],
    whenNotToUse: [
      '用户只是普通闲聊，不涉及任何 active task',
      '已经明确知道当前任务状态并且不需要再次确认'
    ],
    inputSummary: '可选提供 recentExecutionsLimit，用于限制返回多少条最近 execution，默认 4 条。',
    outputSummary:
      '返回当前 active task、pendingContext、missingFields、recentExecutions、latestActiveNotification、dispatch，以及建议下一步使用的工具。',
    examples: [
      '在用户补充 world 名之前，先调用本工具确认当前 task 是否真的在等待 worldName。'
    ],
    riskLevel: 'low',
    readOnly: true,
    idempotent: true
  },
  async execute(input) {
    const activeTask = await taskService.getActiveTask()
    const dispatch = mainAgentDispatchService.getSnapshot()

    if (!activeTask) {
      return getActiveTaskContextOutputSchema.parse({
        found: false,
        task: null,
        pendingContext: {},
        missingFields: [],
        recentExecutions: [],
        latestActiveNotification: null,
        dispatch,
        recommendedNextTool: undefined
      })
    }

    const limit = input.recentExecutionsLimit ?? 4
    const [pendingContext, recentRuns, latestActiveNotification] = await Promise.all([
      taskService.getPendingContext(activeTask.id),
      taskExecutionService.listRunsForTask(activeTask.id, limit),
      taskNotificationService.getLatestActiveNotification(activeTask.id)
    ])

    const notificationPayload = latestActiveNotification
      ? getSubAgentRuntimeSpec(activeTask.executorKind).protocol.parsePayload(
          parseJsonObject(latestActiveNotification.payloadJson)
        )
      : null

    const runtimeSpec = getSubAgentRuntimeSpec(activeTask.executorKind)
    const missingFields = runtimeSpec.inspection?.getMissingFields?.(pendingContext) ?? []
    const recommendedNextTool =
      runtimeSpec.inspection?.getRecommendedNextTool?.({
        taskStatus: activeTask.status,
        delegateToolName: runtimeSpec.delegateToolName
      }) ?? (activeTask.status === 'awaiting_user_input' ? 'continue_active_child_agent' : undefined)

    return getActiveTaskContextOutputSchema.parse({
      found: true,
      task: {
        id: activeTask.id,
        title: activeTask.title,
        goal: activeTask.goal,
        summary: activeTask.summary,
        status: activeTask.status,
        executorKind: activeTask.executorKind,
        progressNotes: activeTask.progressNotes || undefined,
        createdAt: activeTask.createdAt.toISOString(),
        updatedAt: activeTask.updatedAt.toISOString(),
        createdFromMessageId: activeTask.createdFromMessageId,
        lastRelatedMessageId: activeTask.lastRelatedMessageId
      },
      pendingContext,
      missingFields,
      recentExecutions: recentRuns.map((run) => ({
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
      latestActiveNotification: latestActiveNotification
        ? {
            id: latestActiveNotification.id,
            executionId: latestActiveNotification.executionId,
            type: latestActiveNotification.type,
            status: latestActiveNotification.status,
            message: notificationPayload?.message || notificationPayload?.summary || undefined,
            createdAt: latestActiveNotification.createdAt.toISOString(),
            processingStartedAt: latestActiveNotification.processingStartedAt?.toISOString(),
            mainAgentEventId: latestActiveNotification.mainAgentEventId || undefined
          }
        : null,
      dispatch,
      recommendedNextTool
    })
  },
  successMessage(data) {
    return data.found
      ? `Loaded active task context for task #${data.task?.id}.`
      : 'There is no active task right now.'
  },
  nextSuggestions(data) {
    if (!data.found) {
      return ['If the user is starting a long-running edit request, consider delegating a new child-agent task.']
    }
    if (data.recommendedNextTool === 'continue_active_child_agent') {
      return ['If the user just supplied the missing fields, continue with continue_active_child_agent.']
    }
    return ['Use the returned task status and pendingContext to decide whether to ask the user for more detail or continue normal reasoning.']
  }
})
