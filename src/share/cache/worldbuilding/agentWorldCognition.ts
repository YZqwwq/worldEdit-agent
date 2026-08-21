export const MAX_WORLD_COGNITION_MARKDOWN_LENGTH = 6000
export const MAX_WORLD_COGNITION_DOCUMENT_REFS = 20

export type AgentWorldCognitionNodeKind = 'dimension' | 'concept'
export type AgentWorldCognitionNodeStatus = 'available' | 'needs_review'

export type WorldCognitionDocumentRef = {
  documentId: string
  revision: number
}
