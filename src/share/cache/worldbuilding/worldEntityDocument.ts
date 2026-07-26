import {
  WORLD_INSTANCE_ENTITY_TYPES,
  isWorldInstanceEntityType,
  type WorldEntityType,
  type WorldInstanceEntityType
} from './worldbuilding'

export type WorldEntityDocumentContentFormat = 'html'
export type WorldEntityDocumentOwnerKind = 'world' | 'entity'

export const WORLD_ENTITY_DOCUMENT_OWNER_TYPES = WORLD_INSTANCE_ENTITY_TYPES

export type WorldEntityDocumentOwnerType = WorldInstanceEntityType

export const isWorldEntityDocumentOwnerType = (
  value: WorldEntityType
): value is WorldEntityDocumentOwnerType => isWorldInstanceEntityType(value)

export type WorldEntityDocumentOwnerRef =
  | {
      kind: 'world'
      worldId: string
    }
  | {
      kind: 'entity'
      worldId: string
      entityId: string
    }

export interface WorldEntityDocumentPayload {
  id: string
  ownerKind: WorldEntityDocumentOwnerKind
  worldId: string
  ownerEntityId: string | null
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
  owner: WorldEntityDocumentOwnerRef
  parentDocumentId?: string | null
  title?: string
  contentHtml?: string
  sortKey?: string
}

export interface UpdateWorldEntityDocumentInput {
  documentId: string
  expectedRevision: number
  title?: string
  contentHtml?: string
  contentFormat?: WorldEntityDocumentContentFormat
}

export interface MoveWorldEntityDocumentInput {
  documentId: string
  expectedRevision: number
  parentDocumentId?: string | null
  sortKey?: string
}

export interface DeleteWorldEntityDocumentInput {
  documentId: string
  recursive?: boolean
}

export interface WorldEntityDocumentChangeEvent {
  changeType: 'created' | 'updated' | 'moved' | 'deleted'
  documentId: string
  revision?: number
  deletedDocumentIds?: string[]
}
