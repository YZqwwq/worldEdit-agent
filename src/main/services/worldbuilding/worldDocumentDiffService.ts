import type {
  WorldDocumentContentDiff,
  WorldDocumentDiffLine,
  WorldDocumentEditSourceFormat
} from '@share/cache/worldbuilding/worldDocumentHistory'
import { worldDocumentHtmlToMarkdown } from '../aiservice/ai-utils/tools/document/worldDocumentMarkdownCodec'

export type DocumentDiffSource = {
  format: WorldDocumentEditSourceFormat
  content: string
}

const MAX_DYNAMIC_CELLS = 250_000
const MAX_RESULT_LINES = 400

const toReadableSource = (source: DocumentDiffSource | null): string =>
  source?.format === 'html_editor'
    ? worldDocumentHtmlToMarkdown(source.content)
    : String(source?.content ?? '')
        .replace(/\r\n?/g, '\n')
        .trim()

const toLines = (value: string): string[] => (value ? value.split('\n') : [])

const appendLargeChange = (
  result: WorldDocumentDiffLine[],
  before: string[],
  after: string[]
): void => {
  result.push(...before.map((text) => ({ kind: 'removed' as const, text })))
  result.push(...after.map((text) => ({ kind: 'added' as const, text })))
}

const appendLcsChange = (
  result: WorldDocumentDiffLine[],
  before: string[],
  after: string[]
): void => {
  const width = after.length + 1
  const cells = new Uint32Array((before.length + 1) * width)
  for (let left = before.length - 1; left >= 0; left -= 1) {
    for (let right = after.length - 1; right >= 0; right -= 1) {
      const index = left * width + right
      cells[index] =
        before[left] === after[right]
          ? cells[(left + 1) * width + right + 1] + 1
          : Math.max(cells[(left + 1) * width + right], cells[left * width + right + 1])
    }
  }

  let left = 0
  let right = 0
  while (left < before.length || right < after.length) {
    if (left < before.length && right < after.length && before[left] === after[right]) {
      result.push({ kind: 'context', text: before[left] })
      left += 1
      right += 1
    } else if (
      right < after.length &&
      (left >= before.length ||
        cells[left * width + right + 1] > cells[(left + 1) * width + right])
    ) {
      result.push({ kind: 'added', text: after[right] })
      right += 1
    } else {
      result.push({ kind: 'removed', text: before[left] })
      left += 1
    }
  }
}

const truncateDiff = (
  lines: WorldDocumentDiffLine[]
): { lines: WorldDocumentDiffLine[]; truncated: boolean } => {
  if (lines.length <= MAX_RESULT_LINES) return { lines, truncated: false }
  const half = Math.floor((MAX_RESULT_LINES - 1) / 2)
  return {
    lines: [
      ...lines.slice(0, half),
      { kind: 'context', text: '… Diff 过长，中间内容已省略 …' },
      ...lines.slice(-half)
    ],
    truncated: true
  }
}

export const buildWorldDocumentContentDiff = (
  before: DocumentDiffSource | null,
  after: DocumentDiffSource | null
): WorldDocumentContentDiff | undefined => {
  if (!before && !after) return undefined
  if (before?.format === after?.format && before?.content === after?.content) return undefined

  const readableBefore = toReadableSource(before)
  const readableAfter = toReadableSource(after)
  if (readableBefore === readableAfter) return undefined
  const beforeLines = toLines(readableBefore)
  const afterLines = toLines(readableAfter)
  let prefix = 0
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const result: WorldDocumentDiffLine[] = beforeLines
    .slice(0, prefix)
    .map((text) => ({ kind: 'context', text }))
  const beforeMiddle = beforeLines.slice(prefix, beforeLines.length - suffix)
  const afterMiddle = afterLines.slice(prefix, afterLines.length - suffix)
  if (beforeMiddle.length * afterMiddle.length <= MAX_DYNAMIC_CELLS) {
    appendLcsChange(result, beforeMiddle, afterMiddle)
  } else {
    appendLargeChange(result, beforeMiddle, afterMiddle)
  }
  if (suffix > 0) {
    result.push(
      ...beforeLines.slice(beforeLines.length - suffix).map((text) => ({
        kind: 'context' as const,
        text
      }))
    )
  }

  const addedLines = result.filter((line) => line.kind === 'added').length
  const removedLines = result.filter((line) => line.kind === 'removed').length
  const truncated = truncateDiff(result)
  return {
    beforeFormat: before?.format,
    afterFormat: after?.format,
    lines: truncated.lines,
    addedLines,
    removedLines,
    truncated: truncated.truncated
  }
}
