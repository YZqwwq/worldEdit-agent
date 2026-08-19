import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appendWorldDocumentTextInputSchema,
  createWorldDocumentInputSchema,
  insertWorldDocumentTextInputSchema,
  listWorldDocumentsInputSchema,
  readWorldDocumentSectionInputSchema,
  replaceWorldDocumentSectionInputSchema,
  replaceWorldDocumentTextInputSchema,
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
  findWorldDocumentVisibleTextOffset,
  worldDocumentMarkdownLineToVisibleText
} from '../../../../../share/cache/worldbuilding/worldDocumentSemanticAnchor'

test('document catalog input uses flat world and entity references', () => {
  assert.equal(
    listWorldDocumentsInputSchema.safeParse({
      worldId: 'world-a',
      entityId: 'entity-a'
    }).success,
    true
  )
  assert.equal(
    listWorldDocumentsInputSchema.safeParse({
      worldId: 'world-a'
    }).success,
    true
  )
})

test('legacy nested owner input is not part of the agent-facing contract', () => {
  assert.equal(
    listWorldDocumentsInputSchema.safeParse({
      owner: {
        kind: 'entity',
        worldId: 'world-a',
        entityId: 'entity-a'
      }
    }).success,
    false
  )
})

test('document creation follows the same flat owner contract', () => {
  assert.equal(
    createWorldDocumentInputSchema.safeParse({
      worldId: 'world-a',
      entityId: 'entity-a',
      title: '人物志',
      contentMarkdown: '## 经历\n\n她从北方来到这里。'
    }).success,
    true
  )
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
