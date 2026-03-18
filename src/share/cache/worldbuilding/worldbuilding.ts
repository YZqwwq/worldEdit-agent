export type WorldStatus = 'draft' | 'active' | 'archived'

export type WorldEntityType =
  | 'character'
  | 'race'
  | 'faction'
  | 'nation'
  | 'city'
  | 'region'
  | 'map'
  | 'map_location'
  | 'event'
  | 'item'
  | 'rule'
  | 'custom'

export type RelationDirection = 'directed' | 'undirected'

export interface WorldPayload {
  id: string
  name: string
  summary?: string
  status: WorldStatus
  schemaVersion: number
  createdAt?: string
  updatedAt?: string
}

export interface WorldEntityPayload {
  id: string
  worldId: string
  type: WorldEntityType
  name: string
  slug?: string
  title?: string
  summary?: string
  status: WorldStatus
  schemaVersion: number
  createdAt?: string
  updatedAt?: string
}

export interface WorldEntityComponentPayload<TData = Record<string, unknown>> {
  id: string
  entityId: string
  componentType: string
  schemaVersion: number
  data: TData
  createdAt?: string
  updatedAt?: string
}

export interface WorldEntityRelationPayload<TData = Record<string, unknown>> {
  id: string
  worldId: string
  sourceEntityId: string
  targetEntityId: string
  relationType: string
  direction: RelationDirection
  data?: TData
  startTimeId?: string
  endTimeId?: string
  createdAt?: string
  updatedAt?: string
}

export interface WorldEntityDetailPayload {
  entity: WorldEntityPayload
  components: WorldEntityComponentPayload[]
  relations: WorldEntityRelationPayload[]
}

export interface CreateWorldInput {
  name: string
  summary?: string
  status?: WorldStatus
}

export interface CreateWorldEntityInput {
  worldId: string
  type: WorldEntityType
  name: string
  slug?: string
  title?: string
  summary?: string
  status?: WorldStatus
  initializeStarterComponents?: boolean
  initialComponents?: WorldEntityComponentSeedInput[]
}

export interface UpsertWorldEntityComponentInput<TData = Record<string, unknown>> {
  entityId: string
  componentType: string
  data: TData
  schemaVersion?: number
}

export interface WorldEntityComponentSeedInput<TData = Record<string, unknown>> {
  componentType: string
  data?: TData
  schemaVersion?: number
}

export interface CreateWorldEntityRelationInput<TData = Record<string, unknown>> {
  worldId: string
  sourceEntityId: string
  targetEntityId: string
  relationType: string
  direction?: RelationDirection
  data?: TData
  startTimeId?: string
  endTimeId?: string
}

export interface WorldbuildingComponentDefinition {
  componentType: string
  displayName: string
  description: string
  entityTypes: WorldEntityType[]
  schemaVersion: number
  starterData: Record<string, unknown>
}

export interface WorldbuildingEntityDefinition {
  entityType: WorldEntityType
  displayName: string
  description: string
  starterComponentTypes: string[]
}
