export type BrowserObservationWaitUntil = 'load'

export interface BrowserObservationOpenInput {
  url: string
  waitUntil?: BrowserObservationWaitUntil
  timeoutMs?: number
  userAgent?: string
}

export interface BrowserObservationEvaluateInput extends BrowserObservationOpenInput {
  script: string
}

export interface BrowserObservationPageTextSnapshot {
  requestedUrl: string
  finalUrl: string
  title: string
  text: string
  capturedAt: string
}

export interface BrowserObservationPageImageSnapshot {
  requestedUrl: string
  finalUrl: string
  dataUrl: string
  width: number
  height: number
  capturedAt: string
}

export interface BrowserObservationScriptSnapshot {
  requestedUrl: string
  finalUrl: string
  result: unknown
  capturedAt: string
}
