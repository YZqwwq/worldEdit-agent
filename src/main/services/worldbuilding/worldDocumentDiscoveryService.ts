import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import MarkdownIt from 'markdown-it'
import TurndownService from 'turndown'
import type { WorldEntityDocumentPayload } from '../../../share/cache/worldbuilding/worldEntityDocument'
import { normalizeWorldDocumentVisibleText } from '../../../share/cache/worldbuilding/worldDocumentSemanticAnchor'

const markdownParser = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
  breaks: false
})
const htmlReader = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced'
})
htmlReader.remove(['script', 'style'])

type Bm25Engine = {
  defineConfig(config: Record<string, unknown>): void
  definePrepTasks(tasks: Array<(input: string) => string[]>): void
  addDoc(document: Record<string, unknown>, id: string): void
  consolidate(): void
  search(query: string, limit?: number): Array<[string, number]>
}

type IndexedWorldDocument = {
  document: WorldEntityDocumentPayload
  path: string[]
  pathText: string
  visibleText: string
  titleTokens: string[]
  pathTokens: string[]
  contentTokens: string[]
}

type WorldDocumentSearchRuntime = {
  signature: string
  engine: Bm25Engine | null
  indexedById: Map<string, IndexedWorldDocument>
  builtAt: string
}

const require = createRequire(__filename)
const createBm25Engine = require('wink-bm25-text-search') as () => Bm25Engine
const wordSegmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })
const runtimeCache = new Map<string, WorldDocumentSearchRuntime>()
const MAX_CACHED_WORLDS = 4
const SEARCH_CANDIDATE_MULTIPLIER = 8
const MIN_SEARCH_CANDIDATES = 50
const CJK_SEQUENCE = /[\p{Script=Han}]+/gu
const SEARCH_SEPARATOR = /[\s,，。！？!?;；:：、"'`()[\]{}<>《》/\\|]+/u

export type WorldDocumentSearchMatchLocation = 'title' | 'path' | 'content'

export type WorldDocumentSearchMatch = {
  documentId: string
  title: string
  parentDocumentId: string | null
  path: string[]
  revision: number
  matchedIn: WorldDocumentSearchMatchLocation[]
  matchedTerms: string[]
  occurrenceCount: number
  snippet: string | null
  score: number
}

export type WorldDocumentSearchResult = {
  query: string
  queryTerms: string[]
  strategy: 'hybrid_exact_bm25'
  indexBuiltAt: string
  totalMatches: number
  hasMore: boolean
  matches: WorldDocumentSearchMatch[]
}

export type WorldDocumentTreeNode = {
  documentId: string
  title: string
  parentDocumentId: string | null
  path: string[]
  revision: number
  childCount: number
  hasMoreChildren: boolean
  children: WorldDocumentTreeNode[]
}

export type WorldDocumentTreeBrowseResult = {
  rootDocumentId: string | null
  roots: WorldDocumentTreeNode[]
  nextBrowsableDocumentIds: string[]
}

type VisibleMarkdownToken = {
  type: string
  content: string
  children: VisibleMarkdownToken[] | null
}

const inlineTokenText = (tokens: VisibleMarkdownToken[]): string =>
  tokens
    .map((token) => {
      if (token.type === 'softbreak' || token.type === 'hardbreak') return ' '
      if (token.type === 'text' || token.type === 'code_inline') return token.content
      if (token.type === 'image') return token.content
      return token.children ? inlineTokenText(token.children) : ''
    })
    .join('')

export const worldDocumentMarkdownToVisibleText = (markdown: string): string => {
  const blocks = markdownParser.parse(String(markdown ?? ''), {})
  const text = blocks
    .map((token) => {
      if (token.type === 'inline') return inlineTokenText(token.children ?? [])
      if (token.type === 'fence' || token.type === 'code_block') return token.content
      return ''
    })
    .filter(Boolean)
    .join(' ')
  return normalizeWorldDocumentVisibleText(text)
}

export const worldDocumentHtmlToVisibleText = (html: string): string =>
  worldDocumentMarkdownToVisibleText(htmlReader.turndown(String(html ?? '')))

const normalizeSearchChars = (value: string): string[] =>
  Array.from(normalizeWorldDocumentVisibleText(value), (character) =>
    character.toLocaleLowerCase()
  )

const findAllOccurrences = (source: string, query: string): number[] => {
  const sourceChars = Array.from(source)
  const normalizedSource = normalizeSearchChars(source)
  const normalizedQuery = normalizeSearchChars(query)
  if (!normalizedQuery.length || normalizedQuery.length > normalizedSource.length) return []

  const offsets: number[] = []
  for (let index = 0; index <= normalizedSource.length - normalizedQuery.length; index += 1) {
    let matches = true
    for (let queryIndex = 0; queryIndex < normalizedQuery.length; queryIndex += 1) {
      if (normalizedSource[index + queryIndex] !== normalizedQuery[queryIndex]) {
        matches = false
        break
      }
    }
    if (!matches) continue
    offsets.push(index)
    index += normalizedQuery.length - 1
  }
  return offsets.filter((offset) => offset < sourceChars.length)
}

const containsQuery = (source: string, query: string): boolean =>
  findAllOccurrences(source, query).length > 0

const normalizeSearchText = (value: string): string =>
  normalizeWorldDocumentVisibleText(value).toLocaleLowerCase()

const characterNgrams = (value: string, min = 2, max = 3): string[] => {
  const characters = Array.from(value)
  const tokens: string[] = []
  for (let size = min; size <= max; size += 1) {
    for (let index = 0; index <= characters.length - size; index += 1) {
      tokens.push(characters.slice(index, index + size).join(''))
    }
  }
  return tokens
}

const tokenizeSearchText = (value: string): string[] => {
  const normalized = normalizeSearchText(value)
  if (!normalized) return []
  const segmentedTokens = [...wordSegmenter.segment(normalized)]
    .filter((segment) => segment.isWordLike)
    .map((segment) => normalizeSearchText(segment.segment))
    .filter(Boolean)
  const lexicalTokens = normalized.split(SEARCH_SEPARATOR).map(normalizeSearchText).filter(Boolean)
  const cjkNgrams = [...normalized.matchAll(CJK_SEQUENCE)].flatMap((match) =>
    characterNgrams(match[0])
  )
  return [...segmentedTokens, ...lexicalTokens, ...cjkNgrams].filter(
    (token) => Array.from(token).length > 1 || /[\p{L}\p{N}]/u.test(token)
  )
}

export const analyzeWorldDocumentSearchQuery = (query: string): string[] => {
  const normalized = normalizeSearchText(query)
  if (!normalized) return []
  const phrases = [...normalized.matchAll(/"([^"]+)"/g)].map((match) => match[1])
  const unquoted = normalized.replace(/"[^"]+"/g, ' ')
  const segmentedTerms = [...wordSegmenter.segment(unquoted)]
    .filter((segment) => segment.isWordLike)
    .map((segment) => normalizeSearchText(segment.segment))
  const lexicalTerms = unquoted.split(SEARCH_SEPARATOR).map(normalizeSearchText).filter(Boolean)
  return [...new Set([...phrases, ...segmentedTerms, ...lexicalTerms])]
    .filter((term) => term.length > 0)
    .slice(0, 24)
}

const buildDocumentPathResolver = (documents: WorldEntityDocumentPayload[]) => {
  const byId = new Map(documents.map((document) => [document.id, document]))
  const cache = new Map<string, string[]>()

  const resolve = (document: WorldEntityDocumentPayload): string[] => {
    const cached = cache.get(document.id)
    if (cached) return cached

    const path: string[] = []
    const visited = new Set<string>()
    let current: WorldEntityDocumentPayload | undefined = document
    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      path.unshift(current.title)
      current = current.parentDocumentId ? byId.get(current.parentDocumentId) : undefined
    }
    cache.set(document.id, path)
    return path
  }
  return resolve
}

const buildSnippet = (
  visibleText: string,
  query: string,
  queryTerms: string[],
  contextCharacters = 40
): string | null => {
  const characters = Array.from(visibleText)
  if (!characters.length) return null
  const exactOffset = findAllOccurrences(visibleText, query)[0]
  const termMatches = queryTerms
    .flatMap((term) =>
      findAllOccurrences(visibleText, term).map((offset) => ({
        offset,
        length: Array.from(term).length,
        term
      }))
    )
    .sort((left, right) => left.offset - right.offset)
  let anchorOffset = exactOffset
  let anchorLength = Array.from(query).length

  if (anchorOffset === undefined && termMatches.length) {
    let best = termMatches[0]
    let bestScore = 0
    for (const candidate of termMatches) {
      const windowEnd = candidate.offset + contextCharacters * 2
      const termsInWindow = new Set(
        termMatches
          .filter((match) => match.offset >= candidate.offset && match.offset <= windowEnd)
          .map((match) => match.term)
      )
      const score = termsInWindow.size * 10 - candidate.offset / Math.max(characters.length, 1)
      if (score > bestScore) {
        best = candidate
        bestScore = score
      }
    }
    anchorOffset = best.offset
    anchorLength = best.length
  }
  if (anchorOffset === undefined) return null

  const start = Math.max(0, anchorOffset - contextCharacters)
  const end = Math.min(characters.length, anchorOffset + anchorLength + contextCharacters)
  return `${start > 0 ? '...' : ''}${characters.slice(start, end).join('')}${
    end < characters.length ? '...' : ''
  }`
}

const buildSearchSignature = (documents: WorldEntityDocumentPayload[]): string => {
  const hash = createHash('sha256')
  for (const document of [...documents].sort((left, right) => left.id.localeCompare(right.id))) {
    hash.update(
      [
        document.id,
        document.revision,
        document.parentDocumentId ?? '',
        document.title,
        document.updatedAt ?? '',
        document.contentHtml
      ].join('\u0001')
    )
    hash.update('\u0000')
  }
  return hash.digest('hex')
}

const buildSearchRuntime = (
  documents: WorldEntityDocumentPayload[],
  signature: string
): WorldDocumentSearchRuntime => {
  const resolvePath = buildDocumentPathResolver(documents)
  const indexed = documents.map((document): IndexedWorldDocument => {
    const path = resolvePath(document)
    const pathText = path.join(' / ')
    const visibleText = worldDocumentHtmlToVisibleText(document.contentHtml)
    return {
      document,
      path,
      pathText,
      visibleText,
      titleTokens: tokenizeSearchText(document.title),
      pathTokens: tokenizeSearchText(pathText),
      contentTokens: tokenizeSearchText(visibleText)
    }
  })
  let engine: Bm25Engine | null = null
  if (indexed.length > 0) {
    try {
      engine = createBm25Engine()
      engine.defineConfig({ fldWeights: { title: 6, path: 2.5, content: 1 } })
      engine.definePrepTasks([tokenizeSearchText])
      for (const entry of indexed) {
        engine.addDoc(
          {
            title: entry.document.title,
            path: entry.pathText,
            content: entry.visibleText
          },
          entry.document.id
        )
      }
      engine.consolidate()
    } catch {
      engine = null
    }
  }
  return {
    signature,
    engine,
    indexedById: new Map(indexed.map((entry) => [entry.document.id, entry])),
    builtAt: new Date().toISOString()
  }
}

const getSearchRuntime = (documents: WorldEntityDocumentPayload[]): WorldDocumentSearchRuntime => {
  const worldId = documents[0]?.worldId ?? '__empty__'
  const signature = buildSearchSignature(documents)
  const cached = runtimeCache.get(worldId)
  if (cached?.signature === signature) {
    runtimeCache.delete(worldId)
    runtimeCache.set(worldId, cached)
    return cached
  }
  const runtime = buildSearchRuntime(documents, signature)
  runtimeCache.set(worldId, runtime)
  while (runtimeCache.size > MAX_CACHED_WORLDS) {
    const oldestKey = runtimeCache.keys().next().value as string | undefined
    if (!oldestKey) break
    runtimeCache.delete(oldestKey)
  }
  return runtime
}

const tokenOverlapScore = (queryTerms: string[], fieldTokens: string[]): number => {
  const fieldSet = new Set(fieldTokens)
  return queryTerms.reduce((score, term) => score + (fieldSet.has(term) ? 1 : 0), 0)
}

export const searchWorldDocuments = (
  documents: WorldEntityDocumentPayload[],
  query: string,
  limit: number
): WorldDocumentSearchResult => {
  const normalizedQuery = normalizeWorldDocumentVisibleText(query)
  const queryTerms = analyzeWorldDocumentSearchQuery(normalizedQuery)
  const runtime = getSearchRuntime(documents)
  if (!normalizedQuery) {
    return {
      query,
      queryTerms: [],
      strategy: 'hybrid_exact_bm25',
      indexBuiltAt: runtime.builtAt,
      totalMatches: 0,
      hasMore: false,
      matches: []
    }
  }
  const candidateLimit = Math.min(
    documents.length,
    Math.max(limit * SEARCH_CANDIDATE_MULTIPLIER, MIN_SEARCH_CANDIDATES)
  )
  const bm25Scores = new Map<string, number>(
    runtime.engine?.search(normalizedQuery, candidateLimit) ?? []
  )

  const allMatches = [...runtime.indexedById.values()]
    .map((entry) => {
      const { document, path, pathText, visibleText } = entry
      const contentOccurrences = findAllOccurrences(visibleText, normalizedQuery)
      const exactTitleMatch = normalizeSearchText(document.title) === normalizeSearchText(query)
      const titleContainsPhrase = containsQuery(document.title, normalizedQuery)
      const pathContainsPhrase = containsQuery(pathText, normalizedQuery)
      const titleTermHits = queryTerms.filter((term) => containsQuery(document.title, term))
      const pathTermHits = queryTerms.filter((term) => containsQuery(pathText, term))
      const contentTermHits = queryTerms.filter((term) => containsQuery(visibleText, term))
      const matchedTerms = [...new Set([...titleTermHits, ...pathTermHits, ...contentTermHits])]
      const bm25Score = bm25Scores.get(document.id) ?? 0
      if (
        !exactTitleMatch &&
        !titleContainsPhrase &&
        !pathContainsPhrase &&
        !contentOccurrences.length &&
        bm25Score <= 0 &&
        !matchedTerms.length
      ) {
        return null
      }
      const matchedIn: WorldDocumentSearchMatchLocation[] = []
      if (titleContainsPhrase || titleTermHits.length) matchedIn.push('title')
      if (pathContainsPhrase || pathTermHits.length) matchedIn.push('path')
      if (contentOccurrences.length || contentTermHits.length) matchedIn.push('content')

      const titleCoverage = queryTerms.length ? titleTermHits.length / queryTerms.length : 0
      const pathCoverage = queryTerms.length ? pathTermHits.length / queryTerms.length : 0
      const contentCoverage = queryTerms.length ? contentTermHits.length / queryTerms.length : 0
      const score =
        (exactTitleMatch ? 1000 : 0) +
        (titleContainsPhrase ? 500 : 0) +
        (pathContainsPhrase ? 160 : 0) +
        (contentOccurrences.length ? 100 : 0) +
        titleCoverage * 180 +
        pathCoverage * 70 +
        contentCoverage * 50 +
        bm25Score * 25 +
        tokenOverlapScore(queryTerms, entry.titleTokens) * 8 +
        Math.min(contentOccurrences.length, 20)

      return {
        match: {
          documentId: document.id,
          title: document.title,
          parentDocumentId: document.parentDocumentId,
          path,
          revision: document.revision,
          matchedIn,
          matchedTerms,
          occurrenceCount: contentOccurrences.length,
          snippet: buildSnippet(visibleText, normalizedQuery, queryTerms),
          score: Number(score.toFixed(4))
        } satisfies WorldDocumentSearchMatch,
        score
      }
    })
    .filter(
      (entry): entry is { match: WorldDocumentSearchMatch; score: number } => entry !== null
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.match.path.join('/').localeCompare(right.match.path.join('/'), 'zh-CN')
    )
    .map((entry) => entry.match)
  const ranked = allMatches.slice(0, limit)

  return {
    query,
    queryTerms,
    strategy: 'hybrid_exact_bm25',
    indexBuiltAt: runtime.builtAt,
    totalMatches: allMatches.length,
    hasMore: allMatches.length > ranked.length,
    matches: ranked
  }
}

export const browseWorldDocumentTree = (
  documents: WorldEntityDocumentPayload[],
  rootDocumentId?: string
): WorldDocumentTreeBrowseResult | null => {
  const byId = new Map(documents.map((document) => [document.id, document]))
  const childrenByParent = new Map<string | null, WorldEntityDocumentPayload[]>()
  for (const document of documents) {
    const parentId = document.parentDocumentId && byId.has(document.parentDocumentId)
      ? document.parentDocumentId
      : null
    const children = childrenByParent.get(parentId) ?? []
    children.push(document)
    childrenByParent.set(parentId, children)
  }
  const resolvePath = buildDocumentPathResolver(documents)
  const nextBrowsableDocumentIds: string[] = []

  const buildNode = (
    document: WorldEntityDocumentPayload,
    relativeDepth: number,
    maxRelativeDepth: number,
    ancestors: Set<string>
  ): WorldDocumentTreeNode => {
    const rawChildren = childrenByParent.get(document.id) ?? []
    const hasCycle = ancestors.has(document.id)
    const canExpand = !hasCycle && relativeDepth < maxRelativeDepth
    const nextAncestors = new Set(ancestors).add(document.id)
    const children = canExpand
      ? rawChildren.map((child) =>
          buildNode(child, relativeDepth + 1, maxRelativeDepth, nextAncestors)
        )
      : []
    const hasMoreChildren = rawChildren.length > children.length
    if (hasMoreChildren) nextBrowsableDocumentIds.push(document.id)
    return {
      documentId: document.id,
      title: document.title,
      parentDocumentId: document.parentDocumentId,
      path: resolvePath(document),
      revision: document.revision,
      childCount: rawChildren.length,
      hasMoreChildren,
      children
    }
  }

  if (rootDocumentId) {
    const root = byId.get(rootDocumentId)
    if (!root) return null
    return {
      rootDocumentId,
      roots: [buildNode(root, 0, 2, new Set())],
      nextBrowsableDocumentIds: [...new Set(nextBrowsableDocumentIds)]
    }
  }

  const roots = (childrenByParent.get(null) ?? []).map((document) =>
    buildNode(document, 0, 1, new Set())
  )
  return {
    rootDocumentId: null,
    roots,
    nextBrowsableDocumentIds: [...new Set(nextBrowsableDocumentIds)]
  }
}
