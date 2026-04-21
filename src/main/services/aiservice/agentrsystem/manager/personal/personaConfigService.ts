import { readFile } from 'node:fs/promises'
import type { PersonaConfig } from '@share/cache/AItype/states/personaConfig'
import {
  getPersonaConfigFallbackPath,
  getPersonaConfigPath
} from '../../../../../config/pathConfig'

const defaultPersonaConfig = (): PersonaConfig => ({
  decay: {
    sessionFactor: 0.88,
    transientFactor: 0.52
  },
  layerWeights: {
    session: 0.35,
    transient: 0.18
  },
  learningRates: {
    stableFromSignal: 0.32,
    sessionFromSignal: 0.55,
    transientFromInterrupt: 0.12,
    transientFromRevert: 0.1
  },
  slot: {
    userMoodRetentionObservations: 6,
    currentFocusLimit: 5,
    recentReferenceLimit: 6,
    preferencePromotionThreshold: 0.55
  },
  signalRules: [],
  moodRules: [],
  taskObservationEffects: []
})

class PersonaConfigService {
  private cache: PersonaConfig | null = null

  async getConfig(): Promise<PersonaConfig> {
    if (this.cache) {
      return this.cache
    }

    const candidates = [getPersonaConfigPath(), getPersonaConfigFallbackPath()]
    for (const candidate of candidates) {
      try {
        const text = await readFile(candidate, 'utf-8')
        const parsed = JSON.parse(text) as PersonaConfig
        this.cache = {
          ...defaultPersonaConfig(),
          ...parsed
        }
        this.cache.slot = {
          ...defaultPersonaConfig().slot,
          ...(parsed.slot ?? {})
        }
        return this.cache
      } catch {
        // ignore and try next candidate
      }
    }

    this.cache = defaultPersonaConfig()
    return this.cache
  }

  clearCache(): void {
    this.cache = null
  }
}

export const personaConfigService = new PersonaConfigService()
