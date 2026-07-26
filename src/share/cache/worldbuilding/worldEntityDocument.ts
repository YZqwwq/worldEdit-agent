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
  title?: string
  contentHtml?: string
  contentFormat?: WorldEntityDocumentContentFormat
}

export interface MoveWorldEntityDocumentInput {
  documentId: string
  parentDocumentId?: string | null
  sortKey?: string
}

export interface DeleteWorldEntityDocumentInput {
  documentId: string
  recursive?: boolean
}
