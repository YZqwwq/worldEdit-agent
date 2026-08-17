export type WorldDocumentHistoryOrigin = 'agent' | 'human' | 'system'
export type WorldDocumentHistoryOperation = 'create' | 'update' | 'move' | 'delete' | 'mixed'
export type WorldDocumentEditSourceFormat = 'markdown' | 'html_editor'

export type WorldDocumentHistoryNodeState = {
  documentId: string
  ownerKind: 'world' | 'entity'
  ownerEntityId: string | null
  parentDocumentId: string | null
  title: string
  sortKey: string
  revision: number
}

export type WorldDocumentDiffLine = {
  kind: 'context' | 'added' | 'removed'
  text: string
}

export type WorldDocumentContentDiff = {
  beforeFormat?: WorldDocumentEditSourceFormat
  afterFormat?: WorldDocumentEditSourceFormat
  lines: WorldDocumentDiffLine[]
  addedLines: number
  removedLines: number
  truncated: boolean
}

export type WorldDocumentCommitSummary = {
  id: string
  worldId: string
  sequence: number
  parentCommitId: string | null
  origin: WorldDocumentHistoryOrigin
  summary: string
  changeCount: number
  documentIds: string[]
  operations: WorldDocumentHistoryOperation[]
  createdAt: string
}

export type WorldDocumentCommitHistoryPayload = {
  headCommitId?: string
  commits: WorldDocumentCommitSummary[]
}

export type WorldDocumentCommitChangePayload = {
  id: string
  documentId: string
  operation: WorldDocumentHistoryOperation
  summary: string
  before?: WorldDocumentHistoryNodeState
  after?: WorldDocumentHistoryNodeState
  contentDiff?: WorldDocumentContentDiff
}

export type WorldDocumentCommitDetailPayload = {
  commit: WorldDocumentCommitSummary
  changes: WorldDocumentCommitChangePayload[]
}

export type RestoreWorldDocumentCommitInput = {
  targetCommitId: string
  expectedHeadCommitId: string
}

export type RestoreWorldDocumentCommitResult = {
  commit: WorldDocumentCommitSummary
  affectedDocumentIds: string[]
}
