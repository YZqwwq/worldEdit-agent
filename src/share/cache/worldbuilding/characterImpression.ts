export interface CharacterImpressionPayload {
  characterEntityId: string
  structuredText: string
  updateMarker: string
  createdAt?: string
  updatedAt?: string
}

export interface UpsertCharacterImpressionInput {
  characterEntityId: string
  structuredText: string
  updateMarker?: string
}
