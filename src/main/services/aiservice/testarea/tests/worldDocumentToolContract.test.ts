import assert from 'node:assert/strict'
import test from 'node:test'
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
} from '../../ai-utils/tools/document/worldDocumentToolContracts'
import {
  worldDocumentHtmlToMarkdown,
  worldDocumentMarkdownToHtml
} from '../../ai-utils/tools/document/worldDocumentMarkdownCodec'
import {
  appendMarkdownText,
  insertMarkdownText,
  listMarkdownSections,
  readMarkdownSection,
  replaceMarkdownSection,
  replaceUniqueMarkdownText
} from '../../ai-utils/tools/document/worldDocumentMarkdownEditEngine'
import { buildWorldDocumentEditContinuation } from '../../ai-utils/tools/document/worldDocumentEditContinuation'
import {
  browseWorldDocumentTree,
  searchWorldDocuments,
  worldDocumentMarkdownToVisibleText
} from '../../../worldbuilding/worldDocumentDiscoveryService'
import type { WorldEntityDocumentPayload } from '../../../../../share/cache/worldbuilding/worldEntityDocument'
import {
  findWorldDocumentVisibleTextOffset,
  worldDocumentMarkdownLineToVisibleText
} from '../../../../../share/cache/worldbuilding/worldDocumentSemanticAnchor'
import {
  queryWorldCognitionInputSchema,
  saveWorldCognitionInputSchema
} from '../../ai-utils/tools/cognition/worldCognitionToolContracts'
import { applyWorldCognitionDocumentGuidance } from '../../ai-utils/tools/cognition/worldCognitionDocumentGuidance'

test('world cognition contracts keep Agent ownership internal and require evidence for concepts', () => {
  assert.equal(
    queryWorldCognitionInputSchema.safeParse({
      worldId: 'world-a',
      query: '青岚',
      agentId: 'another-agent'
    }).success,
    false
  )
  assert.equal(
    saveWorldCognitionInputSchema.safeParse({
      worldId: 'world-a',
      parentId: null,
      nodeKind: 'dimension',
      title: '人物',
      markdown: '# 人物',
      documentRefs: []
    }).success,
    true
  )
  assert.equal(
    saveWorldCognitionInputSchema.safeParse({
      worldId: 'world-a',
      parentId: 'dimension-a',
      nodeKind: 'concept',
      title: '李青岚',
      markdown: '# 李青岚\n\n- 别称：青岚',
      documentRefs: []
    }).success,
    false
  )
  assert.equal(
    saveWorldCognitionInputSchema.safeParse({
      worldId: 'world-a',
      nodeId: 'node-a',
      parentId: 'dimension-a',
      nodeKind: 'concept',
      title: '李青岚',
      markdown: '# 李青岚',
      documentRefs: [{ documentId: 'document-a', revision: 1 }]
    }).success,
    false
  )
})

test('available cognition prioritizes document candidates while stale cognition only warns', () => {
  const guided = applyWorldCognitionDocumentGuidance(
    [{ documentId: 'search-first' }, { documentId: 'known-document' }],
    [
      {
        nodeId: 'known-concept',
        title: '李青岚',
        revision: 2,
        status: 'available',
        documentRefs: [{ documentId: 'known-document', revision: 3 }]
      },
      {
        nodeId: 'stale-concept',
        title: '旧称呼',
        revision: 4,
        status: 'needs_review',
        documentRefs: [{ documentId: 'stale-document', revision: 1 }]
      }
    ],
    ['search-first', 'known-document', 'stale-document']
  )

  assert.deepEqual(
    guided.matches.map((match) => match.documentId),
    ['known-document', 'search-first']
  )
  assert.deepEqual(guided.guidance.recommendedDocumentIds, ['known-document'])
  assert.deepEqual(guided.guidance.needsReviewNodeIds, ['stale-concept'])
})

test('document discovery inputs accept simple world-scoped parameters only', () => {
  assert.equal(
    searchWorldDocumentsInputSchema.safeParse({
      worldId: 'world-a',
      query: '青岚',
      entityId: 'entity-a'
    }).success,
    false
  )
  assert.equal(
    searchWorldDocumentsInputSchema.safeParse({
      worldId: 'world-a',
      query: '青岚'
    }).success,
    true
  )
  assert.equal(
    browseWorldDocumentTreeInputSchema.safeParse({
      worldId: 'world-a',
      rootDocumentId: 'document-a'
    }).success,
    true
  )
})

test('legacy nested owner input is not part of the agent-facing contract', () => {
  assert.equal(
    browseWorldDocumentTreeInputSchema.safeParse({
      owner: {
        kind: 'entity',
        worldId: 'world-a',
        entityId: 'entity-a'
      }
    }).success,
    false
  )
})

test('document creation belongs to a world and rejects entity ownership', () => {
  assert.equal(
    createWorldDocumentInputSchema.safeParse({
      worldId: 'world-a',
      title: '人物志',
      contentMarkdown: '## 经历\n\n她从北方来到这里。'
    }).success,
    true
  )
  assert.equal(
    createWorldDocumentInputSchema.safeParse({
      worldId: 'world-a',
      entityId: 'entity-a',
      title: '人物志'
    }).success,
    false
  )
})

const discoveryDocument = (
  id: string,
  title: string,
  contentMarkdown: string,
  parentDocumentId: string | null = null,
  worldId = 'world-a'
): WorldEntityDocumentPayload => ({
  id,
  worldId,
  parentDocumentId,
  title,
  contentHtml: worldDocumentMarkdownToHtml(contentMarkdown),
  contentFormat: 'html',
  sortKey: id,
  revision: 1,
  schemaVersion: 1
})

test('document search finds title fragments and body text with one visible snippet', () => {
  const documents = [
    discoveryDocument(
      'character-root',
      '李青岚',
      '在北境漫长的冬季里，她第一次遇见青岚。后来青岚返回了港口。'
    ),
    discoveryDocument('other', '港口记录', '这里没有目标人物。')
  ]
  const matches = searchWorldDocuments(documents, '青岚', 10)

  assert.equal(matches.strategy, 'hybrid_exact_bm25')
  assert.equal(matches.matches.length, 1)
  assert.equal(matches.matches[0].documentId, 'character-root')
  assert.deepEqual(matches.matches[0].matchedIn, ['title', 'path', 'content'])
  assert.equal(matches.matches[0].occurrenceCount, 2)
  assert.match(matches.matches[0].snippet ?? '', /第一次遇见青岚/)
  assert.ok((matches.matches[0].snippet ?? '').length < documents[0].contentHtml.length)
})

test('document search reads formatted Markdown as visible text and respects the result limit', () => {
  assert.equal(
    worldDocumentMarkdownToVisibleText('## **青岚**\n\n她前往[北境港口](https://example.com)。'),
    '青岚 她前往北境港口。'
  )
  const documents = [
    discoveryDocument('a', '青岚', '**青岚**的记录'),
    discoveryDocument('b', '青岚旧事', '另一份青岚记录')
  ]
  const matches = searchWorldDocuments(documents, '青岚', 1)
  assert.equal(matches.matches.length, 1)
  assert.equal(matches.matches[0].documentId, 'a')
  assert.equal(matches.totalMatches, 2)
  assert.equal(matches.hasMore, true)
})

test('document search ranks exact titles before path and body-only matches', () => {
  const documents = [
    discoveryDocument('root', '北境人物', ''),
    discoveryDocument('body', '港口旧事', '青岚曾到访这里。'),
    discoveryDocument('path', '生平', '', 'root'),
    discoveryDocument('exact', '青岚', '')
  ]
  documents[0].title = '青岚资料'
  const matches = searchWorldDocuments(documents, '青岚', 10)
  assert.equal(matches.matches[0].documentId, 'exact')
  assert.ok(matches.matches.some((match) => match.documentId === 'body'))
})

test('hybrid document search recalls natural multi-term queries without an exact phrase', () => {
  const documents = [
    discoveryDocument(
      'target',
      '北境人物记录',
      '她常年驻守雪原，是当地少见的女性将领。战斗时惯用一柄长枪。'
    ),
    discoveryDocument('distractor', '南方商会', '商人们在温暖港口讨论货物价格。')
  ]
  const result = searchWorldDocuments(documents, '北境 女性 长枪', 10)

  assert.equal(result.matches[0].documentId, 'target')
  assert.ok(result.queryTerms.includes('北境'))
  assert.ok(!result.queryTerms.includes('北境女性'))
  assert.ok(result.matches[0].matchedTerms.includes('女性'))
  assert.ok(result.matches[0].matchedTerms.includes('长枪'))
  assert.match(result.matches[0].snippet ?? '', /女性将领.*长枪/)
  assert.equal(result.matches[0].occurrenceCount, 0)
})

test('hybrid document search uses Chinese n-grams to recall a partial name', () => {
  const documents = [
    discoveryDocument('target', '李青岚的人物记录', '她来自北境。'),
    discoveryDocument('other', '李青山的人物记录', '他来自南境。')
  ]
  const result = searchWorldDocuments(documents, '青岚', 10)

  assert.equal(result.matches[0].documentId, 'target')
  assert.ok(result.matches[0].score > result.matches.at(-1)!.score)
})

test('document search rebuilds cached indexes when same-revision content or paths change', () => {
  const document = discoveryDocument('target', '旧目录', '青岚来自北境。')
  assert.equal(searchWorldDocuments([document], '北境', 10).matches.length, 1)

  const restored = {
    ...document,
    title: '新目录',
    contentHtml: worldDocumentMarkdownToHtml('青岚来自南境。')
  }
  assert.equal(searchWorldDocuments([restored], '北境', 10).matches.length, 0)
  assert.equal(searchWorldDocuments([restored], '南境', 10).matches[0].documentId, 'target')
  assert.deepEqual(searchWorldDocuments([restored], '新目录', 10).matches[0].path, ['新目录'])
})

test('document tree browsing reveals roots incrementally and marks deeper branches', () => {
  const documents = [
    discoveryDocument('root', '人物资料', ''),
    discoveryDocument('child', '青岚', '', 'root'),
    discoveryDocument('grandchild', '经历', '', 'child'),
    discoveryDocument('great-grandchild', '北境时期', '', 'grandchild')
  ]

  const initial = browseWorldDocumentTree(documents)
  assert.ok(initial)
  assert.equal(initial.roots[0].documentId, 'root')
  assert.equal(initial.roots[0].children[0].documentId, 'child')
  assert.equal(initial.roots[0].children[0].children.length, 0)
  assert.equal(initial.roots[0].children[0].hasMoreChildren, true)
  assert.deepEqual(initial.nextBrowsableDocumentIds, ['child'])

  const continued = browseWorldDocumentTree(documents, 'child')
  assert.ok(continued)
  assert.equal(continued.roots[0].children[0].documentId, 'grandchild')
  assert.equal(continued.roots[0].children[0].children[0].documentId, 'great-grandchild')
  assert.equal(continued.nextBrowsableDocumentIds.length, 0)
  assert.equal(browseWorldDocumentTree(documents, 'missing'), null)
})

test('agent document writes accept Markdown and reject the old HTML contract', () => {
  assert.equal(
    updateWorldDocumentInputSchema.safeParse({
      documentId: 'document-a',
      expectedRevision: 3,
      contentMarkdown: '**新的内容**',
      changeSummary: '更新正文'
    }).success,
    true
  )
  assert.equal(
    updateWorldDocumentInputSchema.safeParse({
      documentId: 'document-a',
      expectedRevision: 3,
      contentHtml: '<p>旧入口</p>',
      changeSummary: '更新正文'
    }).success,
    false
  )
})

test('document Markdown codec preserves the supported editor structure', () => {
  const markdown = [
    '## 基础物质运用',
    '',
    '不同种族使用 **不同名称**，但遵循同一种规律。',
    '',
    '- 魔力',
    '- 气',
    '',
    '> 表象不同，本质相同。'
  ].join('\n')
  const html = worldDocumentMarkdownToHtml(markdown)
  const restored = worldDocumentHtmlToMarkdown(html)

  assert.match(html, /<h2>基础物质运用<\/h2>/)
  assert.match(html, /<strong>不同名称<\/strong>/)
  assert.equal(restored, markdown)
})

test('raw HTML in Agent Markdown is escaped instead of becoming editor markup', () => {
  const html = worldDocumentMarkdownToHtml('<script>alert(1)</script>')
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;/)
})

test('replace_text only edits a uniquely matching Markdown fragment', () => {
  assert.equal(
    replaceWorldDocumentTextInputSchema.safeParse({
      documentId: 'document-a',
      expectedRevision: 2,
      oldText: '旧设定',
      newText: '新设定',
      changeSummary: '更新设定'
    }).success,
    true
  )
  const result = replaceUniqueMarkdownText('# 标题\n\n旧设定', '旧设定', '新设定\n补充')
  assert.equal(result.markdown, '# 标题\n\n新设定\n补充')
  assert.deepEqual(result.location.headingPath, ['标题'])
  assert.equal(result.location.anchorText, '新设定')
  assert.equal(result.location.markdownAnchorText, '新设定')
  assert.match(result.location.sectionHash ?? '', /^[a-f0-9]{64}$/)
  assert.throws(
    () => replaceUniqueMarkdownText('重复\n重复', '重复', '新文'),
    (error: unknown) =>
      error instanceof Error && 'constraint' in error && error.constraint === 'anchor_not_unique'
  )
})

test('replace_section uses heading paths and rejects stale section hashes', () => {
  const markdown = '# 世界\n\n## 北境\n\n旧内容\n\n## 南境\n\n保留内容'
  const sections = listMarkdownSections(markdown)
  const north = sections.find((section) => section.headingPath.join('/') === '世界/北境')
  assert.ok(north)
  assert.equal(
    replaceWorldDocumentSectionInputSchema.safeParse({
      documentId: 'document-a',
      expectedRevision: 2,
      headingPath: north.headingPath,
      expectedSectionHash: north.hash,
      replacementMarkdown: '## 北境\n\n新内容',
      changeSummary: '改写北境'
    }).success,
    true
  )
  const result = replaceMarkdownSection(
    markdown,
    north.headingPath,
    north.hash,
    '## 北境\n\n新内容'
  )
  assert.match(result.markdown, /新内容/)
  assert.match(result.markdown, /保留内容/)
  assert.throws(() =>
    replaceMarkdownSection(markdown, north.headingPath, '0'.repeat(64), '## 北境\n\n新内容')
  )
})

test('replace_section uses the hash to disambiguate duplicate heading paths', () => {
  const markdown = '# 世界\n\n## 记录\n\n第一份\n\n## 记录\n\n第二份'
  const matches = listMarkdownSections(markdown).filter(
    (section) => section.headingPath.join('/') === '世界/记录'
  )
  assert.equal(matches.length, 2)

  const result = replaceMarkdownSection(
    markdown,
    matches[1].headingPath,
    matches[1].hash,
    '## 记录\n\n更新第二份'
  )
  assert.match(result.markdown, /第一份/)
  assert.match(result.markdown, /更新第二份/)
  assert.doesNotMatch(result.markdown, /\n\n第二份$/)
})

test('semantic anchors match TipTap-visible text for formatted Markdown', () => {
  assert.equal(
    worldDocumentMarkdownLineToVisibleText('- [x] **阅读** [人物文档](https://example.com)'),
    '阅读 人物文档'
  )
  assert.equal(findWorldDocumentVisibleTextOffset('阅读   人物文档', '阅读 人物文档'), 0)
  assert.equal(findWorldDocumentVisibleTextOffset('前缀\u00a0人物文档', '人物文档'), 3)
})

test('insert_text inserts before or after one unique Markdown anchor', () => {
  assert.equal(
    insertWorldDocumentTextInputSchema.safeParse({
      documentId: 'document-a',
      expectedRevision: 2,
      anchorText: '第二段',
      insertedMarkdown: '新增段落\n\n',
      position: 'before',
      changeSummary: '插入补充说明'
    }).success,
    true
  )
  const before = insertMarkdownText('第一段\n\n第二段', '第二段', '新增段落\n\n', 'before')
  assert.equal(before.markdown, '第一段\n\n新增段落\n\n第二段')
  const after = insertMarkdownText('第一段\n\n第二段', '第一段', '\n\n新增段落', 'after')
  assert.equal(after.markdown, '第一段\n\n新增段落\n\n第二段')
  assert.throws(
    () => insertMarkdownText('重复\n重复', '重复', '新增', 'after'),
    (error: unknown) =>
      error instanceof Error && 'constraint' in error && error.constraint === 'anchor_not_unique'
  )
})

test('append_text adds one Markdown block boundary and a semantic location', () => {
  assert.equal(
    appendWorldDocumentTextInputSchema.safeParse({
      documentId: 'document-a',
      expectedRevision: 2,
      appendedMarkdown: '## 新章节\n\n内容',
      changeSummary: '追加新章节'
    }).success,
    true
  )
  const result = appendMarkdownText('# 标题\n\n正文\n', '## **新章节**\n\n内容')
  assert.equal(result.markdown, '# 标题\n\n正文\n\n## **新章节**\n\n内容')
  assert.deepEqual(result.location.headingPath, ['标题', '新章节'])
  assert.equal(result.location.anchorText, '新章节')
})

test('read_document_section returns one section and requires a hash for duplicate paths', () => {
  const markdown = '# 世界\n\n## **记录**\n\n第一份\n\n## **记录**\n\n第二份'
  const matches = listMarkdownSections(markdown).filter(
    (section) => section.headingPath.join('/') === '世界/记录'
  )
  assert.equal(matches.length, 2)
  assert.equal(
    readWorldDocumentSectionInputSchema.safeParse({
      documentId: 'document-a',
      headingPath: ['世界', '记录'],
      sectionHash: matches[1].hash
    }).success,
    true
  )
  const section = readMarkdownSection(markdown, ['世界', '记录'], matches[1].hash)
  assert.match(section.contentMarkdown, /第二份/)
  assert.doesNotMatch(section.contentMarkdown, /第一份/)
  assert.throws(
    () => readMarkdownSection(markdown, ['世界', '记录']),
    (error: unknown) =>
      error instanceof Error && 'constraint' in error && error.constraint === 'section_not_unique'
  )
})

test('local edit continuation exposes the authoritative next revision and valid anchors', () => {
  const continuation = buildWorldDocumentEditContinuation({
    operation: 'replace_section',
    document: { id: 'document-a', title: '人物志', revision: 8 },
    changeSummary: '改写经历章节',
    location: {
      headingPath: ['人物志', '经历'],
      anchorText: '经历',
      markdownAnchorText: '## **经历**',
      sectionHash: 'a'.repeat(64),
      anchorHash: 'b'.repeat(64)
    },
    diffRef: 'document-diff:document-a:7:8',
    addedLines: 4,
    removedLines: 2
  })

  assert.equal(continuation.completed.resultingRevision, 8)
  assert.equal(continuation.continuation.expectedRevisionForNextWrite, 8)
  assert.equal(continuation.continuation.currentSectionHash, 'a'.repeat(64))
  assert.equal(continuation.continuation.uniqueMarkdownAnchor, '## **经历**')
  assert.match(continuation.continuation.guidance.join(' '), /Do not repeat/)
})
