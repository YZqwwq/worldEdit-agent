import type {
  CreateWorldEntityInput,
  CreateWorldInput,
  UpsertWorldEntityComponentInput,
  WorldEntityComponentPayload,
  WorldEntityDetailPayload,
  WorldEntityPayload,
  WorldbuildingComponentDefinition,
  WorldbuildingEntityDefinition,
  WorldPayload
} from '@share/cache/worldbuilding/worldbuilding'

export const worldbuildingClientService = {
  listWorlds(): Promise<WorldPayload[]> {
    return window.api.listWorlds()
  },

  createWorld(input: CreateWorldInput): Promise<WorldPayload> {
    return window.api.createWorld(input)
  },

  listEntityDefinitions(): Promise<WorldbuildingEntityDefinition[]> {
    return window.api.listWorldEntityDefinitions()
  },

  listComponentDefinitions(
    entityType?: WorldEntityPayload['type']
  ): Promise<WorldbuildingComponentDefinition[]> {
    return window.api.listWorldComponentDefinitions(entityType)
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

  getEntityDetail(entityId: string): Promise<WorldEntityDetailPayload | null> {
    return window.api.getWorldEntityDetail(entityId)
  },

  upsertComponent(input: UpsertWorldEntityComponentInput): Promise<WorldEntityComponentPayload> {
    return window.api.upsertWorldEntityComponent(input)
  }
}
