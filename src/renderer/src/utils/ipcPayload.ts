import { toRaw } from 'vue'

export const toPlainIpcPayload = <T>(value: T): T => {
  const rawValue = toRaw(value)

  if (typeof structuredClone === 'function') {
    return structuredClone(rawValue)
  }

  return JSON.parse(JSON.stringify(rawValue)) as T
}
