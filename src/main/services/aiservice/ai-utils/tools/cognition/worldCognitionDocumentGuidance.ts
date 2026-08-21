import type {
  AgentWorldCognitionNodeStatus,
  WorldCognitionDocumentRef
} from '@share/cache/worldbuilding/agentWorldCognition'

export type WorldCognitionDocumentHint = {
  nodeId: string
  title: string
  revision: number
  status: AgentWorldCognitionNodeStatus
  documentRefs: WorldCognitionDocumentRef[]
}

export type WorldCognitionDocumentGuidance = {
  matchedNodeCount: number
  hints: WorldCognitionDocumentHint[]
  recommendedDocumentIds: string[]
  needsReviewNodeIds: string[]
}

export const EMPTY_WORLD_COGNITION_DOCUMENT_GUIDANCE: WorldCognitionDocumentGuidance = {
  matchedNodeCount: 0,
  hints: [],
  recommendedDocumentIds: [],
  needsReviewNodeIds: []
}

export const applyWorldCognitionDocumentGuidance = <TMatch extends { documentId: string }>(
  documentMatches: TMatch[],
  cognitionHints: WorldCognitionDocumentHint[],
  existingDocumentIds: Iterable<string>
): { matches: TMatch[]; guidance: WorldCognitionDocumentGuidance } => {
  const existing = new Set(existingDocumentIds)
  const availableHints = cognitionHints.filter((hint) => hint.status === 'available')
  const recommendedDocumentIds = [
    ...new Set(
      availableHints.flatMap((hint) =>
        hint.documentRefs
          .map((ref) => ref.documentId)
          .filter((documentId) => existing.has(documentId))
      )
    )
  ]
  const priority = new Map(recommendedDocumentIds.map((documentId, index) => [documentId, index]))
  const matches = documentMatches
    .map((match, index) => ({ match, index }))
    .sort((left, right) => {
      const leftPriority = priority.get(left.match.documentId)
      const rightPriority = priority.get(right.match.documentId)
      if (leftPriority !== undefined || rightPriority !== undefined) {
        if (leftPriority === undefined) return 1
        if (rightPriority === undefined) return -1
        if (leftPriority !== rightPriority) return leftPriority - rightPriority
      }
      return left.index - right.index
    })
    .map(({ match }) => match)

  return {
    matches,
    guidance: {
      matchedNodeCount: cognitionHints.length,
      hints: cognitionHints,
      recommendedDocumentIds,
      needsReviewNodeIds: cognitionHints
        .filter((hint) => hint.status === 'needs_review')
        .map((hint) => hint.nodeId)
    }
  }
}
