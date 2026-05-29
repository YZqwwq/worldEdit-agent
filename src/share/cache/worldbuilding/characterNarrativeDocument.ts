export type CharacterNarrativeContentFormat = 'html'

export interface CharacterNarrativeDocumentPayload {
  id: string
  characterEntityId: string
  parentDocumentId: string | null
  title: string
  contentHtml: string
  contentFormat: CharacterNarrativeContentFormat
  sortKey: string
  schemaVersion: number
  createdAt?: string
  updatedAt?: string
}

export interface CreateCharacterNarrativeDocumentInput {
  characterEntityId: string
  parentDocumentId?: string | null
  title?: string
  contentHtml?: string
  sortKey?: string
}

export interface UpdateCharacterNarrativeDocumentInput {
  documentId: string
  title?: string
  contentHtml?: string
  contentFormat?: CharacterNarrativeContentFormat
}

export interface MoveCharacterNarrativeDocumentInput {
  documentId: string
  parentDocumentId?: string | null
  sortKey?: string
}

export interface DeleteCharacterNarrativeDocumentInput {
  documentId: string
  recursive?: boolean
}
