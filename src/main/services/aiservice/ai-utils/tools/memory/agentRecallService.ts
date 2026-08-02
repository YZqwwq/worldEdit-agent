import createBm25Engine from 'wink-bm25-text-search'
import { memoryManager } from '../../../agentrsystem/manager/memory/MemoryManager'
import {
  searchRecentChineseConversation,
  tokenizeChineseConversationText
} from '../conversation/chineseConversationSearchService'
import { analyzeConversationRecallQuery } from '../conversation/conversationRecallSemantics'

const DEFAULT_MATCH_LIMIT = 8
const MAX_MATCH_LIMIT = 12
const MAX_STAGE_CANDIDATES = 500

export type RecallMatchKind = 'pending' | 'stage' | 'raw_message'

export type RecallMatch = {
  kind: RecallMatchKind
  content: string
  occurredAt?: string
  relevance: number
  sourceRef: string
  role?: 'user' | 'ai'
}

export type RecallBundle = {
  query: string
  orientation: {
    memorySummary: string
    updatedAt: string
  } | null
  matches: RecallMatch[]
  searched: {
    pending: number
    stages: number
    rawMessages: number
  }
}

type SearchCandidate = Omit<RecallMatch, 'relevance'> & {
  searchText: string
}

type RankedCandidate = RecallMatch & {
  rawScore: number
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

const roundRelevance = (value: number): number => Math.round(clamp01(value) * 1000) / 1000

const normalizeText = (value: string): string =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')

const buildRecencyScore = (occurredAt: string | undefined, timestamps: number[]): number => {
  const timestamp = occurredAt ? Date.parse(occurredAt) : Number.NaN
  if (!Number.isFinite(timestamp) || timestamps.length === 0) return 0
  const oldest = Math.min(...timestamps)
  const newest = Math.max(...timestamps)
  if (newest <= oldest) return 1
  return clamp01((timestamp - oldest) / (newest - oldest))
}

const rankCandidates = (query: string, candidates: SearchCandidate[]): RankedCandidate[] => {
  const searchableCandidates = candidates.filter(
    (candidate) => tokenizeChineseConversationText(candidate.searchText).length > 0
  )
  if (
    !query.trim() ||
    tokenizeChineseConversationText(query).length === 0 ||
    searchableCandidates.length === 0
  ) {
    return []
  }

  const engine = createBm25Engine()
  engine.defineConfig({
    fldWeights: {
      content: 1
    },
    bm25Params: {
      k1: 1.2,
      b: 0.75
    }
  })
  engine.definePrepTasks([tokenizeChineseConversationText])

  const byId = new Map<string, SearchCandidate>()
  for (const [index, candidate] of searchableCandidates.entries()) {
    const id = String(index)
    byId.set(id, candidate)
    engine.addDoc({ content: candidate.searchText }, id)
  }
  engine.consolidate()

  const results = engine.search(query, Math.min(searchableCandidates.length, MAX_MATCH_LIMIT * 4))
  const maxScore = Math.max(...results.map(([, score]) => score), 0)
  const timestamps = searchableCandidates
    .map((candidate) => (candidate.occurredAt ? Date.parse(candidate.occurredAt) : Number.NaN))
    .filter(Number.isFinite)

  return results.flatMap(([rawId, score]): RankedCandidate[] => {
    const candidate = byId.get(String(rawId))
    if (!candidate || score <= 0 || maxScore <= 0) return []
    const relevanceScore = score / maxScore
    const recencyTieBreaker = buildRecencyScore(candidate.occurredAt, timestamps)
    return [
      {
        kind: candidate.kind,
        content: candidate.content,
        occurredAt: candidate.occurredAt,
        sourceRef: candidate.sourceRef,
        role: candidate.role,
        rawScore: score,
        relevance: roundRelevance(relevanceScore * 0.92 + recencyTieBreaker * 0.08)
      }
    ]
  })
}

const rankRawMessages = (
  matches: Awaited<ReturnType<typeof searchRecentChineseConversation>>['matches']
): RankedCandidate[] => {
  const maxScore = Math.max(...matches.map((match) => match.score), 0)
  const timestamps = matches.map((match) => Date.parse(match.createdAt)).filter(Number.isFinite)
  return matches.flatMap((match): RankedCandidate[] => {
    if (match.score <= 0 || maxScore <= 0) return []
    const relevanceScore = match.score / maxScore
    const recencyTieBreaker = buildRecencyScore(match.createdAt, timestamps)
    return [
      {
        kind: 'raw_message' as const,
        content: match.content,
        occurredAt: match.createdAt,
        sourceRef: `message:${match.messageId}`,
        role: match.role,
        rawScore: match.score,
        relevance: roundRelevance(relevanceScore * 0.92 + recencyTieBreaker * 0.08)
      }
    ]
  })
}

const buildRecencyFallback = (candidates: SearchCandidate[]): RankedCandidate[] =>
  candidates
    .filter((candidate) => candidate.kind === 'pending' || candidate.kind === 'stage')
    .slice(0, MAX_MATCH_LIMIT)
    .map((candidate, index) => ({
      kind: candidate.kind,
      content: candidate.content,
      occurredAt: candidate.occurredAt,
      sourceRef: candidate.sourceRef,
      role: candidate.role,
      rawScore: 0,
      relevance: roundRelevance(
        (candidate.kind === 'pending' ? 0.72 : 0.48) - Math.min(index, 6) * 0.04
      )
    }))

const dedupeAndLimit = (candidates: RankedCandidate[], limit: number): RecallMatch[] => {
  const seen = new Set<string>()
  const matches: RecallMatch[] = []

  for (const candidate of candidates.sort((a, b) => {
    const relevanceDelta = b.relevance - a.relevance
    if (relevanceDelta !== 0) return relevanceDelta
    return String(b.occurredAt || '').localeCompare(String(a.occurredAt || ''))
  })) {
    const key = `${candidate.role ?? candidate.kind}:${normalizeText(candidate.content).toLowerCase()}`
    if (!key || seen.has(key)) continue
    seen.add(key)
    matches.push({
      kind: candidate.kind,
      content: candidate.content,
      occurredAt: candidate.occurredAt,
      relevance: candidate.relevance,
      sourceRef: candidate.sourceRef,
      role: candidate.role
    })
    if (matches.length >= limit) break
  }

  return matches
}

export const recallAgentMemory = async (input: {
  query: string
  limit?: number
}): Promise<RecallBundle> => {
  const query = normalizeText(input.query)
  const limit = Math.max(
    1,
    Math.min(MAX_MATCH_LIMIT, Math.round(input.limit ?? DEFAULT_MATCH_LIMIT))
  )
  const querySemantics = analyzeConversationRecallQuery(query)
  const snapshot = await memoryManager.getSnapshot({ recentStageLimit: MAX_STAGE_CANDIDATES })
  const rawSearchResult = await searchRecentChineseConversation({
    query,
    limit: MAX_MATCH_LIMIT,
    maxTurns: 50,
    excludedMessages: snapshot.shortTerm.map((message) => ({
      role: message.role === 'ai' ? ('ai' as const) : ('user' as const),
      content: message.content
    }))
  }).catch(() => ({
    query,
    queryTokens: [] as string[],
    searchedTurnCount: 0,
    searchedMessageCount: 0,
    matches: []
  }))

  const memoryCandidates: SearchCandidate[] = [
    ...snapshot.pendingArchive
      .slice()
      .reverse()
      .map((message) => ({
        kind: 'pending' as const,
        content: message.content,
        searchText: message.content,
        occurredAt: message.timestamp,
        sourceRef: `pending:${message.sequence ?? message.timestamp}`,
        role: message.role === 'ai' ? ('ai' as const) : ('user' as const)
      })),
    ...snapshot.recentStages.map((stage) => ({
      kind: 'stage' as const,
      content: stage.summary,
      searchText: [stage.summary, stage.moodLabel].filter(Boolean).join(' '),
      occurredAt: stage.endedAt,
      sourceRef: `stage:${stage.id}`
    }))
  ].filter((candidate) => normalizeText(candidate.content).length > 0)

  const memoryMatches = rankCandidates(querySemantics.searchText, memoryCandidates)
  const rawMatches = rankRawMessages(rawSearchResult.matches)
  const queryHasSearchTokens = tokenizeChineseConversationText(querySemantics.searchText).length > 0
  const fallbackMatches =
    querySemantics.referenceOnly || !queryHasSearchTokens
      ? buildRecencyFallback(memoryCandidates)
      : []

  return {
    query,
    orientation: snapshot.longTerm.memorySummary
      ? {
          memorySummary: snapshot.longTerm.memorySummary,
          updatedAt: snapshot.longTerm.updatedAt
        }
      : null,
    matches: dedupeAndLimit([...memoryMatches, ...rawMatches, ...fallbackMatches], limit),
    searched: {
      pending: snapshot.pendingArchive.length,
      stages: snapshot.recentStages.length,
      rawMessages: rawSearchResult.searchedMessageCount
    }
  }
}
