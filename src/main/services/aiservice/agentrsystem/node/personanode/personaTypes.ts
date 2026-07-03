import type { PersonaSignalCategory } from '@share/cache/AItype/states/personaConfig'

export type SignalCategory = PersonaSignalCategory

export type PersonaSignal = {
  category: SignalCategory
  user_signal: string
  impact: string
  delta: number
}
