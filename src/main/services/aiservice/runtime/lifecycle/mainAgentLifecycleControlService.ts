import type {
  MainAgentUserMessageEvent,
  TaskLifecycleState
} from '@share/cache/AItype/states/taskLifecycleState'
import { taskExecutionService } from '../../../task/taskExecutionService'
import { taskService } from '../../../task/taskService'
import { taskContinuationService } from '../../../task/taskContinuationService'
import { taskLifecycleIntentNode } from './nodes/taskLifecycleIntentNode'
import { taskLifecycleSynthesisNode } from './nodes/taskLifecycleSynthesisNode'
import {
  awaitingUserInputNode,
  buildAwaitingUserInputClarifyMessage,
  buildAwaitingUserInputStatusMessage,
  inferActiveTaskCancellation
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
            taskLifecycle: {
              notice: {
                type: 'task_cancelled',
                message: `用户已取消任务「${activeTask.title}」。任务状态已经写入，不要再次执行取消操作。`
              },
              eventFact: {
                kind: 'task_cancelled',
                taskId: activeTask.id,
                executionId: latestRun?.id,
                taskTitle: activeTask.title,
                source: 'user_instruction',
                occurredAt: new Date().toISOString()
              }
            }
          }
        }

        if (decision.type === 'ask_status') {
          return {
            taskLifecycle: {
              activeTask,
              notice: {
                type: 'task_needs_input',
                message: buildAwaitingUserInputStatusMessage({ activeTask, pendingContext })
              },
              eventFact: {
                kind: 'task_status_requested',
                taskId: activeTask.id,
                taskTitle: activeTask.title,
                source: 'user_instruction',
                occurredAt: new Date().toISOString()
              }
            }
          }
        }

        if (decision.type === 'clarify') {
          return {
            taskLifecycle: {
              activeTask,
              notice: {
                type: 'task_needs_input',
                message: buildAwaitingUserInputClarifyMessage({ activeTask, pendingContext })
              },
              eventFact: {
                kind: 'task_input_needs_clarification',
                taskId: activeTask.id,
                taskTitle: activeTask.title,
                source: 'user_instruction',
                occurredAt: new Date().toISOString()
              }
            }
          }
        }

        const result = await taskContinuationService.continueActiveTask(text, {
          skipIntentCheck: true
        })

        return {
          taskLifecycle: {
            activeTask: {
              ...activeTask,
              status: 'running'
            },
            notice: {
              type: 'task_started',
              message: `用户补充的信息已经交给任务「${activeTask.title}」继续处理。`
            },
            eventFact: {
              kind: 'task_continued',
              taskId: activeTask.id,
              executionId: result.executionId,
              taskTitle: activeTask.title,
              source: 'user_instruction',
              occurredAt: new Date().toISOString()
            }
          }
        }
      }

      const cancellationDecision = await inferActiveTaskCancellation({
        userInput: text,
        activeTask
      })
      if (cancellationDecision.cancelTask) {
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
          taskLifecycle: {
            notice: {
              type: 'task_cancelled',
              message: `用户已取消任务「${activeTask.title}」。任务状态已经写入，不要再次执行取消操作。`
            },
            eventFact: {
              kind: 'task_cancelled',
              taskId: activeTask.id,
              executionId: latestRun?.id,
              taskTitle: activeTask.title,
              source: 'user_instruction',
              occurredAt: new Date().toISOString()
            }
          }
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
          taskLifecycle: {
            decision: {
              type: 'confirm_close_task',
              confidence: 1,
              reason: '用户明确确认当前任务可以结束。'
            },
            notice: {
              type: 'task_completed',
              message: `用户已确认任务「${activeTask.title}」结束。任务状态已经写入。`
            },
            eventFact: {
              kind: 'task_completed',
              taskId: activeTask.id,
              executionId: latestRun?.id,
              taskTitle: activeTask.title,
              source: 'user_instruction',
              occurredAt: new Date().toISOString()
            }
          }
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
