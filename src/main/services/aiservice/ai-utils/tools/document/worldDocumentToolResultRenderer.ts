import type { AgentToolResultEnvelope } from '../../core/agentTool'

const DOCUMENT_TOOL_NAMES = new Set([
  'search_world_documents',
  'browse_world_document_tree',
  'read_world_document',
  'read_document_section',
  'read_document_sections_by_title',
  'create_world_document',
  'update_world_document',
  'replace_text',
  'insert_text',
  'append_text',
  'replace_section',
  'rename_world_document',
  'move_world_document',
  'delete_world_document'
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const number = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const quote = (value: string): string => `「${value}」`

const documentLabel = (document: Record<string, unknown>): string =>
  text(document.title) || text(document.id) || '未命名文档'

const documentIdentity = (document: Record<string, unknown>): string => {
  const id = text(document.id)
  const revision = number(document.revision)
  return [id ? `文档标识：${id}` : '', revision !== undefined ? `当前版本：${revision}` : '']
    .filter(Boolean)
    .join('；')
}

const renderDocument = (document: Record<string, unknown>, includeBody: boolean): string => {
  const title = documentLabel(document)
  const lines = [`文档 ${quote(title)}${includeBody ? '已读完' : '已更新'}。`]
  const identity = documentIdentity(document)
  if (identity) lines.push(identity)
  if (text(document.parentDocumentId)) lines.push(`父文档：${document.parentDocumentId}`)
  if (includeBody && typeof document.contentMarkdown === 'string') {
    lines.push('', '正文：', document.contentMarkdown)
  }
  return lines.join('\n')
}

const renderSearch = (data: Record<string, unknown>): string => {
  const query = text(data.query)
  const matches = list(data.matches).filter(isRecord)
  const lines = [`我用${quote(query || '当前关键词')}查了世界观文档，找到 ${matches.length} 个相关位置：`]
  matches.forEach((match, index) => {
    const title = text(match.title) || text(match.documentId) || '未命名文档'
    const path = list(match.path).filter((item): item is string => typeof item === 'string').join(' / ')
    const matchedIn = list(match.matchedIn).filter((item): item is string => typeof item === 'string')
    lines.push('', `${index + 1}. ${quote(title)}`)
    if (path) lines.push(`   路径：${path}`)
    if (text(match.documentId)) lines.push(`   文档标识：${match.documentId}`)
    if (number(match.revision) !== undefined) lines.push(`   版本：${match.revision}`)
    if (matchedIn.length) lines.push(`   命中：${matchedIn.join('、')}`)
    if (text(match.snippet)) lines.push(`   摘要：${match.snippet}`)
  })
  if (data.hasMore === true) lines.push('', '结果还有更多；可以换用更具体的关键词继续查找。')
  if (matches.length === 0) lines.push('', '没有找到匹配内容，可以改用完整名称、简称或相关关键词。')
  return lines.join('\n')
}

const renderTreeNode = (node: Record<string, unknown>, depth: number, lines: string[]): void => {
  const title = text(node.title) || text(node.documentId) || '未命名文档'
  const revision = number(node.revision)
  const suffix = [revision !== undefined ? `v${revision}` : '', text(node.documentId) ? `id=${node.documentId}` : '']
    .filter(Boolean)
    .join(' · ')
  lines.push(`${'  '.repeat(depth)}- ${title}${suffix ? ` (${suffix})` : ''}`)
  list(node.children).filter(isRecord).forEach((child) => renderTreeNode(child, depth + 1, lines))
  if (node.hasMoreChildren === true) lines.push(`${'  '.repeat(depth + 1)}… 这里还可以继续展开`)
}

const renderTree = (data: Record<string, unknown>): string => {
  const lines = ['我看到了这部分世界观文档结构：']
  list(data.roots).filter(isRecord).forEach((root) => renderTreeNode(root, 0, lines))
  const next = list(data.nextBrowsableDocumentIds).filter((item): item is string => typeof item === 'string')
  if (next.length) lines.push('', `仍可深入的节点：${next.join('、')}`)
  return lines.join('\n')
}

const renderSection = (data: Record<string, unknown>, byTitle: boolean): string => {
  const document = isRecord(data.document) ? data.document : undefined
  const title = document ? documentLabel(document) : '目标文档'
  const sections = byTitle ? list(data.sections).filter(isRecord) : [isRecord(data.section) ? data.section : {}]
  const heading = byTitle ? text(data.sectionTitle) : ''
  const lines = [byTitle ? `我在文档 ${quote(title)} 中找到了 ${sections.length} 个标题为${quote(heading)}的章节。` : `我读完了文档 ${quote(title)} 的指定章节。`]
  if (document) {
    const identity = documentIdentity(document)
    if (identity) lines.push(identity)
  }
  sections.forEach((section, index) => {
    const path = list(section.headingPath).filter((item): item is string => typeof item === 'string').join(' / ')
    if (byTitle && sections.length > 1) lines.push('', `第 ${index + 1} 个匹配章节：`)
    if (path) lines.push(`标题路径：${path}`)
    if (text(section.hash)) lines.push(`章节校验：${section.hash}`)
    if (typeof section.contentMarkdown === 'string') lines.push('', '章节正文：', section.contentMarkdown)
  })
  if (byTitle && sections.length === 0) lines.push('', '没有找到这个标题的章节。')
  return lines.join('\n')
}

const renderLocalEdit = (data: Record<string, unknown>): string => {
  const completed = isRecord(data.completed) ? data.completed : data
  const continuation = isRecord(data.continuation) ? data.continuation : undefined
  const title = text(completed.documentTitle) || text(completed.documentId) || '目标文档'
  const operation = text(completed.operation) || '局部编辑'
  const lines = [`我已经在文档 ${quote(title)} 中完成了这次${operation}。`]
  if (text(completed.changeSummary)) lines.push(`改动：${completed.changeSummary}`)
  const revision = number(completed.resultingRevision)
  const added = number(completed.addedLines)
  const removed = number(completed.removedLines)
  if (revision !== undefined) lines.push(`文档现在是第 ${revision} 版。`)
  if (added !== undefined || removed !== undefined) lines.push(`行数变化：新增 ${added ?? 0} 行，移除 ${removed ?? 0} 行。`)
  if (continuation) {
    const nextRevision = number(continuation.expectedRevisionForNextWrite)
    if (nextRevision !== undefined) lines.push(`如果继续修改，应以第 ${nextRevision} 版为起点。`)
    if (text(continuation.uniqueMarkdownAnchor)) lines.push(`刚才使用的唯一锚点仍是：${continuation.uniqueMarkdownAnchor}`)
    if (list(continuation.currentHeadingPath).length) {
      lines.push(`所在章节：${list(continuation.currentHeadingPath).filter((item): item is string => typeof item === 'string').join(' / ')}`)
    }
    lines.push('不要重复刚才已经完成的操作；若版本冲突或锚点失效，先重新读取文档。')
  }
  return lines.join('\n')
}

const renderSuccess = (toolName: string, data: Record<string, unknown>): string => {
  if (toolName === 'search_world_documents') return renderSearch(data)
  if (toolName === 'browse_world_document_tree') return renderTree(data)
  if (toolName === 'read_world_document') {
    const document = isRecord(data.document) ? data.document : undefined
    return document && data.found !== false ? renderDocument(document, true) : '没有找到目标世界观文档。'
  }
  if (toolName === 'read_document_section') return renderSection(data, false)
  if (toolName === 'read_document_sections_by_title') return renderSection(data, true)
  if (['replace_text', 'insert_text', 'append_text', 'replace_section'].includes(toolName)) return renderLocalEdit(data)
  if (toolName === 'delete_world_document') return `文档 ${quote(text(data.documentId) || '目标文档')} 已删除。`
  if (isRecord(data.document)) {
    const document = data.document
    if (toolName === 'create_world_document') return `已创建文档 ${quote(documentLabel(document))}。\n${documentIdentity(document)}`
    if (toolName === 'rename_world_document') return `文档已重命名为 ${quote(documentLabel(document))}。\n${documentIdentity(document)}`
    if (toolName === 'move_world_document') return `文档 ${quote(documentLabel(document))} 的层级已调整。\n${documentIdentity(document)}`
    return renderDocument(document, false)
  }
  return ''
}

const renderFailure = (toolName: string, envelope: AgentToolResultEnvelope<unknown>): string => {
  const error = envelope.error
  const message = text(error?.message) || text(envelope.message) || '文档操作没有完成。'
  const lines = [`文档操作“${toolName}”没有完成：${message}`]
  if (error?.retryable) lines.push('这次失败可以重试，但需要先修正依据或参数。')
  else lines.push('不要原样重试；需要换一条路径或向用户说明限制。')
  if (envelope.nextSuggestions.length) lines.push(`下一步：${envelope.nextSuggestions.join('；')}`)
  return lines.join('\n')
}

export const isWorldDocumentToolName = (toolName: string): boolean => DOCUMENT_TOOL_NAMES.has(toolName)

export const renderWorldDocumentToolResultForModel = (
  toolName: string,
  envelope: AgentToolResultEnvelope<unknown> | null
): string | null => {
  if (!isWorldDocumentToolName(toolName) || !envelope) return null
  if (!envelope.ok) return renderFailure(toolName, envelope)
  const localEdit = ['replace_text', 'insert_text', 'append_text', 'replace_section'].includes(toolName)
  const source = localEdit
    ? isRecord(envelope.modelResult)
      ? envelope.modelResult
      : envelope.data
    : isRecord(envelope.data)
      ? envelope.data
      : envelope.modelResult
  if (!isRecord(source)) return envelope.message || null
  const rendered = renderSuccess(toolName, source)
  return rendered || envelope.message || null
}

export const renderWorldDocumentToolRuntimeNotice = (input: {
  toolName: string
  message: string
  guidance?: string
}): string | null => {
  if (!isWorldDocumentToolName(input.toolName)) return null
  return [input.message, input.guidance || ''].filter(Boolean).join('\n')
}

export const renderWorldDocumentToolRuntimeFailure = (input: {
  toolName: string
  message: string
  retryable?: boolean
  guidance?: string
}): string | null => {
  if (!isWorldDocumentToolName(input.toolName)) return null
  return [
    `文档操作“${input.toolName}”没有执行：${input.message}`,
    input.retryable ? '需要先改变参数或补充依据后再试。' : '不要原样重试。',
    input.guidance || ''
  ].filter(Boolean).join('\n')
}
