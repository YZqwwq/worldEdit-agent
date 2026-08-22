export type WorldEntityDocumentContentFormat = 'html'

export interface WorldEntityDocumentPayload {
  id: string
  worldId: string
  parentDocumentId: string | null
  title: string
  contentHtml: string
  contentFormat: WorldEntityDocumentContentFormat
  sortKey: string
  revision: number
  schemaVersion: number
  createdAt?: string
  updatedAt?: string
}

export interface CreateWorldEntityDocumentInput {
  worldId: string
  parentDocumentId?: string | null
  title?: string
  contentHtml?: string
  sortKey?: string
  /** Keeps human changes in the working tree until a version is explicitly created. */
  historySessionId?: string
}

export interface UpdateWorldEntityDocumentInput {
  documentId: string
  expectedRevision: number
  title?: string
  contentHtml?: string
  contentFormat?: WorldEntityDocumentContentFormat
  /** Groups renderer saves in one working tree until a version is explicitly created. */
  historySessionId?: string
}

export interface MoveWorldEntityDocumentInput {
  documentId: string
  expectedRevision: number
  parentDocumentId?: string | null
  sortKey?: string
  /** Groups drag/reorder changes in the current working tree. */
  historySessionId?: string
}

export interface DeleteWorldEntityDocumentInput {
  documentId: string
  recursive?: boolean
  /** Keeps human changes in the working tree until a version is explicitly created. */
  historySessionId?: string
}

export interface CommitWorldEntityDocumentHistorySessionInput {
  worldId: string
  sessionId: string
  summary?: string
}

export interface ResolveWorldEntityDocumentHistorySessionInput {
  worldId: string
  preferredSessionId: string
}

export interface WorldEntityDocumentHistorySessionResolution {
  sessionId: string
  status: 'active' | 'recovered' | 'rotated'
  recoveredSessionCount: number
}

export interface WorldEntityDocumentChangeEvent {
  changeType: 'created' | 'updated' | 'moved' | 'deleted'
  documentId: string
  revision?: number
  deletedDocumentIds?: string[]
}
