import { z } from 'zod'
import {
  relationDirectionSchema,
  worldEntityComponentPayloadSchema,
  worldEntityDetailPayloadSchema,
  worldEntityPayloadSchema,
  worldEntityRelationPayloadSchema
} from '../world/shared'

export const characterEditingScopeSchema = z.enum([
  'profile',
  'demographic',
  'relation',
  'portrait'
])

export const characterEditorDirectionSchema = z.enum([
  'character_deeds',
  'character_profile',
  'demographic_facts'
])

export const characterEditorTaskSourceSchema = z.enum(['chat', 'world_entity_view'])

export const characterEntityPayloadSchema = worldEntityPayloadSchema.extend({
  type: z.literal('character')
})

export const characterEntityComponentPayloadSchema = worldEntityComponentPayloadSchema

export const characterEntityRelationPayloadSchema = worldEntityRelationPayloadSchema

export const characterDetailPayloadSchema = worldEntityDetailPayloadSchema.refine(
  (detail) => detail.entity.type === 'character',
  {
    message: 'Target entity must be a character.'
  }
)

export const getCharacterDetailInputSchema = z.object({
  entityId: z.string().trim().min(1)
})

export const getCharacterDetailOutputSchema = z.object({
  found: z.boolean(),
  detail: characterDetailPayloadSchema.nullable()
})

export const characterProfilePatchSchema = z
  .object({
    title: z.string().trim().max(120).optional(),
    summary: z.string().trim().max(1000).optional(),
    description: z.string().trim().max(40000).optional(),
    descriptionFormat: z.enum(['markdown', 'html']).optional(),
    portraitResourceUrl: z.string().trim().max(2000).optional(),
    layoutVariant: z.enum(['v1', 'v2', 'v3']).optional(),
    personalityTraits: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    abilities: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    tags: z.array(z.string().trim().min(1).max(120)).max(50).optional()
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one character profile field must be provided.'
  })

export const upsertCharacterProfileInputSchema = z.object({
  entityId: z.string().trim().min(1),
  patch: characterProfilePatchSchema
})

export const upsertCharacterProfileOutputSchema = z.object({
  component: characterEntityComponentPayloadSchema
})

export const upsertCharacterDescriptionInputSchema = z.object({
  entityId: z.string().trim().min(1),
  description: z.string().trim().min(1).max(40000)
})

export const upsertCharacterDescriptionOutputSchema = z.object({
  component: characterEntityComponentPayloadSchema
})

export const characterDemographicPatchSchema = z
  .object({
    age: z.number().int().min(0).max(100000).nullable().optional(),
    ageLabel: z.string().trim().max(120).optional(),
    heightLabel: z.string().trim().max(120).optional(),
    gender: z.string().trim().max(60).optional(),
    raceEntityId: z.string().trim().max(120).optional(),
    factionEntityId: z.string().trim().max(120).optional(),
    nationEntityId: z.string().trim().max(120).optional(),
    birthplaceEntityId: z.string().trim().max(120).optional()
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one character demographic field must be provided.'
  })

export const upsertCharacterDemographicInputSchema = z.object({
  entityId: z.string().trim().min(1),
  patch: characterDemographicPatchSchema
})

export const upsertCharacterDemographicOutputSchema = z.object({
  component: characterEntityComponentPayloadSchema
})

export const listCharacterRelationsInputSchema = z.object({
  entityId: z.string().trim().min(1)
})

export const listCharacterRelationsOutputSchema = z.object({
  count: z.number().int().min(0),
  relations: z.array(characterEntityRelationPayloadSchema)
})

export const upsertCharacterRelationPatchSchema = z.object({
  sourceEntityId: z.string().trim().min(1),
  targetEntityId: z.string().trim().min(1),
  relationType: z.string().trim().min(1).max(120),
  direction: relationDirectionSchema.optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  startTimeId: z.string().trim().max(120).optional(),
  endTimeId: z.string().trim().max(120).optional()
})

export const upsertCharacterRelationInputSchema = z.object({
  worldId: z.string().trim().min(1),
  patch: upsertCharacterRelationPatchSchema
})

export const upsertCharacterRelationOutputSchema = z.object({
  relation: characterEntityRelationPayloadSchema
})

export const characterEditorPendingContextSchema = z.object({
  phase: z.enum(['resolve_world', 'resolve_character', 'apply_edit']),
  originalUserRequest: z.string().trim().min(1).max(4000),
  targetCharacterName: z.string().trim().min(1).max(200).optional(),
  targetWorldName: z.string().trim().min(1).max(200).optional(),
  resolvedWorldId: z.string().trim().min(1).max(120).optional(),
  resolvedEntityId: z.string().trim().min(1).max(120).optional(),
  editingScope: z.array(characterEditingScopeSchema).max(8).optional(),
  editingDirection: characterEditorDirectionSchema.optional(),
  expectedOutcome: z.string().trim().max(1000).optional(),
  source: characterEditorTaskSourceSchema.optional(),
  lastNeedsInputMessage: z.string().trim().max(2000).optional()
})

export const delegateCharacterEditorInputSchema = z
  .object({
    worldId: z.string().trim().min(1).optional(),
    worldName: z.string().trim().min(1).max(200).optional(),
    entityId: z.string().trim().min(1).optional(),
    characterName: z.string().trim().min(1).max(200).optional(),
    userRequest: z.string().trim().min(1).max(4000),
    editingScope: z.array(characterEditingScopeSchema).max(8).optional(),
    editingDirection: characterEditorDirectionSchema.optional(),
    expectedOutcome: z.string().trim().max(1000).optional(),
    source: characterEditorTaskSourceSchema.optional()
  })
  .refine(
    (input) =>
      Boolean(input.entityId || input.characterName || input.worldId || input.worldName),
    {
      message:
        'At least one of entityId, characterName, worldId, or worldName must be provided.'
    }
  )

export const delegateCharacterEditorTaskPayloadSchema = z.object({
  taskId: z.number().int().positive(),
  executionId: z.number().int().positive(),
  worldId: z.string().optional(),
  worldName: z.string().optional(),
  entityId: z.string().optional(),
  characterName: z.string().optional(),
  userRequest: z.string(),
  originalUserRequest: z.string(),
  editingScope: z.array(characterEditingScopeSchema).optional(),
  editingDirection: characterEditorDirectionSchema.optional(),
  expectedOutcome: z.string().optional(),
  source: characterEditorTaskSourceSchema.optional(),
  pendingContext: characterEditorPendingContextSchema.optional()
})

export const characterEditorAppliedToolSchema = z.object({
  name: z.string().trim().min(1).max(120),
  status: z.enum(['ok', 'error'])
})

export const characterEditorCompletedDetailsSchema = z.object({
  kind: z.literal('completed'),
  changedScopes: z.array(characterEditingScopeSchema).max(8).optional(),
  appliedTools: z.array(characterEditorAppliedToolSchema).max(20).optional(),
  internalWarning: z.string().trim().max(1000).optional(),
  suggestedFollowUp: z.string().trim().max(500).optional()
})

export const characterEditorNeedsInputDetailsSchema = z.object({
  kind: z.literal('needs_input'),
  phase: z.enum(['resolve_world', 'resolve_character', 'apply_edit']).optional(),
  missingFields: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
  suggestedPrompt: z.string().trim().max(500).optional(),
  appliedTools: z.array(characterEditorAppliedToolSchema).max(20).optional()
})

export const characterEditorFailedDetailsSchema = z.object({
  kind: z.literal('failed'),
  errorType: z
    .enum(['validation', 'not_found', 'tool_error', 'model_error', 'runtime_error', 'unknown'])
    .optional(),
  retryable: z.boolean().optional(),
  internalWarning: z.string().trim().max(1000).optional(),
  appliedTools: z.array(characterEditorAppliedToolSchema).max(20).optional()
})

export const characterEditorCancelledDetailsSchema = z.object({
  kind: z.literal('cancelled'),
  reason: z.string().trim().max(500).optional()
})

export const characterEditorDetailsSchema = z.discriminatedUnion('kind', [
  characterEditorCompletedDetailsSchema,
  characterEditorNeedsInputDetailsSchema,
  characterEditorFailedDetailsSchema,
  characterEditorCancelledDetailsSchema
])

export const characterEditorHandlerOutputSchema = z.object({
  outcome: z.enum(['completed', 'needs_input', 'failed']),
  summary: z.string().trim().min(1).max(500),
  message: z.string().trim().min(1).max(3000),
  details: characterEditorDetailsSchema,
  pendingContext: characterEditorPendingContextSchema.optional()
})

export const delegateCharacterEditorOutputSchema = z.object({
  accepted: z.literal(true),
  taskId: z.number().int().positive(),
  executionId: z.number().int().positive(),
  executorKind: z.literal('character_editor'),
  status: z.enum(['queued', 'running']),
  target: z.object({
    entityId: z.string().optional(),
    characterName: z.string().optional(),
    worldId: z.string().optional(),
    worldName: z.string().optional()
  }),
  summary: z.string(),
  nextAction: z.enum(['await_dispatcher', 'await_subagent_result'])
})

export const characterEditorDraftSchemas = {
  get_character_detail: {
    inputSchema: getCharacterDetailInputSchema,
    outputSchema: getCharacterDetailOutputSchema
  },
  upsert_character_profile: {
    inputSchema: upsertCharacterProfileInputSchema,
    outputSchema: upsertCharacterProfileOutputSchema
  },
  upsert_character_description: {
    inputSchema: upsertCharacterDescriptionInputSchema,
    outputSchema: upsertCharacterDescriptionOutputSchema
  },
  upsert_character_demographic: {
    inputSchema: upsertCharacterDemographicInputSchema,
    outputSchema: upsertCharacterDemographicOutputSchema
  },
  list_character_relations: {
    inputSchema: listCharacterRelationsInputSchema,
    outputSchema: listCharacterRelationsOutputSchema
  },
  upsert_character_relation: {
    inputSchema: upsertCharacterRelationInputSchema,
    outputSchema: upsertCharacterRelationOutputSchema
  }
} as const
