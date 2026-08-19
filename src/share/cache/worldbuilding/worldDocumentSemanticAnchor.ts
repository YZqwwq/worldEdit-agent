const decodeMarkdownEntity = (entity: string): string => {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"'
  }
  if (entity.startsWith('#x') || entity.startsWith('#X')) {
    const value = Number.parseInt(entity.slice(2), 16)
    return Number.isFinite(value) && value >= 0 && value <= 0x10ffff
      ? String.fromCodePoint(value)
      : `&${entity};`
  }
  if (entity.startsWith('#')) {
    const value = Number.parseInt(entity.slice(1), 10)
    return Number.isFinite(value) && value >= 0 && value <= 0x10ffff
      ? String.fromCodePoint(value)
      : `&${entity};`
  }
  return named[entity] ?? `&${entity};`
}

export const normalizeWorldDocumentVisibleText = (value: string): string =>
  String(value ?? '')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const markdownInlineToVisibleText = (value: string): string =>
  String(value ?? '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<((?:https?:\/\/|mailto:)[^>]+)>/g, '$1')
    .replace(/\\([\\`*{}\[\]()#+\-.!_>~|])/g, '$1')
    .replace(/[*_~`]/g, '')
    .replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (_, entity: string) =>
      decodeMarkdownEntity(entity.toLowerCase())
    )

export const worldDocumentMarkdownHeadingToVisibleText = (value: string): string =>
  normalizeWorldDocumentVisibleText(markdownInlineToVisibleText(value))

export const worldDocumentMarkdownLineToVisibleText = (value: string): string => {
  const withoutBlockPrefix = String(value ?? '')
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^\s*(?:>\s*)+/, '')
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/, '')
    .replace(/^\s*\[[ xX]\]\s+/, '')
    .replace(/\s+#+\s*$/, '')
  return worldDocumentMarkdownHeadingToVisibleText(withoutBlockPrefix)
}

export const findWorldDocumentVisibleTextOffset = (
  visibleText: string,
  anchorText: string
): number => {
  const source = String(visibleText ?? '')
  const normalizedChars: string[] = []
  const sourceOffsets: number[] = []
  let whitespacePending = false
  let whitespaceOffset = 0

  for (let index = 0; index < source.length; index += 1) {
    if (/[\u200b-\u200d\ufeff]/.test(source[index])) continue
    const character = source[index] === '\u00a0' ? ' ' : source[index]
    if (/\s/.test(character)) {
      if (normalizedChars.length && !whitespacePending) whitespaceOffset = index
      whitespacePending = normalizedChars.length > 0
      continue
    }
    if (whitespacePending) {
      normalizedChars.push(' ')
      sourceOffsets.push(whitespaceOffset)
      whitespacePending = false
    }
    normalizedChars.push(character)
    sourceOffsets.push(index)
  }

  const normalizedAnchor = normalizeWorldDocumentVisibleText(anchorText)
  if (!normalizedAnchor) return -1
  const normalizedOffset = normalizedChars.join('').indexOf(normalizedAnchor)
  return normalizedOffset < 0 ? -1 : sourceOffsets[normalizedOffset]
}
