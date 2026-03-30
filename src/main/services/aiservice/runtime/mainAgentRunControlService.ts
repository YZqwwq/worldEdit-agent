export type ActiveMainAgentRunSnapshot = {
  eventId: string
  turnId: number
  startedAt: number
}

class MainAgentRunControlService {
  private activeRun:
    | {
        eventId: string
        turnId: number
        controller: AbortController
        startedAt: number
      }
    | null = null

  startRun(input: { eventId: string; turnId: number }): AbortController {
    const controller = new AbortController()
    this.activeRun = {
      eventId: input.eventId,
      turnId: input.turnId,
      controller,
      startedAt: Date.now()
    }
    return controller
  }

  finishRun(eventId: string): void {
    if (this.activeRun?.eventId === eventId) {
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

  reset(): void {
    this.activeRun = null
  }
}

export const mainAgentRunControlService = new MainAgentRunControlService()
