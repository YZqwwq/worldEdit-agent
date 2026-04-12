import type { MemorySnapshot } from './memoryState'
import type { MemorySlotSnapshot } from './memorySlots'
import type { PersonaState } from './personalState'

export interface MemoryInspectionPayload {
  memory: MemorySnapshot
  slots: MemorySlotSnapshot
  persona: PersonaState | null
}
