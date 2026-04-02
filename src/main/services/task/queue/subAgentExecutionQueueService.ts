import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons'
import { subAgentDispatcherService } from '../subAgentDispatcherService'
import { taskExecutionService } from '../taskExecutionService'

class SubAgentExecutionQueueService {
  private readonly queue: number[] = []
  private readonly queuedExecutionIds = new Set<number>()
  private scheduled = false
  private draining = false

  async enqueueExecution(executionId: number): Promise<void> {
    if (this.queuedExecutionIds.has(executionId)) {
      return
    }

    this.queuedExecutionIds.add(executionId)
    this.queue.push(executionId)
    this.scheduleDrain()
  }

  async enqueueQueuedExecutions(): Promise<void> {
    const queuedRuns = await taskExecutionService.listRunsByStatus(['queued'])
    for (const run of queuedRuns) {
      await this.enqueueExecution(run.id)
    }
  }

  private scheduleDrain(): void {
    if (this.scheduled || this.draining) {
      return
    }

    this.scheduled = true
    setImmediate(() => {
      this.scheduled = false
      void AsyncLocalStorageProviderSingleton.runWithConfig({}, async () => {
        await this.drain()
      }, true)
    })
  }

  private async drain(): Promise<void> {
    if (this.draining) {
      return
    }

    this.draining = true
    try {
      while (this.queue.length > 0) {
        const executionId = this.queue.shift()
        if (typeof executionId !== 'number') {
          continue
        }

        try {
          await subAgentDispatcherService.dispatchExecution(executionId)
        } catch (error) {
          console.error(`Failed to dispatch queued sub-agent execution #${executionId}:`, error)
        } finally {
          this.queuedExecutionIds.delete(executionId)
        }
      }
    } finally {
      this.draining = false
      if (this.queue.length > 0) {
        this.scheduleDrain()
      }
    }
  }
}

export const subAgentExecutionQueueService = new SubAgentExecutionQueueService()
