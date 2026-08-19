import { z } from 'zod'
import { defineAgentTool } from '../../core/agentTool'
import { worldEntityDocumentService } from '../../../../worldbuilding/worldEntityDocumentService'
import { worldEntityDocumentChangePublisher } from '../../../../worldbuilding/worldEntityDocumentChangePublisher'
import {
  appendWorldDocumentTextInputSchema,
  createWorldDocumentInputSchema,
  insertWorldDocumentTextInputSchema,
  listWorldDocumentsInputSchema,
  readWorldDocumentSectionInputSchema,
  replaceWorldDocumentSectionInputSchema,
  replaceWorldDocumentTextInputSchema,
  updateWorldDocumentInputSchema
} from './worldDocumentToolContracts'
import {
  worldDocumentHtmlToMarkdown,
  worldDocumentMarkdownToHtml
} from './worldDocumentMarkdownCodec'
import type { WorldEntityDocumentPayload } from '@share/cache/worldbuilding/worldEntityDocument'
import { buildWorldDocumentContentDiff } from '../../../../worldbuilding/worldDocumentDiffService'
import {
  appendMarkdownText,
  insertMarkdownText,
  listMarkdownSections,
  readMarkdownSection,
  replaceMarkdownSection,
  replaceUniqueMarkdownText
} from './worldDocumentMarkdownEditEngine'
import {
  buildWorldDocumentEditContinuation,
  type WorldDocumentLocalEditOperation
} from './worldDocumentEditContinuation'

const toDocumentOwner = (input: { worldId: string; entityId?: string }) =>
  input.entityId
    ? ({ kind: 'entity' as const, worldId: input.worldId, entityId: input.entityId } as const)
    : ({ kind: 'world' as const, worldId: input.worldId } as const)

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
  contentMarkdown: z.string(),
  contentFormat: z.literal('markdown'),
  schemaVersion: z.number().int().positive(),
  createdAt: z.string().optional(),
  sections: z.array(
    z.object({
      headingPath: z.array(z.string()),
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive(),
      hash: z.string()
    })
  )
})

const documentSectionSchema = z.object({
  headingPath: z.array(z.string()),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  hash: z.string(),
  contentMarkdown: z.string()
})

const diffLineSchema = z.object({
  kind: z.enum(['context', 'added', 'removed']),
  text: z.string()
})
const contentDiffSchema = z.object({
  beforeFormat: z.enum(['markdown', 'html_editor']).optional(),
  afterFormat: z.enum(['markdown', 'html_editor']).optional(),
  hunks: z.array(
    z.object({
      headingPath: z.array(z.string()).optional(),
      anchorTexts: z.array(z.string()),
      anchorHash: z.string(),
      lines: z.array(diffLineSchema)
    })
  ),
  addedLines: z.number().int().nonnegative(),
  removedLines: z.number().int().nonnegative(),
  truncated: z.boolean()
})
const editLocationSchema = z.object({
  headingPath: z.array(z.string()).optional(),
  anchorText: z.string().optional(),
  markdownAnchorText: z.string().optional(),
  sectionHash: z.string().optional(),
  anchorHash: z.string()
})
const localEditOutputSchema = z.object({
  document: documentSummarySchema,
  changeSummary: z.string(),
  location: editLocationSchema,
  diffRef: z.string(),
  diff: contentDiffSchema
})

const toSummary = (document: WorldEntityDocumentPayload) => ({
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

const toAgentDocument = (document: WorldEntityDocumentPayload): z.infer<typeof documentSchema> => ({
  ...toSummary(document),
  contentMarkdown: worldDocumentHtmlToMarkdown(document.contentHtml),
  contentFormat: 'markdown',
  schemaVersion: document.schemaVersion,
  createdAt: document.createdAt,
  sections: listMarkdownSections(worldDocumentHtmlToMarkdown(document.contentHtml))
})

const executeLocalEdit = async (input: {
  documentId: string
  expectedRevision: number
  changeSummary: string
  edit: (markdown: string) => { markdown: string; location: z.infer<typeof editLocationSchema> }
}) => {
  const current = await worldEntityDocumentService.getDocument(input.documentId)
  if (!current) {
    const error = new Error(`document not found: ${input.documentId}`) as Error & {
      code: string
      retryable: boolean
    }
    error.code = 'NOT_FOUND'
    error.retryable = false
    throw error
  }
  const beforeMarkdown = worldDocumentHtmlToMarkdown(current.contentHtml)
  const edited = input.edit(beforeMarkdown)
  const diff = buildWorldDocumentContentDiff(
    { format: 'markdown', content: beforeMarkdown },
    { format: 'markdown', content: edited.markdown }
  )
  if (!diff) {
    const error = new Error('局部编辑没有产生内容变化。') as Error & {
      code: string
      retryable: boolean
    }
    error.code = 'INVALID_TOOL_INPUT'
    error.retryable = true
    throw error
  }
  const diffRef = `document-diff:${input.documentId}:${input.expectedRevision}:${input.expectedRevision + 1}`
  const document = await worldEntityDocumentService.updateDocument(
    {
      documentId: input.documentId,
      expectedRevision: input.expectedRevision,
      contentHtml: worldDocumentMarkdownToHtml(edited.markdown),
      contentFormat: 'html'
    },
    {
      operation: '局部编辑世界观文档',
      summary: input.changeSummary,
      diffRef,
      payload: {
        location: edited.location,
        addedLines: diff.addedLines,
        removedLines: diff.removedLines
      },
      editSource: { format: 'markdown', content: edited.markdown }
    }
  )
  worldEntityDocumentChangePublisher.publish({
    changeType: 'updated',
    documentId: document.id,
    revision: document.revision
  })
  return {
    document: toSummary(document),
    changeSummary: input.changeSummary,
    location: edited.location,
    diffRef,
    diff
  }
}

export const listWorldDocumentsTool = defineAgentTool({
  name: 'list_world_documents',
  description: 'List the tree metadata of documents owned by a world or world entity.',
  inputSchema: listWorldDocumentsInputSchema,
  outputSchema: z.object({ documents: z.array(documentSummarySchema) }),
  metadata: {
    whenToUse: [
      '需要查看世界观基础设定或某个实体下有哪些文档',
      '需要解析文档标题、层级或 documentId'
    ],
    whenNotToUse: ['已经知道 documentId 且需要读取正文'],
    inputSummary: '提供 worldId；读取实体文档时再提供 entityId，不传 entityId 表示世界基础设定。',
    outputSummary: '返回文档目录元数据，不返回正文。',
    usageContract: [
      '参数必须直接放在调用顶层，不要把参数对象序列化成 JSON 字符串。',
      '需要读取人物、国家等实体文档时，同时传入 worldId 和 entityId。',
      '需要读取世界基础设定时只传 worldId。'
    ],
    examples: ['{"worldId":"world-id","entityId":"entity-id"}', '{"worldId":"world-id"}'],
    executionLevel: 'safe',
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
    const documents = await worldEntityDocumentService.listDocuments(toDocumentOwner(input))
    return { documents: documents.map(toSummary) }
  },
  successMessage(data) {
    return `Loaded ${data.documents.length} document catalog entries.`
  },
  buildReceipt(data, input) {
    const ownerKind = input.entityId ? 'entity' : 'world'
    const ownerId = input.entityId ?? input.worldId
    return {
      kind: 'world_document_catalog_loaded',
      operation: '读取文档目录',
      subject: {
        type: ownerKind,
        id: ownerId
      },
      completion: 'complete',
      summary: `已读取 ${data.documents.length} 条文档目录记录。`,
      retryable: false,
      evidenceRef: `${ownerKind}:${ownerId}`,
      payload: {
        documentCount: data.documents.length
      }
    }
  }
})

export const readWorldDocumentTool = defineAgentTool({
  name: 'read_world_document',
  description: 'Read one world document by its exact documentId.',
  inputSchema: z.object({ documentId: z.string().trim().min(1) }),
  outputSchema: z.object({ found: z.boolean(), document: documentSchema.nullable() }),
  metadata: {
    whenToUse: [
      '需要读取当前文档或指定文档的完整 Markdown 正文',
      '写入前需要确认当前内容和 revision'
    ],
    whenNotToUse: ['尚不知道 documentId，应先列出文档目录'],
    inputSummary: '提供 documentId。',
    outputSummary: '返回文档正文、归属和 revision。',
    usageContract: [
      'documentId、归属字段和 revision 用于内部定位与后续写入，不应在普通内容讨论中主动展示。',
      '读取成功后直接依据正文回答、概括或评价，不要向用户播报“已经读取文档”。',
      '只有用户明确询问版本、调试信息或并发冲突时，才说明 revision 等内部状态。'
    ],
    executionLevel: 'safe',
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
    return { found: Boolean(document), document: document ? toAgentDocument(document) : null }
  },
  successMessage(data, input) {
    return data.found
      ? `Loaded document ${data.document?.title || input.documentId} at revision ${data.document?.revision}.`
      : `Document ${input.documentId} was not found.`
  },
  buildReceipt(data, input) {
    return {
      kind: 'world_document_read',
      operation: '读取世界观文档',
      subject: {
        type: 'document',
        id: input.documentId,
        label: data.document?.title
      },
      completion: data.found ? 'complete' : 'partial',
      summary: data.found
        ? `已取得文档「${data.document?.title || input.documentId}」的完整正文。`
        : '目标文档不存在，未取得正文。',
      retryable: false,
      evidenceRef: `document:${input.documentId}`,
      payload: {
        found: data.found,
        revision: data.document?.revision
      }
    }
  }
})

export const readWorldDocumentSectionTool = defineAgentTool({
  name: 'read_document_section',
  description: 'Read one Markdown heading section without loading the complete world document.',
  inputSchema: readWorldDocumentSectionInputSchema,
  outputSchema: z.object({
    document: documentSummarySchema,
    section: documentSectionSchema
  }),
  metadata: {
    whenToUse: [
      '只需要读取长文档中的一个已知标题章节',
      '局部编辑前需要刷新章节正文和 section hash'
    ],
    whenNotToUse: ['尚不知道文档结构，应先读取完整文档', '需要跨章节理解全文'],
    inputSummary: '提供 documentId 和 headingPath；重复标题时增加 sectionHash。',
    outputSummary: '返回当前 revision、章节 Markdown 正文和最新 hash。',
    usageContract: [
      'headingPath 使用 read_world_document 返回的标题路径。',
      '同一路径存在多个章节时必须提供 sectionHash，工具不会猜测目标。'
    ],
    executionLevel: 'safe',
    readOnly: true,
    idempotent: true,
    contextRetention: 'evidence',
    uiStage: {
      label: '读取章节',
      runningLabel: '正在阅读文档章节',
      doneLabel: '文档章节已读取'
    }
  },
  async execute(input) {
    const document = await worldEntityDocumentService.getDocument(input.documentId)
    if (!document) {
      const error = new Error(`document not found: ${input.documentId}`) as Error & {
        code: string
        retryable: boolean
      }
      error.code = 'NOT_FOUND'
      error.retryable = false
      throw error
    }
    const section = readMarkdownSection(
      worldDocumentHtmlToMarkdown(document.contentHtml),
      input.headingPath,
      input.sectionHash
    )
    return { document: toSummary(document), section }
  },
  buildReceipt(data) {
    return {
      kind: 'world_document_section_read',
      operation: '读取世界观文档章节',
      subject: {
        type: 'document',
        id: data.document.id,
        label: data.document.title
      },
      completion: 'complete',
      summary: `已取得章节「${data.section.headingPath.at(-1) || data.document.title}」的正文。`,
      retryable: false,
      evidenceRef: `document:${data.document.id}:section:${data.section.hash}`,
      payload: {
        documentId: data.document.id,
        revision: data.document.revision,
        sectionHash: data.section.hash
      }
    }
  }
})

export const createWorldDocumentTool = defineAgentTool({
  name: 'create_world_document',
  description: 'Create a world-level or entity-level document from Markdown content.',
  inputSchema: createWorldDocumentInputSchema,
  outputSchema: z.object({ document: documentSchema }),
  metadata: {
    whenToUse: ['用户明确要求创建新的世界观或实体文档'],
    whenNotToUse: ['只是讨论文档内容，或目标文档已经存在'],
    inputSummary: '提供 worldId 和标题；创建实体文档时增加 entityId，可选父文档和 Markdown 正文。',
    outputSummary: '返回新文档和初始 revision。',
    usageContract: [
      '参数必须直接放在调用顶层，不要传入 owner 嵌套对象或 JSON 字符串。',
      '没有 entityId 时创建世界基础设定文档；存在 entityId 时创建该实体的文档。',
      '正文只通过 contentMarkdown 提交，不要生成或传入 HTML。'
    ],
    examples: [
      '{"worldId":"world-id","entityId":"entity-id","title":"人物志"}',
      '{"worldId":"world-id","title":"力量体系"}'
    ],
    executionLevel: 'notice',
    readOnly: false,
    idempotent: false,
    effectRecovery: 'same_database_transaction',
    contextRetention: 'evidence',
    uiStage: {
      label: '创建文档',
      runningLabel: '正在创建文档',
      doneLabel: '文档已创建'
    }
  },
  async execute(input) {
    const document = await worldEntityDocumentService.createDocument(
      {
        owner: toDocumentOwner(input),
        parentDocumentId: input.parentDocumentId,
        title: input.title,
        contentHtml:
          input.contentMarkdown === undefined
            ? undefined
            : worldDocumentMarkdownToHtml(input.contentMarkdown)
      },
      {
        operation: '创建世界观文档',
        summary: `创建文档「${input.title}」`,
        editSource: {
          format: 'markdown',
          content: input.contentMarkdown ?? ''
        }
      }
    )
    worldEntityDocumentChangePublisher.publish({
      changeType: 'created',
      documentId: document.id,
      revision: document.revision
    })
    return { document: toAgentDocument(document) }
  },
  buildReceipt(data) {
    return {
      kind: 'world_document_created',
      operation: '创建世界观文档',
      subject: {
        type: 'document',
        id: data.document.id,
        label: data.document.title
      },
      completion: 'complete',
      summary: `创建文档「${data.document.title}」`,
      retryable: false,
      evidenceRef: `document:${data.document.id}`,
      payload: {
        documentId: data.document.id,
        revision: data.document.revision
      }
    }
  }
})

export const updateWorldDocumentTool = defineAgentTool({
  name: 'update_world_document',
  description: 'Update the title or complete Markdown content of an existing world document.',
  inputSchema: updateWorldDocumentInputSchema,
  outputSchema: z.object({ document: documentSchema, changeSummary: z.string() }),
  metadata: {
    whenToUse: ['用户明确要求修改当前文档或指定文档', '已经读取正文并持有匹配的 revision'],
    whenNotToUse: ['没有读取最新 revision', '用户只要求分析或提出建议'],
    inputSummary: '提供 documentId、expectedRevision、修改内容和变更摘要。',
    outputSummary: '返回更新后的文档和新 revision。',
    usageContract: [
      '先读取最新文档，再使用返回的 revision 作为 expectedRevision。',
      'contentMarkdown 表示完整的新正文，不是 HTML、JSON 或局部补丁。'
    ],
    executionLevel: 'notice',
    readOnly: false,
    idempotent: false,
    effectRecovery: 'same_database_transaction',
    contextRetention: 'evidence',
    uiStage: {
      label: '更新文档',
      runningLabel: '正在更新文档内容',
      doneLabel: '文档已更新'
    }
  },
  async execute(input) {
    const document = await worldEntityDocumentService.updateDocument(
      {
        documentId: input.documentId,
        expectedRevision: input.expectedRevision,
        title: input.title,
        contentHtml:
          input.contentMarkdown === undefined
            ? undefined
            : worldDocumentMarkdownToHtml(input.contentMarkdown),
        contentFormat: 'html'
      },
      {
        operation: '更新世界观文档',
        summary: input.changeSummary,
        editSource:
          input.contentMarkdown === undefined
            ? undefined
            : { format: 'markdown', content: input.contentMarkdown }
      }
    )
    worldEntityDocumentChangePublisher.publish({
      changeType: 'updated',
      documentId: document.id,
      revision: document.revision
    })
    return { document: toAgentDocument(document), changeSummary: input.changeSummary }
  },
  buildReceipt(data) {
    return {
      kind: 'world_document_updated',
      operation: '更新世界观文档',
      subject: {
        type: 'document',
        id: data.document.id,
        label: data.document.title
      },
      completion: 'complete',
      summary: data.changeSummary,
      retryable: false,
      evidenceRef: `document:${data.document.id}`,
      payload: {
        documentId: data.document.id,
        revision: data.document.revision
      }
    }
  }
})

const buildLocalEditReceipt = (data: z.infer<typeof localEditOutputSchema>) => ({
  kind: 'world_document_locally_edited',
  operation: '局部编辑世界观文档',
  subject: {
    type: 'document',
    id: data.document.id,
    label: data.document.title
  },
  completion: 'complete' as const,
  summary: data.changeSummary,
  retryable: false,
  evidenceRef: `document:${data.document.id}`,
  payload: {
    documentId: data.document.id,
    revision: data.document.revision,
    diffRef: data.diffRef,
    location: data.location,
    expectedRevisionForNextWrite: data.document.revision,
    addedLines: data.diff.addedLines,
    removedLines: data.diff.removedLines
  }
})

const buildLocalEditModelResult = (operation: WorldDocumentLocalEditOperation) =>
  (data: z.infer<typeof localEditOutputSchema>) =>
    buildWorldDocumentEditContinuation({
      operation,
      document: data.document,
      changeSummary: data.changeSummary,
      location: data.location,
      diffRef: data.diffRef,
      addedLines: data.diff.addedLines,
      removedLines: data.diff.removedLines
    })

export const replaceWorldDocumentTextTool = defineAgentTool({
  name: 'replace_text',
  description: 'Replace one uniquely matching Markdown fragment in a world document.',
  inputSchema: replaceWorldDocumentTextInputSchema,
  outputSchema: localEditOutputSchema,
  metadata: {
    whenToUse: ['需要精确替换文档中的一段原文', '已读取最新正文和 revision'],
    whenNotToUse: ['原文在文档中出现多次', '需要重写整个章节或整篇文档'],
    inputSummary: '提供 documentId、expectedRevision、唯一 oldText、newText 和变更摘要。',
    outputSummary: '返回新 revision、语义定位锚点、增删统计和 Diff 引用。',
    usageContract: [
      '先读取文档，oldText 必须从最新 Markdown 原文中完整复制。',
      '只有唯一匹配时才会写入；零次或多次匹配都会返回可恢复错误。'
    ],
    executionLevel: 'notice',
    readOnly: false,
    idempotent: false,
    effectRecovery: 'same_database_transaction',
    contextRetention: 'evidence',
    uiStage: {
      label: '局部替换',
      runningLabel: '正在替换文档内容',
      doneLabel: '局部替换已完成'
    }
  },
  execute: (input) =>
    executeLocalEdit({
      documentId: input.documentId,
      expectedRevision: input.expectedRevision,
      changeSummary: input.changeSummary,
      edit: (markdown) => replaceUniqueMarkdownText(markdown, input.oldText, input.newText)
    }),
  buildModelResult: buildLocalEditModelResult('replace_text'),
  buildReceipt: buildLocalEditReceipt
})

export const insertWorldDocumentTextTool = defineAgentTool({
  name: 'insert_text',
  description: 'Insert Markdown immediately before or after one uniquely matching document fragment.',
  inputSchema: insertWorldDocumentTextInputSchema,
  outputSchema: localEditOutputSchema,
  metadata: {
    whenToUse: ['需要在已知唯一原文前后插入内容', '已读取最新正文和 revision'],
    whenNotToUse: ['只需在文末追加', '锚点原文在文档中出现多次'],
    inputSummary: '提供 documentId、revision、唯一 anchorText、before/after、插入 Markdown 和摘要。',
    outputSummary: '返回新 revision、语义定位锚点、增删统计和 Diff 引用。',
    usageContract: [
      'anchorText 必须从最新 Markdown 原文中完整复制，并且只能出现一次。',
      'insertedMarkdown 会原样插入；需要新段落或标题时必须自行包含换行。'
    ],
    executionLevel: 'notice',
    readOnly: false,
    idempotent: false,
    effectRecovery: 'same_database_transaction',
    contextRetention: 'evidence',
    uiStage: {
      label: '插入内容',
      runningLabel: '正在插入文档内容',
      doneLabel: '文档内容已插入'
    }
  },
  execute: (input) =>
    executeLocalEdit({
      documentId: input.documentId,
      expectedRevision: input.expectedRevision,
      changeSummary: input.changeSummary,
      edit: (markdown) =>
        insertMarkdownText(markdown, input.anchorText, input.insertedMarkdown, input.position)
    }),
  buildModelResult: buildLocalEditModelResult('insert_text'),
  buildReceipt: buildLocalEditReceipt
})

export const appendWorldDocumentTextTool = defineAgentTool({
  name: 'append_text',
  description: 'Append a Markdown block to the end of one world document.',
  inputSchema: appendWorldDocumentTextInputSchema,
  outputSchema: localEditOutputSchema,
  metadata: {
    whenToUse: ['需要把新段落或章节追加到文档末尾', '已读取最新 revision'],
    whenNotToUse: ['需要在文档中间插入或替换内容'],
    inputSummary: '提供 documentId、expectedRevision、追加 Markdown 和变更摘要。',
    outputSummary: '返回新 revision、语义定位锚点、增删统计和 Diff 引用。',
    usageContract: ['工具会在原文和追加内容之间建立一个空行，不需要复制整篇正文。'],
    executionLevel: 'notice',
    readOnly: false,
    idempotent: false,
    effectRecovery: 'same_database_transaction',
    contextRetention: 'evidence',
    uiStage: {
      label: '追加内容',
      runningLabel: '正在追加文档内容',
      doneLabel: '文档内容已追加'
    }
  },
  execute: (input) =>
    executeLocalEdit({
      documentId: input.documentId,
      expectedRevision: input.expectedRevision,
      changeSummary: input.changeSummary,
      edit: (markdown) => appendMarkdownText(markdown, input.appendedMarkdown)
    }),
  buildModelResult: buildLocalEditModelResult('append_text'),
  buildReceipt: buildLocalEditReceipt
})

export const replaceWorldDocumentSectionTool = defineAgentTool({
  name: 'replace_section',
  description: 'Replace one Markdown heading section guarded by its current section hash.',
  inputSchema: replaceWorldDocumentSectionInputSchema,
  outputSchema: localEditOutputSchema,
  metadata: {
    whenToUse: ['需要整体改写某个 Markdown 标题章节', '已从读取结果获得章节路径和 hash'],
    whenNotToUse: ['只需替换一小段原文', '目标文档没有 Markdown 标题'],
    inputSummary: '提供 documentId、revision、headingPath、section hash、完整替换章节和摘要。',
    outputSummary: '返回新 revision、章节语义锚点、增删统计和 Diff 引用。',
    usageContract: [
      'replacementMarkdown 是包含标题行的完整新章节。',
      'expectedSectionHash 必须使用最新 read_world_document 返回的值。'
    ],
    executionLevel: 'notice',
    readOnly: false,
    idempotent: false,
    effectRecovery: 'same_database_transaction',
    contextRetention: 'evidence',
    uiStage: {
      label: '改写章节',
      runningLabel: '正在改写文档章节',
      doneLabel: '章节改写已完成'
    }
  },
  execute: (input) =>
    executeLocalEdit({
      documentId: input.documentId,
      expectedRevision: input.expectedRevision,
      changeSummary: input.changeSummary,
      edit: (markdown) =>
        replaceMarkdownSection(
          markdown,
          input.headingPath,
          input.expectedSectionHash,
          input.replacementMarkdown
        )
    }),
  buildModelResult: buildLocalEditModelResult('replace_section'),
  buildReceipt: buildLocalEditReceipt
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
    executionLevel: 'notice',
    readOnly: false,
    idempotent: false,
    effectRecovery: 'same_database_transaction',
    contextRetention: 'evidence',
    uiStage: {
      label: '重命名文档',
      runningLabel: '正在重命名文档',
      doneLabel: '文档已重命名'
    }
  },
  async execute(input) {
    const document = await worldEntityDocumentService.updateDocument(
      {
        documentId: input.documentId,
        expectedRevision: input.expectedRevision,
        title: input.title
      },
      {
        operation: '重命名世界观文档',
        summary: `文档已重命名为「${input.title}」。`
      }
    )
    worldEntityDocumentChangePublisher.publish({
      changeType: 'updated',
      documentId: document.id,
      revision: document.revision
    })
    return { document: toAgentDocument(document) }
  },
  buildReceipt(data) {
    return {
      kind: 'world_document_renamed',
      operation: '重命名世界观文档',
      subject: {
        type: 'document',
        id: data.document.id,
        label: data.document.title
      },
      completion: 'complete',
      summary: `文档已重命名为「${data.document.title}」。`,
      retryable: false,
      evidenceRef: `document:${data.document.id}`,
      payload: {
        revision: data.document.revision
      }
    }
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
    executionLevel: 'notice',
    readOnly: false,
    idempotent: false,
    effectRecovery: 'same_database_transaction',
    contextRetention: 'evidence',
    uiStage: {
      label: '移动文档',
      runningLabel: '正在调整文档层级',
      doneLabel: '文档层级已更新'
    }
  },
  async execute(input) {
    const document = await worldEntityDocumentService.moveDocument(input, {
      operation: '调整世界观文档层级',
      summary: '文档层级与顺序已更新。'
    })
    worldEntityDocumentChangePublisher.publish({
      changeType: 'moved',
      documentId: document.id,
      revision: document.revision
    })
    return { document: toAgentDocument(document) }
  },
  buildReceipt(data) {
    return {
      kind: 'world_document_moved',
      operation: '调整世界观文档层级',
      subject: {
        type: 'document',
        id: data.document.id,
        label: data.document.title
      },
      completion: 'complete',
      summary: '文档层级与顺序已更新。',
      retryable: false,
      evidenceRef: `document:${data.document.id}`,
      payload: {
        parentDocumentId: data.document.parentDocumentId,
        revision: data.document.revision
      }
    }
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
    executionLevel: 'confirmation_required',
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
    const deletedDocumentIds = await worldEntityDocumentService.deleteDocument(input, {
      operation: '删除世界观文档',
      summary: '删除世界观文档及其子文档。',
      compensatable: true
    })
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
      operation: '删除世界观文档',
      subject: {
        type: 'document',
        id: data.documentId
      },
      completion: 'complete',
      summary: `删除文档 ${data.documentId}`,
      retryable: false,
      payload: { documentId: data.documentId }
    }
  }
})
