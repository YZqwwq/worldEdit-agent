import { z } from 'zod'

const ownerReferenceShape = {
  worldId: z.string().trim().min(1),
  entityId: z.string().trim().min(1).optional()
}

export const listWorldDocumentsInputSchema = z.object(ownerReferenceShape)

export const createWorldDocumentInputSchema = z.object({
  ...ownerReferenceShape,
  parentDocumentId: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1).max(120),
  contentHtml: z.string().max(40000).optional()
})
