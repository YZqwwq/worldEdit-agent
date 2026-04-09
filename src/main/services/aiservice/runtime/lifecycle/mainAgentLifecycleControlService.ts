import type {
  MainAgentEventConsumptionResult,
  MainAgentUserMessageEvent,
  TaskLifecycleState
} from '@share/cache/AItype/states/taskLifecycleState'
import { taskExecutionService } from '../../../task/taskExecutionService'
import { taskService } from '../../../task/taskService'
import { taskContinuationService } from '../../../task/taskContinuationService'
import { buildLifecycleHandledResult } from './effects/lifecycleHandledEffectBuilder'
import { taskLifecycleIntentNode } from './nodes/taskLifecycleIntentNode'
import { taskLifecycleSynthesisNode } from './nodes/taskLifecycleSynthesisNode'
import {
  awaitingUserInputNode,
  buildAwaitingUserInputClarifyMessage,
  buildAwaitingUserInputStatusMessage,
  matchesObviousTaskCancellation
} from './nodes/awaitingUserInputNode'
import { parseMainAgentContentForPersistence } from '../../messagecontent/mainAgentMessageContentService'

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

export type MainAgentLifecycleControlResult = {
  handledResult?: MainAgentEventConsumptionResult
  taskLifecycle?: TaskLifecycleState
}

class MainAgentLifecycleControlService {
  async controlUserMessage(
    event: MainAgentUserMessageEvent
  ): Promise<MainAgentLifecycleControlResult> {
    const text = parseMainAgentContentForPersistence(event.payload.content).trim()
    if (!text) {
      return {}
    }

    const activeTask = await taskService.getActiveTaskSnapshot()
    if (activeTask) {
      await taskService.touchTask(activeTask.id, event.payload.messageId)

      if (activeTask.status === 'awaiting_user_input') {
        const pendingContext = await taskService.getPendingContext(activeTask.id)
        const decision = await awaitingUserInputNode.resolve({
          userInput: text,
          activeTask,
          pendingContext
        })

        if (decision.type === 'cancel_task') {
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
            handledResult: buildLifecycleHandledResult({
              event,
              summary: 'user_message_cancelled_active_task',
              visibleMessage: `好的，任务「${activeTask.title}」已取消。`,
              taskId: activeTask.id,
              executionId: latestRun?.id,
              userTraceMessage: '用户明确要求取消当前任务。',
              mainTraceMessage: '主 agent 已根据用户指令取消当前任务。',
              payload: {
                action: 'cancel_task',
                userInput: text,
                decisionSource: decision.source
              }
            })
          }
        }

        if (decision.type === 'ask_status') {
          return {
            handledResult: buildLifecycleHandledResult({
              event,
              summary: 'user_message_requested_task_status_while_awaiting_input',
              visibleMessage: buildAwaitingUserInputStatusMessage({
                activeTask,
                pendingContext
              }),
              taskId: activeTask.id,
              userTraceMessage: '用户在任务等待补参时询问当前状态。',
              mainTraceMessage: '主 agent 已解释当前任务等待的补充信息。',
              payload: {
                action: 'ask_task_status',
                userInput: text,
                decisionSource: decision.source,
                decisionConfidence: decision.confidence
              }
            })
          }
        }

        if (decision.type === 'clarify') {
          return {
            handledResult: buildLifecycleHandledResult({
              event,
              summary: 'user_message_clarified_before_resuming_task',
              visibleMessage: buildAwaitingUserInputClarifyMessage({
                activeTask,
                pendingContext
              }),
              taskId: activeTask.id,
              userTraceMessage: '用户在任务等待补参时发送了暂不可直接续跑的输入。',
              mainTraceMessage: '主 agent 已阻止误续跑，并要求用户进一步澄清。',
              payload: {
                action: 'clarify_task_input',
                userInput: text,
                decisionSource: decision.source,
                decisionConfidence: decision.confidence
              }
            })
          }
        }

        const result = await taskContinuationService.continueActiveTask(text, {
          skipIntentCheck: true
        })

        return {
          handledResult: buildLifecycleHandledResult({
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
              executorKind: result.executorKind,
              decisionSource: decision.source,
              decisionConfidence: decision.confidence
            }
          })
        }
      }

      if (matchesObviousTaskCancellation(text)) {
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
          handledResult: buildLifecycleHandledResult({
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
          handledResult: buildLifecycleHandledResult({
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
    }

    const taskLifecycle = await this.prepareTaskLifecycle(text, activeTask)
    return { taskLifecycle }
  }

  private async prepareTaskLifecycle(
    userInput: string,
    activeTask?: TaskLifecycleState['activeTask']
  ): Promise<TaskLifecycleState | undefined> {
    const inferred = await taskLifecycleIntentNode.resolve(userInput, activeTask)
    return taskLifecycleSynthesisNode.synthesize({
      activeTask,
      inferred
    })
  }
}

export const mainAgentLifecycleControlService = new MainAgentLifecycleControlService()
