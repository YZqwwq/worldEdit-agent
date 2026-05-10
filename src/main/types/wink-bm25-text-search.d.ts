declare module 'wink-bm25-text-search' {
  export type WinkBm25Document = Record<string, unknown>

  export interface WinkBm25Engine {
    defineConfig(config: Record<string, unknown>): void
    definePrepTasks(tasks: Array<(text: string) => string[]>, field?: string): number
    addDoc(doc: WinkBm25Document, uniqueId: string | number): void
    consolidate(fp?: number): void
    search(text: string, limit?: number): Array<[string | number, number]>
    reset(): void
  }

  function createBm25Engine(): WinkBm25Engine

  export = createBm25Engine
}
