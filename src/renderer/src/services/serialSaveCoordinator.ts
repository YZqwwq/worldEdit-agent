export type SaveSnapshot = {
  signature: string
}

export type SaveRequest<TSnapshot extends SaveSnapshot> = {
  mode: 'once' | 'flush'
  readSnapshot: () => TSnapshot | null
  isSaved: (snapshot: TSnapshot) => boolean
  persist: (snapshot: TSnapshot) => Promise<void>
}

export class SerialSaveCoordinator<TSnapshot extends SaveSnapshot> {
  private inFlight: Promise<void> | null = null

  get isSaving(): boolean {
    return this.inFlight !== null
  }

  async request(input: SaveRequest<TSnapshot>): Promise<number> {
    let persistedCount = 0

    while (true) {
      if (this.inFlight) {
        await this.inFlight
      }

      const snapshot = input.readSnapshot()
      if (!snapshot || input.isSaved(snapshot)) return persistedCount

      const operation = Promise.resolve().then(() => input.persist(snapshot))
      this.inFlight = operation
      try {
        await operation
        persistedCount += 1
      } finally {
        if (this.inFlight === operation) this.inFlight = null
      }

      if (input.mode === 'once') return persistedCount
    }
  }
}

export class SerialSessionCommitter {
  private activeSessionId: string
  private readonly changedSessionIds = new Set<string>()
  private readonly pendingSessionIds: string[] = []
  private inFlight: Promise<void> | null = null

  constructor(
    private readonly createSessionId: () => string,
    private readonly commitSession: (sessionId: string) => Promise<void>
  ) {
    this.activeSessionId = createSessionId()
  }

  get sessionId(): string {
    return this.activeSessionId
  }

  markChanged(sessionId: string): void {
    this.changedSessionIds.add(sessionId)
  }

  async commitPending(): Promise<void> {
    this.queueChangedSessions()

    while (this.pendingSessionIds.length > 0 || this.inFlight) {
      if (this.inFlight) {
        await this.inFlight
        continue
      }

      const sessionId = this.pendingSessionIds[0]
      const operation = this.commitSession(sessionId)
      this.inFlight = operation
      try {
        await operation
        if (this.pendingSessionIds[0] === sessionId) this.pendingSessionIds.shift()
      } finally {
        if (this.inFlight === operation) this.inFlight = null
      }
    }
  }

  private queueChangedSessions(): void {
    if (this.changedSessionIds.has(this.activeSessionId)) {
      this.activeSessionId = this.createSessionId()
    }
    for (const sessionId of this.changedSessionIds) {
      if (!this.pendingSessionIds.includes(sessionId)) this.pendingSessionIds.push(sessionId)
    }
    this.changedSessionIds.clear()
  }
}
