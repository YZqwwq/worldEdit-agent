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
