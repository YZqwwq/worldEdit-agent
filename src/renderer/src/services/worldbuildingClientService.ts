import type {
  CreateWorldEntityInput,
  CreateWorldEntityRelationInput,
  CreateWorldInput,
  UpdateWorldEntityInput,
  UpdateWorldInput,
  UpsertWorldEntityComponentInput,
  WorldEntityComponentPayload,
  WorldEntityDetailPayload,
  WorldEntityPayload,
  WorldEntityRelationPayload,
  WorldbuildingComponentDefinition,
  WorldbuildingEntityDefinition,
  WorldbuildingRelationDefinition,
  WorldbuildingSchemaCatalogPayload,
  WorldPayload
} from '@share/cache/worldbuilding/worldbuilding'
import type {
  CharacterNarrativeDocumentPayload,
  CreateCharacterNarrativeDocumentInput,
  DeleteCharacterNarrativeDocumentInput,
  MoveCharacterNarrativeDocumentInput,
  UpdateCharacterNarrativeDocumentInput
} from '@share/cache/worldbuilding/characterNarrativeDocument'

export const worldbuildingClientService = {
  listWorlds(): Promise<WorldPayload[]> {
    return window.api.listWorlds()
  },

  createWorld(input: CreateWorldInput): Promise<WorldPayload> {
    return window.api.createWorld(input)
  },

  updateWorld(input: UpdateWorldInput): Promise<WorldPayload> {
    return window.api.updateWorld(input)
  },

  deleteWorld(worldId: string): Promise<void> {
    return window.api.deleteWorld(worldId)
  },

  listEntityDefinitions(): Promise<WorldbuildingEntityDefinition[]> {
    return window.api.listWorldEntityDefinitions()
  },

  listComponentDefinitions(
    entityType?: WorldEntityPayload['type']
  ): Promise<WorldbuildingComponentDefinition[]> {
    return window.api.listWorldComponentDefinitions(entityType)
  },

  listRelationDefinitions(): Promise<WorldbuildingRelationDefinition[]> {
    return window.api.listWorldRelationDefinitions()
  },

  getSchemaCatalog(): Promise<WorldbuildingSchemaCatalogPayload> {
    return window.api.getWorldSchemaCatalog()
  },

  listEntities(
    worldId: string,
    type?: WorldEntityPayload['type']
  ): Promise<WorldEntityPayload[]> {
    return window.api.listWorldEntities(worldId, type)
  },

  createEntity(input: CreateWorldEntityInput): Promise<WorldEntityPayload> {
    return window.api.createWorldEntity(input)
  },

  updateEntity(input: UpdateWorldEntityInput): Promise<WorldEntityPayload> {
    return window.api.updateWorldEntity(input)
  },

  deleteEntity(entityId: string): Promise<void> {
    return window.api.deleteWorldEntity(entityId)
  },

  getEntityDetail(entityId: string): Promise<WorldEntityDetailPayload | null> {
    return window.api.getWorldEntityDetail(entityId)
  },

  upsertComponent(input: UpsertWorldEntityComponentInput): Promise<WorldEntityComponentPayload> {
    return window.api.upsertWorldEntityComponent(input)
  },

  createRelation(input: CreateWorldEntityRelationInput): Promise<WorldEntityRelationPayload> {
    return window.api.createWorldEntityRelation(input)
  },

  listCharacterNarrativeDocuments(
    characterEntityId: string
  ): Promise<CharacterNarrativeDocumentPayload[]> {
    return window.api.listCharacterNarrativeDocuments(characterEntityId)
  },

  getCharacterNarrativeDocument(
    documentId: string
  ): Promise<CharacterNarrativeDocumentPayload | null> {
    return window.api.getCharacterNarrativeDocument(documentId)
  },

  createCharacterNarrativeDocument(
    input: CreateCharacterNarrativeDocumentInput
  ): Promise<CharacterNarrativeDocumentPayload> {
    return window.api.createCharacterNarrativeDocument(input)
  },

  updateCharacterNarrativeDocument(
    input: UpdateCharacterNarrativeDocumentInput
  ): Promise<CharacterNarrativeDocumentPayload> {
    return window.api.updateCharacterNarrativeDocument(input)
  },

  moveCharacterNarrativeDocument(
    input: MoveCharacterNarrativeDocumentInput
  ): Promise<CharacterNarrativeDocumentPayload> {
    return window.api.moveCharacterNarrativeDocument(input)
  },

  deleteCharacterNarrativeDocument(input: DeleteCharacterNarrativeDocumentInput): Promise<void> {
    return window.api.deleteCharacterNarrativeDocument(input)
  }
}
