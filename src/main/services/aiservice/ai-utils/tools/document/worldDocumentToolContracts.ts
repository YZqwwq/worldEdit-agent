import { z } from 'zod'
import { MAX_AGENT_DOCUMENT_MARKDOWN_LENGTH } from './worldDocumentMarkdownCodec'

const ownerReferenceShape = {
  worldId: z.string().trim().min(1),
  entityId: z.string().trim().min(1).optional()
}

export const listWorldDocumentsInputSchema = z.object(ownerReferenceShape)

export const createWorldDocumentInputSchema = z.object({
  ...ownerReferenceShape,
  parentDocumentId: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1).max(120),
  contentMarkdown: z.string().max(MAX_AGENT_DOCUMENT_MARKDOWN_LENGTH).optional()
})

export const updateWorldDocumentInputSchema = z
  .object({
    documentId: z.string().trim().min(1),
    expectedRevision: z.number().int().positive(),
    title: z.string().trim().min(1).max(120).optional(),
    contentMarkdown: z.string().max(MAX_AGENT_DOCUMENT_MARKDOWN_LENGTH).optional(),
    changeSummary: z.string().trim().min(1).max(300)
  })
  .refine((input) => input.title !== undefined || input.contentMarkdown !== undefined, {
    message: 'title or contentMarkdown is required'
  })

export const replaceWorldDocumentTextInputSchema = z.object({
  documentId: z.string().trim().min(1),
  expectedRevision: z.number().int().positive(),
  oldText: z.string().min(1).max(MAX_AGENT_DOCUMENT_MARKDOWN_LENGTH),
  newText: z.string().max(MAX_AGENT_DOCUMENT_MARKDOWN_LENGTH),
  changeSummary: z.string().trim().min(1).max(300)
})

export const replaceWorldDocumentSectionInputSchema = z.object({
  documentId: z.string().trim().min(1),
  expectedRevision: z.number().int().positive(),
  headingPath: z.array(z.string().trim().min(1)).min(1).max(6),
  expectedSectionHash: z.string().regex(/^[a-f0-9]{64}$/),
  replacementMarkdown: z.string().min(1).max(MAX_AGENT_DOCUMENT_MARKDOWN_LENGTH),
  changeSummary: z.string().trim().min(1).max(300)
})
