import type { TaskStatus } from './taskLifecycleState'

type TaskTransitionMap = Record<TaskStatus, TaskStatus[]>

export const TASK_STATUS_TRANSITIONS: TaskTransitionMap = {
  active: ['running', 'cancelled'],
  running: ['pending_main_ack', 'cancelled'],
  pending_main_ack: ['awaiting_user_input', 'awaiting_user_confirmation', 'cancelled'],
  awaiting_user_input: ['running', 'cancelled'],
  awaiting_user_confirmation: ['done', 'cancelled'],
  done: [],
  cancelled: []
}

export const canTransitionTaskStatus = (from: TaskStatus, to: TaskStatus): boolean => {
  if (from === to) {
    return true
  }

  return TASK_STATUS_TRANSITIONS[from].includes(to)
}

export const assertTaskStatusTransition = (from: TaskStatus, to: TaskStatus): void => {
  if (canTransitionTaskStatus(from, to)) {
    return
  }

  throw new Error(`Invalid task status transition: ${from} -> ${to}`)
}
