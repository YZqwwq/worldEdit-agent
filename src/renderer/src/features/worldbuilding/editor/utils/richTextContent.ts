const htmlTagPattern = /<([a-z][\w-]*)(?:\s[^>]*)?>/i

const escapeHtml = (input: string): string =>
  input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const textToParagraphHtml = (input: string): string => {
  const trimmed = input.trim()
  if (!trimmed) return '<p></p>'

  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)

  return paragraphs.join('')
}

export const normalizeRichTextContent = (input: string | null | undefined): string => {
  const value = String(input || '')
  const trimmed = value.trim()

  if (!trimmed) return '<p></p>'
  if (htmlTagPattern.test(trimmed)) return trimmed

  return textToParagraphHtml(trimmed)
}
