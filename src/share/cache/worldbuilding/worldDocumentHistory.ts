export type WorldDocumentHistoryOrigin = 'agent' | 'human' | 'system'
export type WorldDocumentHistoryOperation = 'create' | 'update' | 'move' | 'delete' | 'mixed'
export type WorldDocumentEditSourceFormat = 'markdown' | 'html_editor'

export type WorldDocumentHistoryNodeState = {
  documentId: string
  parentDocumentId: string | null
  title: string
  sortKey: string
  revision: number
}

export type WorldDocumentDiffLine = {
  kind: 'context' | 'added' | 'removed'
  text: string
}

export type WorldDocumentDiffHunk = {
  headingPath?: string[]
  anchorTexts: string[]
  anchorHash: string
  lines: WorldDocumentDiffLine[]
}

export type WorldDocumentContentDiff = {
  beforeFormat?: WorldDocumentEditSourceFormat
  afterFormat?: WorldDocumentEditSourceFormat
  hunks: WorldDocumentDiffHunk[]
  addedLines: number
  removedLines: number
  truncated: boolean
}

export type WorldDocumentDiffReferencePayload = {
  diffRef: string
  documentId: string
  beforeRevision: number
  afterRevision: number
  diff: WorldDocumentContentDiff
}

export type WorldDocumentCommitSummary = {
  id: string
  worldId: string
  branchId: string
  sequence: number
  parentCommitId: string | null
  mergeParentCommitId: string | null
  origin: WorldDocumentHistoryOrigin
  summary: string
  intent: string
  restoredFromCommitId: string | null
  changeCount: number
  documentIds: string[]
  operations: WorldDocumentHistoryOperation[]
  isBaseline: boolean
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
  documents: WorldDocumentHistoryNodeState[]
  changes: WorldDocumentCommitChangePayload[]
}

export type RestoreWorldDocumentCommitInput = {
  targetCommitId: string
  expectedHeadCommitId: string
  documentIds?: string[]
}

export type RestoreWorldDocumentCommitResult = {
  commit: WorldDocumentCommitSummary
  affectedDocumentIds: string[]
}

export type DeleteWorldDocumentCommitInput = {
  commitId: string
  expectedHeadCommitId: string
  historySessionId: string
}

export type DeleteWorldDocumentCommitResult = {
  deletedCommitId: string
  headCommitId: string | null
}

export type ApplyWorldDocumentCommitInput = {
  commitId: string
  expectedHeadCommitId: string
  mode: 'revert' | 'cherry_pick'
}

export type WorldDocumentCheckpointPayload = {
  id: string
  worldId: string
  commitId: string
  name: string
  note: string
  createdAt: string
  updatedAt: string
}

export type SaveWorldDocumentCheckpointInput = {
  worldId: string
  commitId: string
  name: string
  note?: string
}

export type WorldDocumentVersionStatusPayload = {
  worldId: string
  head?: WorldDocumentCommitSummary
  pending: {
    sessionCount: number
    documentCount: number
    documentIds: string[]
    origins: WorldDocumentHistoryOrigin[]
    changes: WorldDocumentCommitChangePayload[]
  }
  checkpoints: WorldDocumentCheckpointPayload[]
  branches: WorldDocumentBranchPayload[]
  integrity: { ok: boolean; errorCount: number; warningCount: number }
}

export type WorldDocumentBranchPayload = {
  id: string
  worldId: string
  name: string
  headCommitId: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export type CreateWorldDocumentBranchInput = {
  worldId: string
  name: string
  fromCommitId?: string
}

export type RenameWorldDocumentBranchInput = {
  branchId: string
  name: string
}

export type PreviewWorldDocumentMergeInput = { sourceBranchId: string }

export type WorldDocumentMergeConflict = {
  documentId: string
  title: string
  reason: 'both_changed' | 'delete_modify'
  currentDiff?: WorldDocumentContentDiff
  incomingDiff?: WorldDocumentContentDiff
}

export type WorldDocumentMergePreviewPayload = {
  baseCommitId: string
  currentCommitId: string
  incomingCommitId: string
  sourceBranch: WorldDocumentBranchPayload
  autoMergedDocumentIds: string[]
  conflicts: WorldDocumentMergeConflict[]
}

export type ApplyWorldDocumentMergeInput = {
  sourceBranchId: string
  expectedCurrentHeadCommitId: string
  resolutions: Record<string, 'current' | 'incoming'>
}

export type CompareWorldDocumentCommitsInput = {
  baseCommitId: string
  targetCommitId: string
  documentIds?: string[]
}

export type WorldDocumentCommitComparisonPayload = {
  base: WorldDocumentCommitSummary
  target: WorldDocumentCommitSummary
  changes: WorldDocumentCommitChangePayload[]
}

export type WorldDocumentIntegrityIssue = {
  severity: 'error' | 'warning'
  code: string
  message: string
  reference?: string
}

export type WorldDocumentIntegrityReport = {
  ok: boolean
  worldIds: string[]
  counts: {
    commits: number
    changes: number
    trees: number
    contentVersions: number
  }
  issues: WorldDocumentIntegrityIssue[]
}

export type WorldDocumentGarbageCollectionResult = {
  dryRun: boolean
  removedTreeCount: number
  removedContentVersionCount: number
}

export type WorldDocumentVersionPackageImportResult = {
  imported: {
    commits: number
    changes: number
    trees: number
    contents: number
    branches: number
    checkpoints: number
  }
  skipped: { commits: number; changes: number; trees: number; contents: number }
}
