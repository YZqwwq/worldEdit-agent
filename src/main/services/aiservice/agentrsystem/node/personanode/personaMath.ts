export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

export const clamp01 = (value: number): number => clamp(value, 0, 1)

export const roundTo = (value: number, digits = 3): number => Number(value.toFixed(digits))

export const roundSigned = (value: number): number => roundTo(clamp(value, -1, 1))

export const roundUnit = (value: number): number => roundTo(clamp01(value))
