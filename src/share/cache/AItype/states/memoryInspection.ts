import type { MemorySnapshot } from './memoryState'
import type { PersonaState } from './personalState'

export interface MemoryInspectionPayload {
  memory: MemorySnapshot
  persona: PersonaState | null
}
