type EnqueueTaskNotificationInput = {
  taskId: number
  notificationId: number
}

type DispatchBridgeHandlers = {
  enqueueTaskNotification?: (input: EnqueueTaskNotificationInput) => Promise<void>
}

class TaskNotificationDispatchBridge {
  private handlers: DispatchBridgeHandlers = {}

  configure(handlers: DispatchBridgeHandlers): void {
    this.handlers = {
      ...this.handlers,
      ...handlers
    }
  }

  async enqueueTaskNotification(input: EnqueueTaskNotificationInput): Promise<void> {
    if (!this.handlers.enqueueTaskNotification) {
      throw new Error('TaskNotificationDispatchBridge is missing enqueueTaskNotification handler.')
    }
    await this.handlers.enqueueTaskNotification(input)
  }
}

export const taskNotificationDispatchBridge = new TaskNotificationDispatchBridge()
