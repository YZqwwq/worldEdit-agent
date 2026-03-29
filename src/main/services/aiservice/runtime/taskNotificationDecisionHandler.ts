import type {
  MainAgentTaskDecision,
  MainAgentTaskEvent
} from '@share/cache/AItype/states/taskLifecycleState'

export function decideTaskNotification(
  taskEvent: MainAgentTaskEvent
): MainAgentTaskDecision {
  const visibleMessage = taskEvent.notice.message?.trim()

  switch (taskEvent.notice.type) {
    case 'task_needs_input':
    case 'task_waiting_confirmation':
    case 'task_failed':
    case 'task_cancelled':
    case 'task_cancel_requested':
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
