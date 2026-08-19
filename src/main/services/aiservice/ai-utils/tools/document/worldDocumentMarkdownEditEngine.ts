import { createHash } from 'node:crypto'
import {
  worldDocumentMarkdownHeadingToVisibleText,
  worldDocumentMarkdownLineToVisibleText
} from '../../../../../../share/cache/worldbuilding/worldDocumentSemanticAnchor'

export type MarkdownSectionLocator = {
  headingPath: string[]
  startLine: number
  endLine: number
  hash: string
}

export type MarkdownEditLocation = {
  headingPath?: string[]
  anchorText?: string
  markdownAnchorText?: string
  sectionHash?: string
  anchorHash: string
}

export class MarkdownEditConflictError extends Error {
  readonly code = 'INVALID_TOOL_INPUT'
  readonly retryable = true

  constructor(
    message: string,
    readonly constraint:
      | 'anchor_not_found'
      | 'anchor_not_unique'
      | 'section_not_found'
      | 'section_not_unique'
      | 'section_hash_mismatch',
    readonly details: Record<string, unknown>
  ) {
    super(message)
    this.name = 'MarkdownEditConflictError'
  }
}

const normalize = (value: string): string => String(value ?? '').replace(/\r\n?/g, '\n')
const hash = (value: string): string => createHash('sha256').update(value).digest('hex')
const lineAtOffset = (value: string, offset: number): number =>
  value.slice(0, Math.max(0, offset)).split('\n').length

const countOccurrences = (source: string, target: string): number => {
  if (!target) return 0
  let count = 0
  let offset = source.indexOf(target)
  while (offset >= 0) {
    count += 1
    offset = source.indexOf(target, offset + Math.max(1, target.length))
  }
  return count
}

const headingPathAtLine = (markdown: string, targetLine: number): string[] => {
  const path: string[] = []
  let fenced = false
  for (const [index, line] of normalize(markdown).split('\n').entries()) {
    if (index + 1 > targetLine) break
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (fenced) continue
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (!match) continue
    const level = match[1].length
    path.splice(level - 1)
    path[level - 1] = worldDocumentMarkdownHeadingToVisibleText(
      match[2].replace(/\s+#+\s*$/, '')
    )
  }
  return path.filter(Boolean)
}

const buildRange = (
  after: string,
  startOffset: number,
  newText: string
): MarkdownEditLocation => {
  const newStartLine = lineAtOffset(after, startOffset)
  const newEndLine = newStartLine + Math.max(0, normalize(newText).split('\n').length - 1)
  const headingPath = headingPathAtLine(after, newStartLine)
  const anchorLines = normalize(after)
    .split('\n')
    .slice(Math.max(0, newStartLine - 2), newEndLine + 1)
  const rawAnchorText = normalize(newText)
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)
  const anchorText = rawAnchorText
    ? worldDocumentMarkdownLineToVisibleText(rawAnchorText)
    : undefined
  const currentSection = listMarkdownSections(after).find(
    (section) =>
      newStartLine >= section.startLine &&
      newStartLine <= section.endLine &&
      section.headingPath.length === headingPath.length &&
      section.headingPath.every((part, index) => part === headingPath[index])
  )
  return {
    ...(headingPath.length ? { headingPath } : {}),
    ...(anchorText ? { anchorText } : {}),
    ...(rawAnchorText && countOccurrences(after, rawAnchorText) === 1
      ? { markdownAnchorText: rawAnchorText }
      : {}),
    ...(currentSection ? { sectionHash: currentSection.hash } : {}),
    anchorHash: hash(anchorLines.join('\n'))
  }
}

export const replaceUniqueMarkdownText = (
  markdown: string,
  oldText: string,
  newText: string
): { markdown: string; location: MarkdownEditLocation } => {
  const source = normalize(markdown)
  const anchor = normalize(oldText)
  const replacement = normalize(newText)
  const matches: number[] = []
  if (anchor) {
    let offset = source.indexOf(anchor)
    while (offset >= 0) {
      matches.push(offset)
      offset = source.indexOf(anchor, offset + Math.max(1, anchor.length))
    }
  }
  if (matches.length === 0) {
    throw new MarkdownEditConflictError('未在文档中找到要替换的原文。', 'anchor_not_found', {
      matchCount: 0
    })
  }
  if (matches.length > 1) {
    throw new MarkdownEditConflictError(
      `要替换的原文在文档中出现 ${matches.length} 次，无法确定唯一位置。`,
      'anchor_not_unique',
      {
        matchCount: matches.length,
        lines: matches.slice(0, 10).map((offset) => lineAtOffset(source, offset))
      }
    )
  }
  const start = matches[0]
  const updated = source.slice(0, start) + replacement + source.slice(start + anchor.length)
  return { markdown: updated, location: buildRange(updated, start, replacement) }
}

const findUniqueAnchor = (source: string, anchor: string): number => {
  const matches: number[] = []
  if (anchor) {
    let offset = source.indexOf(anchor)
    while (offset >= 0) {
      matches.push(offset)
      offset = source.indexOf(anchor, offset + Math.max(1, anchor.length))
    }
  }
  if (matches.length === 0) {
    throw new MarkdownEditConflictError('未在文档中找到插入锚点。', 'anchor_not_found', {
      matchCount: 0
    })
  }
  if (matches.length > 1) {
    throw new MarkdownEditConflictError(
      `插入锚点在文档中出现 ${matches.length} 次，无法确定唯一位置。`,
      'anchor_not_unique',
      {
        matchCount: matches.length,
        lines: matches.slice(0, 10).map((offset) => lineAtOffset(source, offset))
      }
    )
  }
  return matches[0]
}

export const insertMarkdownText = (
  markdown: string,
  anchorText: string,
  insertedMarkdown: string,
  position: 'before' | 'after'
): { markdown: string; location: MarkdownEditLocation } => {
  const source = normalize(markdown)
  const anchor = normalize(anchorText)
  const insertion = normalize(insertedMarkdown)
  const anchorOffset = findUniqueAnchor(source, anchor)
  const insertOffset = position === 'before' ? anchorOffset : anchorOffset + anchor.length
  const updated = source.slice(0, insertOffset) + insertion + source.slice(insertOffset)
  return { markdown: updated, location: buildRange(updated, insertOffset, insertion) }
}

export const appendMarkdownText = (
  markdown: string,
  appendedMarkdown: string
): { markdown: string; location: MarkdownEditLocation } => {
  const source = normalize(markdown).trimEnd()
  const addition = normalize(appendedMarkdown).trim()
  const separator = source ? '\n\n' : ''
  const insertOffset = source.length + separator.length
  const updated = source + separator + addition
  return { markdown: updated, location: buildRange(updated, insertOffset, addition) }
}

export const listMarkdownSections = (markdown: string): MarkdownSectionLocator[] => {
  const lines = normalize(markdown).split('\n')
  const headings: Array<{ line: number; level: number; path: string[] }> = []
  const path: string[] = []
  let fenced = false
  for (const [index, line] of lines.entries()) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (fenced) continue
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (!match) continue
    const level = match[1].length
    path.splice(level - 1)
    path[level - 1] = worldDocumentMarkdownHeadingToVisibleText(
      match[2].replace(/\s+#+\s*$/, '')
    )
    headings.push({ line: index, level, path: path.filter(Boolean) })
  }
  return headings.map((heading, index) => {
    const next = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level)
    const endIndex = next?.line ?? lines.length
    return {
      headingPath: heading.path,
      startLine: heading.line + 1,
      endLine: endIndex,
      hash: hash(lines.slice(heading.line, endIndex).join('\n'))
    }
  })
}

export type MarkdownSectionContent = MarkdownSectionLocator & {
  contentMarkdown: string
}

export const readMarkdownSection = (
  markdown: string,
  headingPath: string[],
  expectedSectionHash?: string
): MarkdownSectionContent => {
  const source = normalize(markdown)
  const normalizedPath = headingPath.map(worldDocumentMarkdownHeadingToVisibleText)
  const pathMatches = listMarkdownSections(source).filter(
    (section) =>
      section.headingPath.length === normalizedPath.length &&
      section.headingPath.every((part, index) => part === normalizedPath[index])
  )
  if (pathMatches.length === 0) {
    throw new MarkdownEditConflictError('未找到指定的 Markdown 章节路径。', 'section_not_found', {
      headingPath: normalizedPath
    })
  }
  if (!expectedSectionHash && pathMatches.length > 1) {
    throw new MarkdownEditConflictError(
      '该标题路径对应多个章节，需要提供 section hash 以确定目标。',
      'section_not_unique',
      {
        headingPath: normalizedPath,
        currentSectionHashes: pathMatches.map((section) => section.hash)
      }
    )
  }
  const target = expectedSectionHash
    ? pathMatches.find((section) => section.hash === expectedSectionHash)
    : pathMatches[0]
  if (!target) {
    throw new MarkdownEditConflictError(
      '目标章节已被修改，需要重新读取后再编辑。',
      'section_hash_mismatch',
      {
        headingPath: normalizedPath,
        expectedSectionHash,
        currentSectionHashes: pathMatches.map((section) => section.hash)
      }
    )
  }
  const lines = source.split('\n')
  return {
    ...target,
    contentMarkdown: lines.slice(target.startLine - 1, target.endLine).join('\n')
  }
}

export const replaceMarkdownSection = (
  markdown: string,
  headingPath: string[],
  expectedSectionHash: string,
  replacementMarkdown: string
): { markdown: string; location: MarkdownEditLocation } => {
  const source = normalize(markdown)
  const target = readMarkdownSection(source, headingPath, expectedSectionHash)
  const lines = source.split('\n')
  const replacement = normalize(replacementMarkdown).trim()
  const beforeOffset =
    lines.slice(0, target.startLine - 1).join('\n').length + (target.startLine > 1 ? 1 : 0)
  const updatedLines = [
    ...lines.slice(0, target.startLine - 1),
    ...replacement.split('\n'),
    ...lines.slice(target.endLine)
  ]
  const updated = updatedLines.join('\n')
  return {
    markdown: updated,
    location: buildRange(updated, beforeOffset, replacement)
  }
}
