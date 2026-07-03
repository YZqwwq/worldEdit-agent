import { roundTo } from '../../manager/personal/personalManager'

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

export const roundSigned = (value: number): number => roundTo(clamp(value, -1, 1))

export const roundUnit = (value: number): number => roundTo(clamp(value, 0, 1))
