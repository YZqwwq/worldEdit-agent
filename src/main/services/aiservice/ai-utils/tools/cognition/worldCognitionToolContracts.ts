import { z } from 'zod'
import {
  MAX_WORLD_COGNITION_DOCUMENT_REFS,
  MAX_WORLD_COGNITION_MARKDOWN_LENGTH
} from '@share/cache/worldbuilding/agentWorldCognition'

export const cognitionNodeKindSchema = z.enum(['dimension', 'concept'])
export const cognitionNodeStatusSchema = z.enum(['available', 'needs_review'])

export const cognitionDocumentRefSchema = z.strictObject({
  documentId: z.string().trim().min(1).max(240),
  revision: z.number().int().positive()
})

export const queryWorldCognitionInputSchema = z.strictObject({
  worldId: z.string().trim().min(1).max(240),
  query: z.string().trim().min(1).max(120),
  limit: z.number().int().min(1).max(10).default(5)
})

export const saveWorldCognitionInputSchema = z
  .strictObject({
    worldId: z.string().trim().min(1).max(240),
    nodeId: z.string().trim().min(1).optional(),
    expectedRevision: z.number().int().positive().optional(),
    parentId: z.string().trim().min(1).nullable().default(null),
    nodeKind: cognitionNodeKindSchema,
    title: z.string().trim().min(1).max(120),
    markdown: z.string().trim().min(1).max(MAX_WORLD_COGNITION_MARKDOWN_LENGTH),
    documentRefs: z.array(cognitionDocumentRefSchema).max(MAX_WORLD_COGNITION_DOCUMENT_REFS),
    status: cognitionNodeStatusSchema.default('available')
  })
  .superRefine((input, context) => {
    if (input.nodeId && input.expectedRevision === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['expectedRevision'],
        message: 'expectedRevision is required when nodeId is provided'
      })
    }
    if (!input.nodeId && input.expectedRevision !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['expectedRevision'],
        message: 'expectedRevision is only valid when updating an existing node'
      })
    }
    if (input.nodeKind === 'concept' && !input.parentId) {
      context.addIssue({
        code: 'custom',
        path: ['parentId'],
        message: 'concept nodes must belong to a dimension node'
      })
    }
    if (input.nodeKind === 'concept' && input.documentRefs.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['documentRefs'],
        message: 'concept nodes require at least one source document'
      })
    }
  })
