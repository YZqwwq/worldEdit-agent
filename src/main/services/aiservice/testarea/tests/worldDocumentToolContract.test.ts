import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createWorldDocumentInputSchema,
  listWorldDocumentsInputSchema,
  replaceWorldDocumentSectionInputSchema,
  replaceWorldDocumentTextInputSchema,
  updateWorldDocumentInputSchema
} from '../../ai-utils/tools/document/worldDocumentToolContracts'
import {
  worldDocumentHtmlToMarkdown,
  worldDocumentMarkdownToHtml
} from '../../ai-utils/tools/document/worldDocumentMarkdownCodec'
import {
  listMarkdownSections,
  replaceMarkdownSection,
  replaceUniqueMarkdownText
} from '../../ai-utils/tools/document/worldDocumentMarkdownEditEngine'

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
