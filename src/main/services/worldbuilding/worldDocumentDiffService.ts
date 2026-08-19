import { createHash } from 'node:crypto'
import type {
  WorldDocumentContentDiff,
  WorldDocumentDiffHunk,
  WorldDocumentDiffLine,
  WorldDocumentEditSourceFormat
} from '@share/cache/worldbuilding/worldDocumentHistory'
import { worldDocumentHtmlToMarkdown } from '../aiservice/ai-utils/tools/document/worldDocumentMarkdownCodec'
import {
  worldDocumentMarkdownHeadingToVisibleText,
  worldDocumentMarkdownLineToVisibleText
} from '@share/cache/worldbuilding/worldDocumentSemanticAnchor'

export type DocumentDiffSource = {
  format: WorldDocumentEditSourceFormat
  content: string
}

const MAX_DYNAMIC_CELLS = 250_000
const MAX_RESULT_LINES = 400
const CONTEXT_LINES = 3

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
      (left >= before.length || cells[left * width + right + 1] > cells[(left + 1) * width + right])
    ) {
      result.push({ kind: 'added', text: after[right] })
      right += 1
    } else {
      result.push({ kind: 'removed', text: before[left] })
      left += 1
    }
  }
}

const resolveHeadingPaths = (lines: string[]): string[][] => {
  const headings: string[] = []
  let fenced = false
  return lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (!fenced) {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
      if (match) {
        const level = match[1].length
        headings.splice(level - 1)
        headings[level - 1] = worldDocumentMarkdownHeadingToVisibleText(
          match[2].replace(/\s+#+\s*$/, '')
        )
      }
    }
    return headings.filter(Boolean)
  })
}

const buildAnchorTexts = (lines: WorldDocumentDiffLine[]): string[] => {
  const changedIndex = lines.findIndex((line) => line.kind !== 'context')
  const candidates = [
    ...lines.filter((line) => line.kind === 'added'),
    ...lines.slice(Math.max(0, changedIndex)).filter((line) => line.kind === 'context'),
    ...lines.slice(0, Math.max(0, changedIndex)).reverse().filter((line) => line.kind === 'context')
  ]
  return [
    ...new Set(
      candidates.map((line) => worldDocumentMarkdownLineToVisibleText(line.text)).filter(Boolean)
    )
  ].slice(0, 5)
}

const buildHunks = (
  lines: WorldDocumentDiffLine[],
  afterLines: string[]
): { hunks: WorldDocumentDiffHunk[]; truncated: boolean } => {
  const changed = lines.flatMap((line, index) => (line.kind === 'context' ? [] : [index]))
  if (changed.length === 0) return { hunks: [], truncated: false }

  const ranges: Array<{ start: number; end: number }> = []
  for (const index of changed) {
    const start = Math.max(0, index - CONTEXT_LINES)
    const end = Math.min(lines.length, index + CONTEXT_LINES + 1)
    const previous = ranges.at(-1)
    if (previous && start <= previous.end) previous.end = Math.max(previous.end, end)
    else ranges.push({ start, end })
  }

  const headingPaths = resolveHeadingPaths(afterLines)
  const hunks: WorldDocumentDiffHunk[] = []
  let usedLines = 0
  let truncated = false
  for (const range of ranges) {
    const hunkLines = lines.slice(range.start, range.end)
    if (usedLines + hunkLines.length > MAX_RESULT_LINES) {
      truncated = true
      break
    }
    usedLines += hunkLines.length
    const newStart = hunkLines.find((line) => line.kind !== 'removed')
      ? lines.slice(0, range.start).filter((line) => line.kind !== 'removed').length + 1
      : Math.max(1, lines.slice(0, range.start).filter((line) => line.kind !== 'removed').length)
    const headingPath = headingPaths[Math.max(0, newStart - 1)]
    const anchorTexts = buildAnchorTexts(hunkLines)
    hunks.push({
      ...(headingPath?.length ? { headingPath } : {}),
      anchorTexts,
      anchorHash: createHash('sha256')
        .update(JSON.stringify({ headingPath: headingPath ?? [], anchorTexts }))
        .digest('hex'),
      lines: hunkLines
    })
  }
  return { hunks, truncated }
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
  const hunkResult = buildHunks(result, afterLines)
  return {
    beforeFormat: before?.format,
    afterFormat: after?.format,
    hunks: hunkResult.hunks,
    addedLines,
    removedLines,
    truncated: hunkResult.truncated
  }
}
