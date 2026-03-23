import type {
  MainAgentEventConsumptionResult,
  MainAgentUserMessageEvent,
  TaskTraceStage
} from '@share/cache/AItype/states/taskLifecycleState'
import { taskExecutionService } from '../../task/taskExecutionService'
import { taskService } from '../../task/taskService'
import { taskContinuationService } from '../taskContinuationService'

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

const matchesAny = (text: string, patterns: RegExp[]): boolean =>
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
    consumer: 'user_input_router',
    summary: input.summary,
    effects: [
      {
        ...effectContext,
        type: 'save_message',
        role: 'ai',
        content: input.visibleMessage
      },
      {
        ...effectContext,
        type: 'emit_trace',
        taskId: input.taskId,
        executionId: input.executionId,
        actor: 'user',
        stage: 'user_replied_to_task',
        message: input.userTraceMessage,
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

class MainAgentUserInputRouterService {
  async route(
    event: MainAgentUserMessageEvent
  ): Promise<MainAgentEventConsumptionResult | null> {
    const text = event.payload.text.trim()
    if (!text) {
      return null
    }

    const activeTask = await taskService.getActiveTask()
    if (!activeTask) {
      return null
    }

    await taskService.touchTask(activeTask.id, event.payload.messageId)

    if (matchesAny(text, CANCEL_PATTERNS)) {
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

      return buildHandledResult({
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

    if (
      activeTask.status === 'awaiting_user_confirmation' &&
      matchesAny(text, CONFIRM_CLOSE_PATTERNS)
    ) {
      const latestRun = await taskExecutionService.getLatestRun(activeTask.id)

      await taskService.setTaskStatus(activeTask.id, {
        status: 'done',
        closureSummary: `用户确认完成任务：${activeTask.title}`
      })

      return buildHandledResult({
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

    if (activeTask.status === 'awaiting_user_input') {
      const result = await taskContinuationService.continueActiveTask(text)

      return buildHandledResult({
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

    return null
  }
}

export const mainAgentUserInputRouterService = new MainAgentUserInputRouterService()
