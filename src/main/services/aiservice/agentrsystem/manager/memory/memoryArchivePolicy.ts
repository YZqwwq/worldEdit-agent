import type { MessageData } from '@share/cache/AItype/states/memoryState'

export const RUNTIME_SHORT_TERM_LIMIT = 8
export const RUNTIME_ARCHIVE_HARD_LIMIT = 6
export const SEMANTIC_ARCHIVE_REVIEW_MIN_MESSAGES = 4

export type ArchivePlan = {
  triggerKind: 'semantic_boundary' | 'runtime_hard_limit'
  messageCount: number
}

export const resolveArchivePlan = (
  archiveBuffer: MessageData[],
  semanticBoundarySequence?: number | null,
  hardLimit = RUNTIME_ARCHIVE_HARD_LIMIT
): ArchivePlan | null => {
  if (archiveBuffer.length >= hardLimit) {
    let endIndex = archiveBuffer.length - 1
    while (endIndex >= 0 && archiveBuffer[endIndex]?.role !== 'ai') endIndex--
    if (endIndex < 0) return null
    return {
      triggerKind: 'runtime_hard_limit',
      messageCount: endIndex + 1
    }
  }

  if (
    archiveBuffer.length < SEMANTIC_ARCHIVE_REVIEW_MIN_MESSAGES ||
    !Number.isFinite(semanticBoundarySequence)
  ) {
    return null
  }

  const endIndex = archiveBuffer.findIndex(
    (message) => message.sequence === semanticBoundarySequence
  )
  if (
    endIndex + 1 < SEMANTIC_ARCHIVE_REVIEW_MIN_MESSAGES ||
    archiveBuffer[endIndex]?.role !== 'ai'
  ) {
    return null
  }

  return {
    triggerKind: 'semantic_boundary',
    messageCount: endIndex + 1
  }
}
