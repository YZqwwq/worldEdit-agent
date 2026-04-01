import type {
  MainAgentEventConsumptionResult,
  MainAgentUserMessageEvent,
  TaskLifecycleState,
  TaskTraceStage
} from '@share/cache/AItype/states/taskLifecycleState'
import { taskExecutionService } from '../../task/taskExecutionService'
import { taskService } from '../../task/taskService'
import { subAgentCapabilityService } from '../../task/subAgentCapabilityService'
import { taskContinuationService } from '../taskContinuationService'
import { emitGraphThought } from '../../log/graphlog'
import {
  getSuggestedExecutor,
  taskLifecycleIntentResolver,
  toTaskLifecycleDecision
} from './taskLifecycleIntentResolver'

const CANCEL_PATTERNS = [
  /取消/,
  /不用了/,
  /先这样/,
  /停止/,
  /算了/,
  /不做了/,
  /结束这个任务/,
  /cancel/i
]

const CONFIRM_CLOSE_PATTERNS = [
  /可以了/,
  /就这样吧/,
  /确认结束/,
  /确认完成/,
  /结束任务/,
  /完成了/,
  /done/i,
  /close/i
]

const matchesAnyPattern = (text: string, patterns: RegExp[]): boolean =>
  patterns.some((pattern) => pattern.test(text))

const createEffectContext = (event: MainAgentUserMessageEvent) => ({
  eventId: event.id,
  sessionId: event.sessionId
})

const buildHandledResult = (input: {
  event: MainAgentUserMessageEvent
  summary: string
  visibleMessage: string
  taskId: number
  executionId?: number
  userTraceMessage: string
  mainTraceMessage: string
  mainTraceStage?: TaskTraceStage
  payload?: Record<string, unknown>
}): MainAgentEventConsumptionResult => {
  const effectContext = createEffectContext(input.event)

  return {
    handled: true,
    consumer: 'lifecycle_control',
    summary: input.summary,
    effects: [
      {
        ...effectContext,
        type: 'save_message',
        role: 'ai',
        content: input.visibleMessage,
        eventIdRef: input.event.id,
        consumer: 'lifecycle_control'
      },
      {
        ...effectContext,
        type: 'emit_trace',
        taskId: input.taskId,
        executionId: input.executionId,
        actor: 'user',
        stage: 'user_replied_to_task',
        message: input.userTraceMessage,
        dedupeKey: `${input.event.id}:user_replied_to_task:user`,
        payload: input.payload
      },
      {
        ...effectContext,
        type: 'emit_trace',
        taskId: input.taskId,
        executionId: input.executionId,
        actor: 'main_agent',
        stage: input.mainTraceStage ?? 'main_response_user',
        message: input.mainTraceMessage,
        dedupeKey: `${input.event.id}:${input.mainTraceStage ?? 'main_response_user'}:main_agent`,
        payload: input.payload
      },
      {
        ...effectContext,
        type: 'stream_done',
        onChunk: input.event.payload.onChunk,
        fullText: input.visibleMessage
      }
    ]
  }
}

export type MainAgentLifecycleControlResult = {
  handledResult?: MainAgentEventConsumptionResult
  taskLifecycle?: TaskLifecycleState
}

class MainAgentLifecycleControlService {
  async controlUserMessage(
    event: MainAgentUserMessageEvent
  ): Promise<MainAgentLifecycleControlResult> {
    const text = event.payload.text.trim()
    if (!text) {
      return {}
    }

    const activeTask = await taskService.getActiveTaskSnapshot()
    if (activeTask) {
      await taskService.touchTask(activeTask.id, event.payload.messageId)

      if (matchesAnyPattern(text, CANCEL_PATTERNS)) {
        const latestRun = await taskExecutionService.getLatestRun(activeTask.id)
        if (latestRun && !['reported_done', 'failed', 'cancelled'].includes(latestRun.status)) {
          await taskExecutionService.setRunStatus(latestRun.id, 'cancelled', {
            errorReport: `Cancelled by user input: ${text.slice(0, 200)}`
          })
        }

        await taskService.setTaskStatus(activeTask.id, {
          status: 'cancelled',
          closureSummary: `用户取消任务：${text.slice(0, 200)}`
        })

        return {
          handledResult: buildHandledResult({
            event,
            summary: 'user_message_cancelled_active_task',
            visibleMessage: `好的，任务「${activeTask.title}」已取消。`,
            taskId: activeTask.id,
            executionId: latestRun?.id,
            userTraceMessage: '用户明确要求取消当前任务。',
            mainTraceMessage: '主 agent 已根据用户指令取消当前任务。',
            payload: {
              action: 'cancel_task',
              userInput: text
            }
          })
        }
      }

      if (
        activeTask.status === 'awaiting_user_confirmation' &&
        matchesAnyPattern(text, CONFIRM_CLOSE_PATTERNS)
      ) {
        const latestRun = await taskExecutionService.getLatestRun(activeTask.id)

        await taskService.setTaskStatus(activeTask.id, {
          status: 'done',
          closureSummary: `用户确认完成任务：${activeTask.title}`
        })

        return {
          handledResult: buildHandledResult({
            event,
            summary: 'user_message_confirmed_task_completion',
            visibleMessage: `好的，任务「${activeTask.title}」已结束。`,
            taskId: activeTask.id,
            executionId: latestRun?.id,
            userTraceMessage: '用户确认当前任务可以结束。',
            mainTraceMessage: '主 agent 已根据用户确认关闭当前任务。',
            payload: {
              action: 'confirm_close_task',
              userInput: text
            }
          })
        }
      }

      if (activeTask.status === 'awaiting_user_input') {
        const result = await taskContinuationService.continueActiveTask(text)

        return {
          handledResult: buildHandledResult({
            event,
            summary: 'user_message_resumed_active_task',
            visibleMessage:
              `已收到补充信息，我会继续处理任务「${activeTask.title}」。` +
              ' 你可以继续补充要求，我会在子 agent 返回后同步结果。',
            taskId: activeTask.id,
            executionId: result.executionId,
            userTraceMessage: '用户已补充当前任务所需信息。',
            mainTraceMessage: '主 agent 已吸收用户补参并续跑当前子 agent。',
            payload: {
              action: 'continue_task',
              userInput: text,
              executionId: result.executionId,
              executorKind: result.executorKind
            }
          })
        }
      }
    }

    const taskLifecycle = await this.prepareTaskLifecycle(text, activeTask)
    return { taskLifecycle }
  }

  private async prepareTaskLifecycle(
    userInput: string,
    activeTask?: TaskLifecycleState['activeTask']
  ): Promise<TaskLifecycleState | undefined> {
    const inferred = await taskLifecycleIntentResolver.resolve(userInput, activeTask)
    const decision = toTaskLifecycleDecision(inferred)

    let nextActiveTask = activeTask
    let notice: TaskLifecycleState['notice']
    let capability: TaskLifecycleState['capability']

    if (decision.type === 'create_task' && inferred.task && decision.confidence >= 0.75) {
      if (activeTask) {
        notice = {
          type: 'task_registration_blocked',
          message:
            `当前已有活跃任务「${activeTask.title}」正在进行。` +
            ' 在单人格主上下文里不要并行创建第二个任务，请优先继续、确认完成或取消当前任务。'
        }

        return {
          activeTask,
          decision,
          notice
        }
      }

      capability = subAgentCapabilityService.getCapability(
        getSuggestedExecutor(inferred.task.executorKind)
      )

      emitGraphThought('lifecycleControl', {
        stage: 'task_capability_check',
        capability: {
          executorKind: capability.executorKind,
          requiredToolName: capability.requiredToolName,
          available: capability.available,
          message: capability.message
        }
      })

      if (!capability.available) {
        notice = {
          type: 'task_registration_blocked',
          message: capability.message
        }
      }
    } else if (decision.type === 'confirm_close_task' && activeTask) {
      if (activeTask.status === 'awaiting_user_confirmation') {
        await taskService.setTaskStatus(activeTask.id, {
          status: 'done',
          closureSummary: '用户确认当前任务结束'
        })
        nextActiveTask = undefined
        notice = {
          type: 'task_waiting_confirmation',
          message: `任务「${activeTask.title}」已确认结束。`
        }
      } else {
        notice = {
          type: 'task_registration_blocked',
          message:
            `当前任务「${activeTask.title}」尚未进入可确认结束阶段。` +
            ' 如果用户是想停止当前任务，应走取消语义；如果任务仍在执行，应等待子 agent 返回结果。'
        }
      }
    } else if (decision.type === 'continue_task' && activeTask) {
      if (activeTask.status === 'awaiting_user_input') {
        notice = {
          type: 'task_needs_input',
          message:
            '当前任务正在等待用户补充信息。如果用户已经给出补参，请优先调用 continue_active_child_agent 工具续跑对应子 agent，而不是直接口头结束任务。'
        }
      }
    }

    return {
      activeTask: nextActiveTask,
      decision,
      notice,
      capability
    }
  }
}

export const mainAgentLifecycleControlService = new MainAgentLifecycleControlService()
