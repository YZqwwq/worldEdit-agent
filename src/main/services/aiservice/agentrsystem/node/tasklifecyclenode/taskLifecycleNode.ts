import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type {
  ActiveTaskSnapshot,
  TaskExecutorKind,
  TaskLifecycleDecision,
  TaskLifecycleDecisionType,
  TaskLifecycleState
} from '@share/cache/AItype/states/taskLifecycleState'
import { contentToText } from '../../../messageoutput/transformRespones'
import { toErrorMessage } from '../../../../../../share/utils/error/error'
import { getQuickModel } from '../../modelwithtool/quick-base-model'
import { experienceService } from '../../../../experience/experienceService'
import { subAgentCapabilityService } from '../../../../task/subAgentCapabilityService'
import { taskService } from '../../../../task/taskService'
import { emitGraphThought } from '../../../../log/graphlog'
import { MessagesState } from '../../state/messageState'

const taskDecisionSchema = z.object({
  decision: z.object({
    type: z.enum(['none', 'create_task', 'continue_task', 'confirm_close_task']),
    confidence: z.number().min(0).max(1),
    reason: z.string().trim().min(1).max(300)
  }),
  task: z
    .object({
      title: z.string().trim().min(1).max(120),
      goal: z.string().trim().min(1).max(500),
      summary: z.string().trim().min(1).max(800),
      executorKind: z
        .enum([
          'general_task_worker',
          'code_worker',
          'doc_worker',
          'tool_builder',
          'architecture_analyst',
          'general_research'
        ])
        .default('general_task_worker')
    })
    .optional()
})

type TaskDecisionResult = z.infer<typeof taskDecisionSchema>

const extractJsonObject = (text: string): string | null => {
  const trimmed = text.trim()
  if (!trimmed) return null

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch?.[1]) return fencedMatch[1].trim()

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return trimmed.slice(start, end + 1)
}

const buildPrompt = (userInput: string, activeTask?: ActiveTaskSnapshot): string => `你是主代理的任务生命周期判断器。

职责边界：
1. 主代理只负责任务注册、通知用户任务开始、在执行代理上报完成后请求用户确认结束。
2. 主代理不负责执行复杂任务，不负责验证结果，不负责失败重试。
3. 当用户提出明确且需要持续处理的复杂任务时，返回 create_task。
4. 当用户是在补充、修改、继续当前任务时，返回 continue_task。
5. 当用户明确确认任务结束时，返回 confirm_close_task。
6. 其他闲聊或普通追问返回 none。

当前活跃任务：
${activeTask ? JSON.stringify(activeTask, null, 2) : 'null'}

用户最新输入：
${userInput}

只输出 JSON：
{
  "decision": {
    "type": "create_task",
    "confidence": 0.92,
    "reason": "用户提出了一个需要由执行代理持续处理的复杂任务"
  },
  "task": {
    "title": "简洁任务标题",
    "goal": "任务目标",
    "summary": "给主代理看的简要摘要",
    "executorKind": "code_worker"
  }
}

规则：
1. 如果 decision.type 不是 create_task，可省略 task。
2. 只有需要持续处理或委派给执行代理的复杂任务，才返回 create_task。
3. 置信度范围必须为 0 到 1。
4. 不要输出额外解释。`

const inferDecisionFallback = (
  userInput: string,
  activeTask?: ActiveTaskSnapshot
): TaskDecisionResult => {
  const text = userInput.trim().toLowerCase()
  const closePatterns = [/完成了/, /结束吧/, /不用继续/, /可以关了/, /就这样吧/]
  if (activeTask && closePatterns.some((pattern) => pattern.test(text))) {
    return {
      decision: {
        type: 'confirm_close_task',
        confidence: 0.66,
        reason: '用户表达了结束当前任务的意图'
      }
    }
  }

  if (activeTask) {
    return {
      decision: {
        type: 'continue_task',
        confidence: 0.55,
        reason: '当前存在活跃任务，默认将本轮输入视为对当前任务的补充'
      }
    }
  }

  return {
    decision: {
      type: 'none',
      confidence: 0.45,
      reason: '未识别出足以创建任务的明确信号'
    }
  }
}

const inferDecisionWithModel = async (
  userInput: string,
  activeTask?: ActiveTaskSnapshot
): Promise<TaskDecisionResult> => {
  const model = await getQuickModel()
  const response = await model.invoke(
    [new SystemMessage('你只负责输出合法 JSON。'), new HumanMessage(buildPrompt(userInput, activeTask))],
    { signal: AbortSignal.timeout(8000) } as Record<string, unknown>
  )
  const text = contentToText(response.content)
  const jsonText = extractJsonObject(text)
  if (!jsonText) {
    throw new Error('Task lifecycle model did not return valid JSON')
  }
  return taskDecisionSchema.parse(JSON.parse(jsonText))
}

const toDecision = (input: TaskDecisionResult): TaskLifecycleDecision => ({
  type: input.decision.type as TaskLifecycleDecisionType,
  confidence: input.decision.confidence,
  reason: input.decision.reason
})

const getSuggestedExecutor = (
  executorKind?: TaskExecutorKind
): TaskExecutorKind => executorKind || 'general_task_worker'

export async function taskLifecycleNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const latestUserMessage = state.messages
    .slice()
    .reverse()
    .find((message) => message instanceof HumanMessage && !message.additional_kwargs?.isHistory)

  if (!latestUserMessage) {
    return {}
  }

  const userInput =
    typeof latestUserMessage.content === 'string'
      ? latestUserMessage.content
      : contentToText(latestUserMessage.content)

  const activeTask = await taskService.getActiveTaskSnapshot()

  let inferred: TaskDecisionResult
  try {
    inferred = await inferDecisionWithModel(userInput, activeTask)
    emitGraphThought('taskLifecycleNode', {
      stage: 'task_decision',
      source: 'quick_model',
      modelResponse: inferred
    })
  } catch (error) {
    inferred = inferDecisionFallback(userInput, activeTask)
    emitGraphThought('taskLifecycleNode', {
      stage: 'task_decision',
      source: 'fallback',
      reason: toErrorMessage(error),
      modelResponse: inferred
    })
  }

  const decision = toDecision(inferred)
  let nextActiveTask = activeTask
  let notice: TaskLifecycleState['notice']
  let capability: TaskLifecycleState['capability']

  if (decision.type === 'create_task' && inferred.task && decision.confidence >= 0.75) {
    capability = subAgentCapabilityService.getCapability(getSuggestedExecutor(inferred.task.executorKind))

    emitGraphThought('taskLifecycleNode', {
      stage: 'task_capability_check',
      capability: {
        executorKind: capability.executorKind,
        requiredToolName: capability.requiredToolName,
        available: capability.available,
        message: capability.message
      }
    })

    if (capability.available) {
      const created = await taskService.createTask({
        title: inferred.task.title,
        goal: inferred.task.goal,
        summary: inferred.task.summary,
        executorKind: capability.executorKind
      })
      nextActiveTask = await taskService.getActiveTaskSnapshot()
      notice = {
        type: 'task_started',
        message: `已登记任务「${created.title}」，并准备交给对应执行代理处理。`
      }
    } else {
      notice = {
        type: 'task_registration_blocked',
        message: capability.message
      }
    }
  } else if (decision.type === 'confirm_close_task' && activeTask) {
    await taskService.setTaskStatus(activeTask.id, {
      status: 'done',
      closureSummary: '用户确认当前任务结束'
    })
    nextActiveTask = undefined
    notice = {
      type: 'task_waiting_confirmation',
      message: `任务「${activeTask.title}」已确认结束。`
    }
  } else if (decision.type === 'continue_task' && activeTask) {
    nextActiveTask = activeTask
  }

  const recalledExperiences =
    decision.type === 'create_task' && inferred.task
      ? await experienceService.findRelevantExperiences(
          {
            title: inferred.task.title,
            goal: inferred.task.goal
          },
          3
        )
      : []

  return {
    taskLifecycle: {
      activeTask: nextActiveTask,
      decision,
      notice,
      capability,
      recalledExperiences
    }
  }
}
