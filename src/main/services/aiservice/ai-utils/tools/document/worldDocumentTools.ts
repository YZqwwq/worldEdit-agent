import { z } from 'zod'
import { AgentToolError, defineAgentTool } from '../../core/agentTool'
import { worldEntityDocumentService } from '../../../../worldbuilding/worldEntityDocumentService'
import { worldEntityDocumentChangePublisher } from '../../../../worldbuilding/worldEntityDocumentChangePublisher'
import {
  appendWorldDocumentTextInputSchema,
  browseWorldDocumentTreeInputSchema,
  createWorldDocumentInputSchema,
  insertWorldDocumentTextInputSchema,
  readWorldDocumentSectionInputSchema,
  replaceWorldDocumentSectionInputSchema,
  replaceWorldDocumentTextInputSchema,
  searchWorldDocumentsInputSchema,
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
import {
  browseWorldDocumentTree,
  searchWorldDocuments,
  type WorldDocumentTreeNode
} from '../../../../worldbuilding/worldDocumentDiscoveryService'
import { AppDataSource } from '../../../../../database'
import {
  AgentWorldCognitionService,
  MAIN_AGENT_COGNITION_OWNER_ID
} from '../../../../worldbuilding/agentWorldCognitionService'
import {
  applyWorldCognitionDocumentGuidance,
  EMPTY_WORLD_COGNITION_DOCUMENT_GUIDANCE
} from '../cognition/worldCognitionDocumentGuidance'

const documentSummarySchema = z.object({
  id: z.string(),
  worldId: z.string(),
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

const documentSearchMatchSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  parentDocumentId: z.string().nullable(),
  path: z.array(z.string()),
  revision: z.number().int().positive(),
  matchedIn: z.array(z.enum(['title', 'path', 'content'])),
  matchedTerms: z.array(z.string()),
  occurrenceCount: z.number().int().nonnegative(),
  snippet: z.string().nullable(),
  score: z.number().nonnegative()
})

const cognitionDocumentGuidanceSchema = z.object({
  matchedNodeCount: z.number().int().nonnegative(),
  hints: z.array(
    z.object({
      nodeId: z.string(),
      title: z.string(),
      revision: z.number().int().positive(),
      status: z.enum(['available', 'needs_review']),
      documentRefs: z.array(
        z.object({
          documentId: z.string(),
          revision: z.number().int().positive()
        })
      )
    })
  ),
  recommendedDocumentIds: z.array(z.string()),
  needsReviewNodeIds: z.array(z.string())
})

const documentTreeNodeSchema: z.ZodType<WorldDocumentTreeNode> = z.lazy(() =>
  z.object({
    documentId: z.string(),
    title: z.string(),
    parentDocumentId: z.string().nullable(),
    path: z.array(z.string()),
    revision: z.number().int().positive(),
    childCount: z.number().int().nonnegative(),
    hasMoreChildren: z.boolean(),
    children: z.array(documentTreeNodeSchema)
  })
)

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
  worldId: document.worldId,
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

export const searchWorldDocumentsTool = defineAgentTool({
  name: 'search_world_documents',
  description: 'Search document titles, paths, and visible body text within one world.',
  inputSchema: searchWorldDocumentsInputSchema,
  outputSchema: z.object({
    query: z.string(),
    queryTerms: z.array(z.string()),
    strategy: z.literal('hybrid_exact_bm25'),
    indexBuiltAt: z.string(),
    totalMatches: z.number().int().nonnegative(),
    hasMore: z.boolean(),
    matchCount: z.number().int().nonnegative(),
    matches: z.array(documentSearchMatchSchema),
    cognitionGuidance: cognitionDocumentGuidanceSchema
  }),
  metadata: {
    whenToUse: [
      '只知道对象名称、简称或关键词，尚不知道它位于哪些文档',
      '需要从一个世界观的文档标题、目录路径和正文中寻找候选'
    ],
    whenNotToUse: ['已经知道准确 documentId，应直接读取文档', '只是想沿已知目录查看结构'],
    inputSummary: '提供 worldId 和查询文本 query；可选 limit，默认 10，最大 30。',
    outputSummary:
      '返回按文档检索排序的候选及相关摘要；若主 Agent 已有有效认知，同时返回并优先提示认知引用的文档。',
    usageContract: [
      '参数必须直接放在调用顶层，不要把参数对象序列化成 JSON 字符串。',
      '搜索结果只是文档证据，不代表系统已判断对象是人物、国家或其他固定类型。',
      '支持自然多关键词查询，关键词可以分散出现在标题、路径和正文中。',
      '同一文档只返回一次；snippet 优先选择关键词最集中的正文片段，occurrenceCount 是完整查询短语在正文中的出现次数。',
      'cognitionGuidance 只是 Agent 既有认识提供的导航提示；available 可以优先阅读，needs_review 必须重新搜索验证。',
      'recommendedDocumentIds 可能包含未被正文关键词直接命中的文档，应结合认知卡片和当前文档内容判断，不能直接当作事实。',
      'hasMore 为 true 时表示结果被 limit 截断；优先增加更具体的关键词，而不是盲目扩大结果数量。',
      '没有结果时可换用完整名称、简称或相关关键词，不要用完全相同的参数重复调用。'
    ],
    examples: ['{"worldId":"world-id","query":"青岚"}'],
    executionLevel: 'safe',
    readOnly: true,
    idempotent: true,
    contextRetention: 'evidence',
    uiStage: {
      label: '搜索世界观文档',
      runningLabel: '正在搜索世界观文档',
      doneLabel: '文档搜索已完成'
    }
  },
  async execute(input) {
    const documents = await worldEntityDocumentService.listDocuments(input.worldId)
    const result = searchWorldDocuments(documents, input.query, input.limit)
    let cognitionGuidance = EMPTY_WORLD_COGNITION_DOCUMENT_GUIDANCE
    let matches = result.matches
    try {
      const cognition = await new AgentWorldCognitionService(AppDataSource).queryNodes({
        agentId: MAIN_AGENT_COGNITION_OWNER_ID,
        worldId: input.worldId,
        query: input.query,
        limit: 3
      })
      const guided = applyWorldCognitionDocumentGuidance(
        result.matches,
        cognition.matches.map((node) => ({
          nodeId: node.id,
          title: node.title,
          revision: node.revision,
          status: node.status,
          documentRefs: node.documentRefs
        })),
        documents.map((document) => document.id)
      )
      matches = guided.matches
      cognitionGuidance = guided.guidance
    } catch {
      // Cognition improves discovery but must never make the document search unavailable.
    }
    return { ...result, matches, matchCount: matches.length, cognitionGuidance }
  },
  successMessage(data) {
    return `Found ${data.matchCount} world document matches for ${data.query}.`
  },
  buildReceipt(data, input) {
    return {
      kind: 'world_documents_searched',
      operation: '搜索世界观文档',
      subject: {
        type: 'world',
        id: input.worldId
      },
      completion: 'complete',
      summary: `关键词「${data.query}」命中 ${data.matchCount} 篇文档。`,
      retryable: false,
      evidenceRef: `world:${input.worldId}:document-search:${encodeURIComponent(data.query)}`,
      payload: {
        query: data.query,
        matchCount: data.matchCount,
        totalMatches: data.totalMatches,
        hasMore: data.hasMore,
        documentIds: data.matches.map((match) => match.documentId),
        cognitionNodeIds: data.cognitionGuidance.hints.map((hint) => hint.nodeId),
        cognitionRecommendedDocumentIds: data.cognitionGuidance.recommendedDocumentIds,
        strategy: data.strategy
      }
    }
  }
})

export const browseWorldDocumentTreeTool = defineAgentTool({
  name: 'browse_world_document_tree',
  description:
    'Browse a world document tree incrementally, revealing at most two levels at a time.',
  inputSchema: browseWorldDocumentTreeInputSchema,
  outputSchema: z.object({
    rootDocumentId: z.string().nullable(),
    roots: z.array(documentTreeNodeSchema),
    nextBrowsableDocumentIds: z.array(z.string())
  }),
  metadata: {
    whenToUse: [
      '需要了解世界观文档的根目录结构',
      '已经知道一个目录或根文档，需要继续查看其下级结构'
    ],
    whenNotToUse: ['需要按名称或正文关键词寻找未知文档', '已经知道 documentId 且需要正文'],
    inputSummary: '提供 worldId；继续深入时再提供 rootDocumentId。',
    outputSummary: '返回根节点及有限深度子节点，并标明可继续展开的节点。',
    usageContract: [
      '不传 rootDocumentId 时返回世界根文档及其直接子级。',
      '传 rootDocumentId 时返回该节点及其向下两层后代。',
      '只有 hasMoreChildren 为 true 的节点仍有未披露后代；继续时使用 nextBrowsableDocumentIds 中的 ID。',
      '该工具不返回正文；确定目标文档后使用 read_world_document。'
    ],
    examples: ['{"worldId":"world-id"}', '{"worldId":"world-id","rootDocumentId":"document-id"}'],
    executionLevel: 'safe',
    readOnly: true,
    idempotent: true,
    contextRetention: 'evidence',
    uiStage: {
      label: '浏览文档结构',
      runningLabel: '正在浏览文档结构',
      doneLabel: '文档结构已读取'
    }
  },
  async execute(input) {
    const documents = await worldEntityDocumentService.listDocuments(input.worldId)
    const result = browseWorldDocumentTree(documents, input.rootDocumentId)
    if (!result) {
      throw new AgentToolError({
        code: 'NOT_FOUND',
        message: '指定根文档不存在，或不属于当前世界观。',
        retryable: true,
        details: {
          worldId: input.worldId,
          rootDocumentId: input.rootDocumentId
        },
        nextSuggestions: [
          '不传 rootDocumentId，从当前世界观的根文档重新浏览。',
          '使用 search_world_documents 返回的 documentId 作为根文档。'
        ]
      })
    }
    return result
  },
  successMessage(data) {
    return `Loaded ${data.roots.length} document tree root entries.`
  },
  nextSuggestions(data, input) {
    if (data.nextBrowsableDocumentIds.length > 0) {
      return ['如需深入，只选择与任务相关的 nextBrowsableDocumentIds 继续浏览。']
    }
    return input.rootDocumentId ? ['该范围已披露到叶节点，可读取相关文档正文。'] : []
  },
  buildReceipt(data, input) {
    return {
      kind: 'world_document_tree_browsed',
      operation: '浏览世界观文档结构',
      subject: {
        type: input.rootDocumentId ? 'document' : 'world',
        id: input.rootDocumentId ?? input.worldId
      },
      completion: 'complete',
      summary: input.rootDocumentId
        ? `已取得根文档及向下两层结构，共 ${data.roots.length} 个入口。`
        : `已取得世界观根文档及其直接子级，共 ${data.roots.length} 个根入口。`,
      retryable: false,
      evidenceRef: input.rootDocumentId
        ? `document:${input.rootDocumentId}:tree`
        : `world:${input.worldId}:document-tree`,
      payload: {
        rootDocumentId: input.rootDocumentId ?? null,
        nextBrowsableDocumentIds: data.nextBrowsableDocumentIds
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
    whenNotToUse: ['尚不知道 documentId，应先搜索文档或浏览目录结构'],
    inputSummary: '提供 documentId。',
    outputSummary: '返回文档正文、树位置和 revision。',
    usageContract: [
      'documentId、树位置和 revision 用于内部定位与后续写入，不应在普通内容讨论中主动展示。',
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
  description: 'Create a free-form document in one world document tree from Markdown content.',
  inputSchema: createWorldDocumentInputSchema,
  outputSchema: z.object({ document: documentSchema }),
  metadata: {
    whenToUse: ['用户明确要求创建新的世界观文档'],
    whenNotToUse: ['只是讨论文档内容，或目标文档已经存在'],
    inputSummary: '提供 worldId 和标题，可选父文档和 Markdown 正文。',
    outputSummary: '返回新文档和初始 revision。',
    usageContract: [
      '参数必须直接放在调用顶层，不要传入 owner 嵌套对象或 JSON 字符串。',
      '文档只归属于世界观，不要推测或传入人物、国家等实体 ID。',
      '正文只通过 contentMarkdown 提交，不要生成或传入 HTML。'
    ],
    examples: ['{"worldId":"world-id","title":"力量体系"}'],
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
        worldId: input.worldId,
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

const buildLocalEditModelResult =
  (operation: WorldDocumentLocalEditOperation) => (data: z.infer<typeof localEditOutputSchema>) =>
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
  description:
    'Insert Markdown immediately before or after one uniquely matching document fragment.',
  inputSchema: insertWorldDocumentTextInputSchema,
  outputSchema: localEditOutputSchema,
  metadata: {
    whenToUse: ['需要在已知唯一原文前后插入内容', '已读取最新正文和 revision'],
    whenNotToUse: ['只需在文末追加', '锚点原文在文档中出现多次'],
    inputSummary:
      '提供 documentId、revision、唯一 anchorText、before/after、插入 Markdown 和摘要。',
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
  description: 'Move a document within its world document tree.',
  inputSchema: z.object({
    documentId: z.string().trim().min(1),
    expectedRevision: z.number().int().positive(),
    parentDocumentId: z.string().trim().min(1).nullable(),
    sortKey: z.string().trim().min(1).optional()
  }),
  outputSchema: z.object({ document: documentSchema }),
  metadata: {
    whenToUse: ['用户明确要求调整文档层级或顺序'],
    whenNotToUse: ['需要把文档移动到另一个世界；文档不能跨世界移动'],
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
