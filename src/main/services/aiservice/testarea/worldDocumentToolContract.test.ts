import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createWorldDocumentInputSchema,
  listWorldDocumentsInputSchema,
  updateWorldDocumentInputSchema
} from '../ai-utils/tools/document/worldDocumentToolContracts'
import {
  worldDocumentHtmlToMarkdown,
  worldDocumentMarkdownToHtml
} from '../ai-utils/tools/document/worldDocumentMarkdownCodec'

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
