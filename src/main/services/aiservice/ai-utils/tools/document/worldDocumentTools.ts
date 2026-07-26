import { z } from 'zod'
import { defineAgentTool } from '../../core/agentTool'
import { worldEntityDocumentService } from '../../../../worldbuilding/worldEntityDocumentService'
import { worldEntityDocumentChangePublisher } from '../../../../worldbuilding/worldEntityDocumentChangePublisher'

const ownerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('world'),
    worldId: z.string().trim().min(1)
  }),
  z.object({
    kind: z.literal('entity'),
    worldId: z.string().trim().min(1),
    entityId: z.string().trim().min(1)
  })
])

const documentSummarySchema = z.object({
  id: z.string(),
  ownerKind: z.enum(['world', 'entity']),
  worldId: z.string(),
  ownerEntityId: z.string().nullable(),
  parentDocumentId: z.string().nullable(),
  title: z.string(),
  sortKey: z.string(),
  revision: z.number().int().positive(),
  updatedAt: z.string().optional()
})

const documentSchema = documentSummarySchema.extend({
  contentHtml: z.string(),
  contentFormat: z.literal('html'),
  schemaVersion: z.number().int().positive(),
  createdAt: z.string().optional()
})

const toSummary = (document: z.infer<typeof documentSchema>) => ({
  id: document.id,
  ownerKind: document.ownerKind,
  worldId: document.worldId,
  ownerEntityId: document.ownerEntityId,
  parentDocumentId: document.parentDocumentId,
  title: document.title,
  sortKey: document.sortKey,
  revision: document.revision,
  updatedAt: document.updatedAt
})

export const listWorldDocumentsTool = defineAgentTool({
  name: 'list_world_documents',
  description: 'List the tree metadata of documents owned by a world or world entity.',
  inputSchema: z.object({ owner: ownerSchema }),
  outputSchema: z.object({ documents: z.array(documentSummarySchema) }),
  metadata: {
    whenToUse: ['需要查看世界观基础设定或某个实体下有哪些文档', '需要解析文档标题、层级或 documentId'],
    whenNotToUse: ['已经知道 documentId 且需要读取正文'],
    inputSummary: '提供 world 或 entity owner。',
    outputSummary: '返回文档目录元数据，不返回正文。',
    riskLevel: 'low',
    readOnly: true,
    idempotent: true,
    contextRetention: 'evidence',
    uiStage: {
      label: '读取文档目录',
      runningLabel: '正在读取文档目录',
      doneLabel: '文档目录已读取'
    }
  },
  async execute(input) {
    const documents = await worldEntityDocumentService.listDocuments(input.owner)
    return { documents: documents.map(toSummary) }
  },
  successMessage(data) {
    return `Loaded ${data.documents.length} document catalog entries.`
  }
})

export const readWorldDocumentTool = defineAgentTool({
  name: 'read_world_document',
  description: 'Read one world document by its exact documentId.',
  inputSchema: z.object({ documentId: z.string().trim().min(1) }),
  outputSchema: z.object({ found: z.boolean(), document: documentSchema.nullable() }),
  metadata: {
    whenToUse: ['需要读取当前文档或指定文档的完整 HTML 正文', '写入前需要确认当前内容和 revision'],
    whenNotToUse: ['尚不知道 documentId，应先列出文档目录'],
    inputSummary: '提供 documentId。',
    outputSummary: '返回文档正文、归属和 revision。',
    riskLevel: 'low',
    readOnly: true,
    idempotent: true,
    contextRetention: 'evidence',
    uiStage: {
      label: '读取文档',
      runningLabel: '正在阅读文档内容',
      doneLabel: '文档内容已读取'
    }
  },
  async execute(input) {
    const document = await worldEntityDocumentService.getDocument(input.documentId)
    return { found: Boolean(document), document }
  },
  successMessage(data, input) {
    return data.found
      ? `Loaded document ${data.document?.title || input.documentId} at revision ${data.document?.revision}.`
      : `Document ${input.documentId} was not found.`
  }
})

export const createWorldDocumentTool = defineAgentTool({
  name: 'create_world_document',
  description: 'Create a world-level or entity-level document.',
  inputSchema: z.object({
    owner: ownerSchema,
    parentDocumentId: z.string().trim().min(1).nullable().optional(),
    title: z.string().trim().min(1).max(120),
    contentHtml: z.string().max(40000).optional()
  }),
  outputSchema: z.object({ document: documentSchema }),
  metadata: {
    whenToUse: ['用户明确要求创建新的世界观或实体文档'],
    whenNotToUse: ['只是讨论文档内容，或目标文档已经存在'],
    inputSummary: '提供 owner、标题，可选父文档和 HTML 正文。',
    outputSummary: '返回新文档和初始 revision。',
    riskLevel: 'medium',
    readOnly: false,
    idempotent: false,
    contextRetention: 'evidence',
    uiStage: {
      label: '创建文档',
      runningLabel: '正在创建文档',
      doneLabel: '文档已创建'
    }
  },
  async execute(input) {
    const document = await worldEntityDocumentService.createDocument(input)
    worldEntityDocumentChangePublisher.publish({
      changeType: 'created',
      documentId: document.id,
      revision: document.revision
    })
    return { document }
  },
  buildReceipt(data) {
    return {
      kind: 'world_document_created',
      summary: `创建文档「${data.document.title}」`,
      payload: {
        documentId: data.document.id,
        revision: data.document.revision
      }
    }
  }
})

export const updateWorldDocumentTool = defineAgentTool({
  name: 'update_world_document',
  description: 'Update the title or complete HTML content of an existing world document.',
  inputSchema: z.object({
    documentId: z.string().trim().min(1),
    expectedRevision: z.number().int().positive(),
    title: z.string().trim().min(1).max(120).optional(),
    contentHtml: z.string().max(40000).optional(),
    changeSummary: z.string().trim().min(1).max(300)
  }).refine((input) => input.title !== undefined || input.contentHtml !== undefined, {
    message: 'title or contentHtml is required'
  }),
  outputSchema: z.object({ document: documentSchema, changeSummary: z.string() }),
  metadata: {
    whenToUse: ['用户明确要求修改当前文档或指定文档', '已经读取正文并持有匹配的 revision'],
    whenNotToUse: ['没有读取最新 revision', '用户只要求分析或提出建议'],
    inputSummary: '提供 documentId、expectedRevision、修改内容和变更摘要。',
    outputSummary: '返回更新后的文档和新 revision。',
    riskLevel: 'medium',
    readOnly: false,
    idempotent: false,
    contextRetention: 'evidence',
    uiStage: {
      label: '更新文档',
      runningLabel: '正在更新文档内容',
      doneLabel: '文档已更新'
    }
  },
  async execute(input) {
    const document = await worldEntityDocumentService.updateDocument({
      documentId: input.documentId,
      expectedRevision: input.expectedRevision,
      title: input.title,
      contentHtml: input.contentHtml,
      contentFormat: 'html'
    })
    worldEntityDocumentChangePublisher.publish({
      changeType: 'updated',
      documentId: document.id,
      revision: document.revision
    })
    return { document, changeSummary: input.changeSummary }
  },
  buildReceipt(data) {
    return {
      kind: 'world_document_updated',
      summary: data.changeSummary,
      payload: {
        documentId: data.document.id,
        revision: data.document.revision
      }
    }
  }
})

export const renameWorldDocumentTool = defineAgentTool({
  name: 'rename_world_document',
  description: 'Rename one world document without changing its content.',
  inputSchema: z.object({
    documentId: z.string().trim().min(1),
    expectedRevision: z.number().int().positive(),
    title: z.string().trim().min(1).max(120)
  }),
  outputSchema: z.object({ document: documentSchema }),
  metadata: {
    whenToUse: ['用户明确要求重命名文档'],
    whenNotToUse: ['同时需要修改正文，应使用 update_world_document'],
    inputSummary: '提供 documentId、expectedRevision 和新标题。',
    outputSummary: '返回重命名后的文档和新 revision。',
    riskLevel: 'medium',
    readOnly: false,
    idempotent: false,
    contextRetention: 'evidence',
    uiStage: {
      label: '重命名文档',
      runningLabel: '正在重命名文档',
      doneLabel: '文档已重命名'
    }
  },
  async execute(input) {
    const document = await worldEntityDocumentService.updateDocument({
      documentId: input.documentId,
      expectedRevision: input.expectedRevision,
      title: input.title
    })
    worldEntityDocumentChangePublisher.publish({
      changeType: 'updated',
      documentId: document.id,
      revision: document.revision
    })
    return { document }
  }
})

export const moveWorldDocumentTool = defineAgentTool({
  name: 'move_world_document',
  description: 'Move a document within the tree owned by the same world or entity.',
  inputSchema: z.object({
    documentId: z.string().trim().min(1),
    expectedRevision: z.number().int().positive(),
    parentDocumentId: z.string().trim().min(1).nullable(),
    sortKey: z.string().trim().min(1).optional()
  }),
  outputSchema: z.object({ document: documentSchema }),
  metadata: {
    whenToUse: ['用户明确要求调整文档层级或顺序'],
    whenNotToUse: ['需要把文档移动到另一个 owner；当前系统不允许跨 owner 移动'],
    inputSummary: '提供 documentId、expectedRevision、父文档和可选 sortKey。',
    outputSummary: '返回移动后的文档和新 revision。',
    riskLevel: 'medium',
    readOnly: false,
    idempotent: false,
    contextRetention: 'evidence',
    uiStage: {
      label: '移动文档',
      runningLabel: '正在调整文档层级',
      doneLabel: '文档层级已更新'
    }
  },
  async execute(input) {
    const document = await worldEntityDocumentService.moveDocument(input)
    worldEntityDocumentChangePublisher.publish({
      changeType: 'moved',
      documentId: document.id,
      revision: document.revision
    })
    return { document }
  }
})

export const deleteWorldDocumentTool = defineAgentTool({
  name: 'delete_world_document',
  description: 'Permanently delete a document, optionally including its descendant subtree.',
  inputSchema: z.object({
    documentId: z.string().trim().min(1),
    recursive: z.boolean().default(false)
  }),
  outputSchema: z.object({ deleted: z.literal(true), documentId: z.string() }),
  metadata: {
    whenToUse: ['用户明确要求永久删除指定文档，并且已经确认目标'],
    whenNotToUse: ['用户只是要求清空、改写、隐藏或移动文档'],
    inputSummary: '提供 documentId；仅确认删除整个子树时设置 recursive=true。',
    outputSummary: '返回已删除的 documentId。',
    riskLevel: 'high',
    readOnly: false,
    idempotent: false,
    contextRetention: 'evidence',
    uiStage: {
      label: '删除文档',
      runningLabel: '正在删除文档',
      doneLabel: '文档已删除'
    }
  },
  async execute(input) {
    const deletedDocumentIds = await worldEntityDocumentService.deleteDocument(input)
    worldEntityDocumentChangePublisher.publish({
      changeType: 'deleted',
      documentId: input.documentId,
      deletedDocumentIds
    })
    return { deleted: true as const, documentId: input.documentId }
  },
  buildReceipt(data) {
    return {
      kind: 'world_document_deleted',
      summary: `删除文档 ${data.documentId}`,
      payload: { documentId: data.documentId }
    }
  }
})
