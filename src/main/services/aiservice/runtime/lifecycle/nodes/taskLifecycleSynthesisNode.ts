import type { TaskLifecycleState } from '@share/cache/AItype/states/taskLifecycleState'
import { subAgentCapabilityService } from '../../../../task/subAgentCapabilityService'
import { taskService } from '../../../../task/taskService'
import { traceArtifact } from '../../../../log/trace/agentTraceEmitter'
import {
  getSuggestedExecutor,
  toTaskLifecycleDecision,
  type TaskDecisionResult
} from './taskLifecycleIntentNode'

class TaskLifecycleSynthesisNode {
  async synthesize(input: {
    activeTask?: TaskLifecycleState['activeTask']
    inferred: TaskDecisionResult
  }): Promise<TaskLifecycleState | undefined> {
    const decision = toTaskLifecycleDecision(input.inferred)
    let nextActiveTask = input.activeTask
    let notice: TaskLifecycleState['notice']
    let capability: TaskLifecycleState['capability']

    if (decision.type === 'create_task' && input.inferred.task && decision.confidence >= 0.75) {
      if (input.activeTask) {
        notice = {
          type: 'task_registration_blocked',
          message:
            `当前已有活跃任务「${input.activeTask.title}」正在进行。` +
            ' 在单人格主上下文里不要并行创建第二个任务，请优先继续、确认完成或取消当前任务。'
        }

        return {
          activeTask: input.activeTask,
          decision,
          notice
        }
      }

      capability = subAgentCapabilityService.getCapability(
        getSuggestedExecutor(input.inferred.task.executorKind)
      )

      traceArtifact('taskLifecycleSynthesisNode', {
        summary: `能力检查 ${capability.available ? '可用' : '不可用'}：${capability.executorKind}`,
        data: {
          stage: 'task_capability_check',
          capability: {
            executorKind: capability.executorKind,
            requiredToolName: capability.requiredToolName,
            available: capability.available,
            message: capability.message
          }
        }
      })

      if (!capability.available) {
        notice = {
          type: 'task_registration_blocked',
          message: capability.message
        }
      }
    } else if (decision.type === 'confirm_close_task' && input.activeTask) {
      if (input.activeTask.status === 'awaiting_user_confirmation') {
        await taskService.setTaskStatus(input.activeTask.id, {
          status: 'done',
          closureSummary: '用户确认当前任务结束'
        })
        nextActiveTask = undefined
        notice = {
          type: 'task_waiting_confirmation',
          message: `任务「${input.activeTask.title}」已确认结束。`
        }
      } else {
        notice = {
          type: 'task_registration_blocked',
          message:
            `当前任务「${input.activeTask.title}」尚未进入可确认结束阶段。` +
            ' 如果用户是想停止当前任务，应走取消语义；如果任务仍在执行，应等待子 agent 返回结果。'
        }
      }
    } else if (decision.type === 'continue_task' && input.activeTask) {
      if (input.activeTask.status === 'awaiting_user_input') {
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

export const taskLifecycleSynthesisNode = new TaskLifecycleSynthesisNode()
