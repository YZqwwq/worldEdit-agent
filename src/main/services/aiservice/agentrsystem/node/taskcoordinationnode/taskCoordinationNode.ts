import type { MainAgentTaskDecision } from '@share/cache/AItype/states/taskLifecycleState'
import { emitGraphThought } from '../../../../log/graphlog'
import { MessagesState } from '../../state/messageState'

const buildDecision = (
  state: typeof MessagesState.State
): MainAgentTaskDecision | undefined => {
  const taskEvent = state.taskEvent
  if (!taskEvent || taskEvent.source !== 'task_queue') {
    return undefined
  }

  const visibleMessage = taskEvent.notice.message?.trim()

  switch (taskEvent.notice.type) {
    case 'task_needs_input':
    case 'task_waiting_confirmation':
    case 'task_failed':
    case 'task_cancelled':
    case 'task_registration_blocked':
      return {
        action: 'ask_user',
        reason: `当前任务通知 ${taskEvent.notice.type} 需要主 agent 向用户发出可见反馈。`,
        visibleMessage: visibleMessage || undefined
      }
    default:
      return {
        action: 'none',
        reason: '当前通知没有需要主 agent 额外执行的动作。'
      }
  }
}

export async function taskCoordinationNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const decision = buildDecision(state)
  if (!decision) {
    return {}
  }

  emitGraphThought('taskCoordinationNode', {
    stage: 'task_event_decision',
    taskId: state.taskEvent?.taskId ?? null,
    notificationId: state.taskEvent?.notificationId ?? null,
    notificationType: state.taskEvent?.notificationType ?? null,
    decision: {
      action: decision.action,
      reason: decision.reason,
      visibleMessage: decision.visibleMessage ?? null
    }
  })

  return {
    taskLifecycle: {
      ...(state.taskLifecycle ?? {}),
      activeTask: state.taskEvent?.activeTask,
      notice: state.taskEvent?.notice
    },
    taskEventDecision: decision
  }
}
