export const trimOr = (value: string | null | undefined, fallback: string): string => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

export const indentBlock = (text: string | null | undefined): string | null => {
  const trimmed = text?.trim()
  if (!trimmed) return null
  return trimmed
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')
}

export const formatField = (key: string, value: string | null | undefined): string | null => {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return `${key}: ${trimmed}`
}

export const classifyScale = (
  value: number | null | undefined,
  bands: { low: string; mid: string; high: string }
): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) return bands.mid
  if (value >= 0.7) return bands.high
  if (value <= 0.38) return bands.low
  return bands.mid
}
