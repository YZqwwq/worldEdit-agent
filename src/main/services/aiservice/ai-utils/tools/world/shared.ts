import { z } from 'zod'

export const worldEntityTypeValues = [
  'character',
  'race',
  'faction',
  'nation',
  'city',
  'region',
  'map',
  'map_location',
  'event',
  'item',
  'rule',
  'custom'
] as const

export const relationDirectionValues = ['directed', 'undirected'] as const

export const worldbuildingFieldKindValues = [
  'string',
  'text',
  'number',
  'boolean',
  'string_list',
  'entity_ref',
  'entity_ref_list'
] as const

export const worldStatusSchema = z.enum(['draft', 'active', 'archived'])
export const worldEntityTypeSchema = z.enum(worldEntityTypeValues)
export const relationDirectionSchema = z.enum(relationDirectionValues)
export const worldbuildingFieldKindSchema = z.enum(worldbuildingFieldKindValues)

export const worldPayloadSchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string().optional(),
  status: worldStatusSchema,
  schemaVersion: z.number().int(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
})

export const worldEntityPayloadSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  type: worldEntityTypeSchema,
  name: z.string(),
  slug: z.string().optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  status: worldStatusSchema,
  schemaVersion: z.number().int(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
})

export const worldEntityComponentPayloadSchema = z.object({
  id: z.string(),
  entityId: z.string(),
  componentType: z.string(),
  schemaVersion: z.number().int(),
  data: z.record(z.string(), z.unknown()),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
})

export const worldEntityRelationPayloadSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  sourceEntityId: z.string(),
  targetEntityId: z.string(),
  relationType: z.string(),
  direction: relationDirectionSchema,
  data: z.record(z.string(), z.unknown()).optional(),
  startTimeId: z.string().optional(),
  endTimeId: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
})

export const worldbuildingFieldDefinitionSchema = z.object({
  key: z.string(),
  displayName: z.string(),
  description: z.string(),
  fieldKind: worldbuildingFieldKindSchema,
  required: z.boolean().optional(),
  multiline: z.boolean().optional(),
  entityTypes: z.array(worldEntityTypeSchema).optional()
})

export const worldbuildingEntityDefinitionSchema = z.object({
  entityType: worldEntityTypeSchema,
  displayName: z.string(),
  description: z.string(),
  starterComponentTypes: z.array(z.string())
})

export const worldbuildingComponentDefinitionSchema = z.object({
  componentType: z.string(),
  displayName: z.string(),
  description: z.string(),
  entityTypes: z.array(worldEntityTypeSchema),
  schemaVersion: z.number().int(),
  starterData: z.record(z.string(), z.unknown()),
  fields: z.array(worldbuildingFieldDefinitionSchema)
})

export const worldbuildingRelationDefinitionSchema = z.object({
  relationType: z.string(),
  displayName: z.string(),
  description: z.string(),
  sourceEntityTypes: z.array(worldEntityTypeSchema),
  targetEntityTypes: z.array(worldEntityTypeSchema),
  direction: relationDirectionSchema,
  schemaVersion: z.number().int(),
  starterData: z.record(z.string(), z.unknown()),
  fields: z.array(worldbuildingFieldDefinitionSchema)
})

export const worldbuildingSchemaCatalogPayloadSchema = z.object({
  entityDefinitions: z.array(worldbuildingEntityDefinitionSchema),
  componentDefinitions: z.array(worldbuildingComponentDefinitionSchema),
  relationDefinitions: z.array(worldbuildingRelationDefinitionSchema)
})

export const worldEntityDetailPayloadSchema = z.object({
  entity: worldEntityPayloadSchema,
  components: z.array(worldEntityComponentPayloadSchema),
  relations: z.array(worldEntityRelationPayloadSchema)
})
