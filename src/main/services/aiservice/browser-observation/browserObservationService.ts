import type {
  BrowserObservationEvaluateInput,
  BrowserObservationPageImageSnapshot,
  BrowserObservationOpenInput,
  BrowserObservationPageTextSnapshot,
  BrowserObservationScriptSnapshot
} from '@share/cache/AItype/states/browserObservation'
import { BrowserObservationSession } from './browserObservationSession'

class BrowserObservationService {
  private readonly session = new BrowserObservationSession()

  async observePageText(
    input: BrowserObservationOpenInput
  ): Promise<BrowserObservationPageTextSnapshot> {
    return this.session.capturePageText(input)
  }

  async capturePageImage(
    input: BrowserObservationOpenInput
  ): Promise<BrowserObservationPageImageSnapshot> {
    return this.session.capturePageImage(input)
  }

  async runPageScript(
    input: BrowserObservationEvaluateInput
  ): Promise<BrowserObservationScriptSnapshot> {
    return this.session.evaluatePageScript(input)
  }

  async reset(): Promise<void> {
    await this.session.clearStorageData()
    this.session.destroy()
  }

  destroy(): void {
    this.session.destroy()
  }
}

export const browserObservationService = new BrowserObservationService()
