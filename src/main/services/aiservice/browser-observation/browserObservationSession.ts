import { BrowserWindow, session } from 'electron'
import type {
  BrowserObservationEvaluateInput,
  BrowserObservationPageImageSnapshot,
  BrowserObservationPageTextSnapshot,
  BrowserObservationOpenInput,
  BrowserObservationScriptSnapshot
} from '@share/cache/AItype/states/browserObservation'

const OBSERVATION_PARTITION = 'browser-observation'
const DEFAULT_TIMEOUT_MS = 15000
const MAX_TEXT_LENGTH = 12000

const waitFor = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const normalizeUrl = (input: string): string => {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('URL is required.')
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  return `https://${trimmed}`
}

const toTimeoutMs = (value: number | undefined): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_TIMEOUT_MS
  }

  return Math.min(60000, Math.max(3000, Math.round(value as number)))
}

type RawPageSnapshot = {
  title: string
  text: string
}

const normalizeScriptResult = (value: unknown): unknown => {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeScriptResult(item))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        normalizeScriptResult(item)
      ])
    )
  }

  return String(value)
}

const buildPageSnapshotScript = (maxTextLength: number): string => `
  (() => {
    const bodyText = document.body?.innerText || document.documentElement?.innerText || ''
    const normalized = bodyText.replace(/\\s+/g, ' ').trim().slice(0, ${maxTextLength})
    return {
      title: document.title || '',
      text: normalized
    }
  })()
`

export class BrowserObservationSession {
  private window: BrowserWindow | null = null

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window
    }

    this.window = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        sandbox: false,
        partition: OBSERVATION_PARTITION
      }
    })

    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    return this.window
  }

  private async loadUrl(input: BrowserObservationOpenInput): Promise<BrowserWindow> {
    const browserWindow = this.ensureWindow()
    const url = normalizeUrl(input.url)
    const timeoutMs = toTimeoutMs(input.timeoutMs)
    const customUserAgent = input.userAgent?.trim()

    if (customUserAgent) {
      browserWindow.webContents.setUserAgent(customUserAgent)
    }

    const loadPromise = browserWindow.loadURL(url)
    await Promise.race([
      loadPromise,
      waitFor(timeoutMs).then(() => {
        throw new Error(`Timed out while loading page after ${timeoutMs}ms: ${url}`)
      })
    ])

    return browserWindow
  }

  async capturePageText(
    input: BrowserObservationOpenInput
  ): Promise<BrowserObservationPageTextSnapshot> {
    const requestedUrl = normalizeUrl(input.url)
    const browserWindow = await this.loadUrl(input)
    const raw = (await browserWindow.webContents.executeJavaScript(
      buildPageSnapshotScript(MAX_TEXT_LENGTH)
    )) as RawPageSnapshot

    return {
      requestedUrl,
      finalUrl: browserWindow.webContents.getURL() || requestedUrl,
      title: typeof raw?.title === 'string' ? raw.title.trim() : '',
      text: typeof raw?.text === 'string' ? raw.text.trim() : '',
      capturedAt: new Date().toISOString()
    }
  }

  async capturePageImage(
    input: BrowserObservationOpenInput
  ): Promise<BrowserObservationPageImageSnapshot> {
    const requestedUrl = normalizeUrl(input.url)
    const browserWindow = await this.loadUrl(input)
    const image = await browserWindow.webContents.capturePage()
    const size = image.getSize()

    return {
      requestedUrl,
      finalUrl: browserWindow.webContents.getURL() || requestedUrl,
      dataUrl: image.toDataURL(),
      width: size.width,
      height: size.height,
      capturedAt: new Date().toISOString()
    }
  }

  async evaluatePageScript(
    input: BrowserObservationEvaluateInput
  ): Promise<BrowserObservationScriptSnapshot> {
    const requestedUrl = normalizeUrl(input.url)
    const browserWindow = await this.loadUrl(input)
    const timeoutMs = toTimeoutMs(input.timeoutMs)
    const script = input.script.trim()

    if (!script) {
      throw new Error('Script is required.')
    }

    const rawResult = await Promise.race([
      browserWindow.webContents.executeJavaScript(script),
      waitFor(timeoutMs).then(() => {
        throw new Error(`Timed out while executing page script after ${timeoutMs}ms: ${requestedUrl}`)
      })
    ])

    return {
      requestedUrl,
      finalUrl: browserWindow.webContents.getURL() || requestedUrl,
      result: normalizeScriptResult(rawResult),
      capturedAt: new Date().toISOString()
    }
  }

  async clearStorageData(): Promise<void> {
    const isolatedSession = session.fromPartition(OBSERVATION_PARTITION)
    await isolatedSession.clearStorageData()
    await isolatedSession.clearCache()
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy()
    }
    this.window = null
  }
}
