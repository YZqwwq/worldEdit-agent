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
      }
    | null = null

  startRun(input: { eventId: string; turnId: number }): AbortController {
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
      resolveDone
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
      this.activeRun.resolveDone()
    }
    this.activeRun = null
  }
}

export const mainAgentRunControlService = new MainAgentRunControlService()
