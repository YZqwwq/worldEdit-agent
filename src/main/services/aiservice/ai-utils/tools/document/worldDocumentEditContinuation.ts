import type { MarkdownEditLocation } from './worldDocumentMarkdownEditEngine'

export type WorldDocumentLocalEditOperation =
  | 'replace_text'
  | 'insert_text'
  | 'append_text'
  | 'replace_section'

export const buildWorldDocumentEditContinuation = (input: {
  operation: WorldDocumentLocalEditOperation
  document: {
    id: string
    title: string
    revision: number
  }
  changeSummary: string
  location: MarkdownEditLocation
  diffRef: string
  addedLines: number
  removedLines: number
}) => ({
  completed: {
    operation: input.operation,
    changeSummary: input.changeSummary,
    documentId: input.document.id,
    documentTitle: input.document.title,
    resultingRevision: input.document.revision,
    diffRef: input.diffRef,
    addedLines: input.addedLines,
    removedLines: input.removedLines
  },
  continuation: {
    documentId: input.document.id,
    expectedRevisionForNextWrite: input.document.revision,
    knownCurrentState: true,
    ...(input.location.headingPath?.length
      ? { currentHeadingPath: input.location.headingPath }
      : {}),
    ...(input.location.sectionHash ? { currentSectionHash: input.location.sectionHash } : {}),
    ...(input.location.markdownAnchorText
      ? { uniqueMarkdownAnchor: input.location.markdownAnchorText }
      : {}),
    guidance: [
      'Use expectedRevisionForNextWrite for the next write to this document.',
      'Do not repeat the completed operation.',
      'Use uniqueMarkdownAnchor only when it is present; it is known to be unique in the resulting Markdown.',
      'Re-read the document or section after a revision conflict, stale section hash, or missing anchor.'
    ]
  }
})
