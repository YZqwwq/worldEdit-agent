import MarkdownIt from 'markdown-it'
import TurndownService from 'turndown'

export const MAX_AGENT_DOCUMENT_MARKDOWN_LENGTH = 40000

const MAX_STORED_DOCUMENT_HTML_LENGTH = 40000

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
  breaks: false
})

const htmlReader = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**'
})

htmlReader.remove(['script', 'style'])

const normalizeMarkdown = (value: string): string =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/^(\s*[-+*])\s+/gm, '$1 ')
    .replace(/^(\s*\d+\.)\s+/gm, '$1 ')
    .trim()

export const worldDocumentHtmlToMarkdown = (html: string): string =>
  normalizeMarkdown(htmlReader.turndown(String(html ?? '')))

export const worldDocumentMarkdownToHtml = (markdown: string): string => {
  const normalized = normalizeMarkdown(String(markdown ?? ''))
  if (normalized.length > MAX_AGENT_DOCUMENT_MARKDOWN_LENGTH) {
    throw new Error(
      `Document Markdown exceeds ${MAX_AGENT_DOCUMENT_MARKDOWN_LENGTH} characters.`
    )
  }

  const html = normalized ? markdownRenderer.render(normalized).trim() : ''
  if (html.length > MAX_STORED_DOCUMENT_HTML_LENGTH) {
    throw new Error(
      `Rendered document HTML exceeds ${MAX_STORED_DOCUMENT_HTML_LENGTH} characters.`
    )
  }
  return html
}
