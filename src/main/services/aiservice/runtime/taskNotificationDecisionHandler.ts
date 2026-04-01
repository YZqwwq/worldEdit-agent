import type {
  MainAgentTaskDecision,
  MainAgentTaskEvent
} from '@share/cache/AItype/states/taskLifecycleState'
import type { SubAgentProtocolDetails } from '@share/cache/AItype/states/taskCommunication'

const toFallbackVisibleMessage = (taskEvent: MainAgentTaskEvent): string | undefined =>
  taskEvent.notice.message?.trim() || taskEvent.payload.message?.trim() || undefined

const buildVisibleMessageFromDetails = (
  details: SubAgentProtocolDetails | undefined,
  taskEvent: MainAgentTaskEvent
): string | undefined => {
  if (!details) {
    return toFallbackVisibleMessage(taskEvent)
  }

  switch (details.kind) {
    case 'needs_input':
      return (
        details.suggestedPrompt?.trim() ||
        (details.missingFields?.length
          ? `当前还需要补充这些信息：${details.missingFields.join('、')}。`
          : undefined) ||
        toFallbackVisibleMessage(taskEvent)
      )
    case 'failed':
    case 'completed':
    case 'cancelled':
      return toFallbackVisibleMessage(taskEvent)
  }
}

export function decideTaskNotification(
  taskEvent: MainAgentTaskEvent
): MainAgentTaskDecision {
  const details = taskEvent.payload.details
  const visibleMessage = buildVisibleMessageFromDetails(details, taskEvent)

  if (details?.kind === 'needs_input') {
    return {
      action: 'ask_user',
      reason:
        details.missingFields?.length
          ? `子 agent 通过 typed details 明确指出缺失字段：${details.missingFields.join(', ')}。`
          : '子 agent 通过 typed details 明确表示当前需要用户补参。',
      visibleMessage
    }
  }

  if (details?.kind === 'failed') {
    return {
      action: 'ask_user',
      reason:
        `子 agent 通过 typed details 报告执行失败` +
        (details.errorType ? `，错误类型为 ${details.errorType}` : '') +
        (typeof details.retryable === 'boolean'
          ? details.retryable
            ? '，该失败可重试。'
            : '，该失败不建议自动重试。'
          : '。'),
      visibleMessage
    }
  }

  if (details?.kind === 'completed') {
    return {
      action: 'ask_user',
      reason: '子 agent 通过 typed details 报告本轮执行已完成，主 agent 应与用户确认下一步。',
      visibleMessage
    }
  }

  if (details?.kind === 'cancelled') {
    return {
      action: 'ask_user',
      reason: '子 agent 通过 typed details 报告本轮执行已取消，主 agent 应与用户确认是否关闭任务。',
      visibleMessage
    }
  }

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
