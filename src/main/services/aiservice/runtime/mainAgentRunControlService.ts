export type ActiveMainAgentRunSnapshot = {
  eventId: string
  turnId: number
  startedAt: number
}

const waitFor = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

class MainAgentRunControlService {
  private activeRun:
    | {
        eventId: string
        turnId: number
        controller: AbortController
        startedAt: number
        donePromise: Promise<void>
        resolveDone: () => void
        durableToolExecutions: number
        durableToolWaiters: Set<() => void>
      }
    | null = null

  startRun(input: { eventId: string; turnId: number }): AbortController {
    if (this.activeRun) {
      throw new Error(
        `Main agent serial invariant violated: ${this.activeRun.eventId} is still running.`
      )
    }
    const controller = new AbortController()
    let resolveDone = () => {}
    const donePromise = new Promise<void>((resolve) => {
      resolveDone = resolve
    })
    this.activeRun = {
      eventId: input.eventId,
      turnId: input.turnId,
      controller,
      startedAt: Date.now(),
      donePromise,
      resolveDone,
      durableToolExecutions: 0,
      durableToolWaiters: new Set()
    }
    return controller
  }

  finishRun(eventId: string): void {
    if (this.activeRun?.eventId === eventId) {
      this.activeRun.resolveDone()
      this.activeRun = null
    }
  }

  interruptActiveRun(): boolean {
    if (!this.activeRun) {
      return false
    }

    this.activeRun.controller.abort('user_interrupted')
    return true
  }

  beginDurableToolExecution(): () => void {
    const activeRun = this.activeRun
    if (!activeRun) return () => undefined
    activeRun.durableToolExecutions += 1
    let finished = false
    return () => {
      if (finished) return
      finished = true
      activeRun.durableToolExecutions = Math.max(0, activeRun.durableToolExecutions - 1)
      if (activeRun.durableToolExecutions === 0) {
        for (const resolve of activeRun.durableToolWaiters) resolve()
        activeRun.durableToolWaiters.clear()
      }
    }
  }

  async waitForDurableToolExecutions(eventId: string): Promise<void> {
    const activeRun = this.activeRun
    if (!activeRun || activeRun.eventId !== eventId || activeRun.durableToolExecutions === 0) {
      return
    }
    await new Promise<void>((resolve) => {
      activeRun.durableToolWaiters.add(resolve)
    })
  }

  getActiveRunSnapshot(): ActiveMainAgentRunSnapshot | null {
    if (!this.activeRun) {
      return null
    }

    return {
      eventId: this.activeRun.eventId,
      turnId: this.activeRun.turnId,
      startedAt: this.activeRun.startedAt
    }
  }

  async abortAndWaitForIdle(timeoutMs = 5000): Promise<boolean> {
    const activeRun = this.activeRun
    if (!activeRun) {
      return true
    }

    activeRun.controller.abort('runtime_reset')
    await Promise.race([activeRun.donePromise, waitFor(timeoutMs)])
    return this.activeRun === null
  }

  reset(): void {
    if (this.activeRun) {
      this.activeRun.controller.abort('runtime_reset')
      for (const resolve of this.activeRun.durableToolWaiters) resolve()
      this.activeRun.durableToolWaiters.clear()
      this.activeRun.resolveDone()
    }
    this.activeRun = null
  }
}

export const mainAgentRunControlService = new MainAgentRunControlService()
