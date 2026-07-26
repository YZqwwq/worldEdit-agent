import type { WorldEntityType } from './worldbuilding'

export type WorldEntityDocumentContentFormat = 'html'

export const WORLD_ENTITY_DOCUMENT_OWNER_TYPES = [
  'character',
  'race',
  'faction',
  'nation',
  'city',
  'region',
  'map'
] as const satisfies readonly WorldEntityType[]

export type WorldEntityDocumentOwnerType = (typeof WORLD_ENTITY_DOCUMENT_OWNER_TYPES)[number]

export const isWorldEntityDocumentOwnerType = (
  value: WorldEntityType
): value is WorldEntityDocumentOwnerType =>
  (WORLD_ENTITY_DOCUMENT_OWNER_TYPES as readonly WorldEntityType[]).includes(value)

export interface WorldEntityDocumentPayload {
  id: string
  ownerEntityId: string
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
  ownerEntityId: string
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
