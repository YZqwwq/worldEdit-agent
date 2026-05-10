import createBm25Engine from 'wink-bm25-text-search'
import { Jieba } from '@node-rs/jieba'
import { dict } from '@node-rs/jieba/dict'
import { AppDataSource } from '../../../../../database'
import { Message } from '@share/entity/database/Message'
import { VISIBLE_MAIN_AGENT_MESSAGE_STATUSES } from '@share/cache/AItype/states/mainAgentTurnState'

const DEFAULT_MAX_TURNS = 20
const DEFAULT_EXCLUDE_RECENT_TURNS = 2
const MAX_QUERY_TOKENS = 48
const MAX_CONTENT_CHARS = 1200

const CHINESE_STOP_WORDS = new Set([
  '的',
  '了',
  '和',
  '是',
  '我',
  '你',
  '他',
  '她',
  '它',
  '我们',
  '你们',
  '他们',
  '这个',
  '那个',
  '这些',
  '那些',
  '一下',
  '继续',
  '刚才',
  '上次',
  '前面',
  '之前',
  '说',
  '帮',
  '请',
  '吗',
  '呢',
  '啊',
  '吧'
])

export type ChineseConversationSearchResult = {
  query: string
  queryTokens: string[]
  searchedTurnCount: number
  searchedMessageCount: number
  matches: Array<{
    messageId: number
    turnId: number | null
    role: 'user' | 'ai'
    content: string
    createdAt: string
    score: number
  }>
}

type IndexedMessage = {
  messageId: number
  turnId: number | null
  role: 'user' | 'ai'
  content: string
  createdAt: Date
}

let jieba: Jieba | null = null

const getJieba = (): Jieba => {
  if (!jieba) {
    jieba = Jieba.withDict(dict)
  }
  return jieba
}

const normalizeWhitespace = (value: string): string =>
  value.trim().replace(/\s+/g, ' ')

const uniqueTokens = (tokens: string[]): string[] => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const token of tokens) {
    const normalized = token.trim().toLowerCase()
    if (!normalized || CHINESE_STOP_WORDS.has(normalized) || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    result.push(normalized)
    if (result.length >= MAX_QUERY_TOKENS) {
      break
    }
  }
  return result
}

const buildHanNgrams = (text: string): string[] => {
  const tokens: string[] = []
  const matches = text.match(/[\u3400-\u9fff]+/g) ?? []
  for (const segment of matches) {
    if (segment.length < 2) {
      continue
    }
    for (let size = 2; size <= 3; size++) {
      if (segment.length < size) {
        continue
      }
      for (let index = 0; index <= segment.length - size; index++) {
        tokens.push(segment.slice(index, index + size))
      }
    }
  }
  return tokens
}

const buildAsciiTokens = (text: string): string[] =>
  text.match(/[a-z0-9_][a-z0-9_.-]{1,}/gi) ?? []

export const tokenizeChineseConversationText = (value: string): string[] => {
  const text = normalizeWhitespace(String(value || ''))
  if (!text) {
    return []
  }

  const jiebaTokens = getJieba().cutForSearch(text, true)
  return uniqueTokens([
    ...jiebaTokens,
    ...buildHanNgrams(text),
    ...buildAsciiTokens(text)
  ])
}

const getTurnKey = (message: Pick<Message, 'id' | 'turnId'>): string =>
  typeof message.turnId === 'number' ? `turn:${message.turnId}` : `message:${message.id}`

const compactContent = (content: string): string => {
  const normalized = normalizeWhitespace(content)
  if (normalized.length <= MAX_CONTENT_CHARS) {
    return normalized
  }
  return `${normalized.slice(0, MAX_CONTENT_CHARS - 1).trimEnd()}…`
}

const loadCandidateMessages = async (input: {
  maxTurns: number
  excludeRecentTurns: number
}): Promise<{ messages: IndexedMessage[]; searchedTurnCount: number }> => {
  const repo = AppDataSource.getRepository(Message)
  const take = Math.max(80, (input.maxTurns + input.excludeRecentTurns + 4) * 4)
  const rows = await repo.find({
    where: VISIBLE_MAIN_AGENT_MESSAGE_STATUSES.map((status) => ({ status })),
    order: {
      createdAt: 'DESC',
      id: 'DESC'
    },
    take
  })

  const turnKeys: string[] = []
  const seenTurnKeys = new Set<string>()
  for (const row of rows) {
    const key = getTurnKey(row)
    if (!seenTurnKeys.has(key)) {
      seenTurnKeys.add(key)
      turnKeys.push(key)
    }
  }

  const selectedTurnKeys = turnKeys.slice(
    input.excludeRecentTurns,
    input.excludeRecentTurns + input.maxTurns
  )
  const selectedSet = new Set(selectedTurnKeys)
  const messages = rows
    .filter((row) => selectedSet.has(getTurnKey(row)) && row.content.trim())
    .sort((a, b) => {
      const timeDelta = a.createdAt.getTime() - b.createdAt.getTime()
      return timeDelta === 0 ? a.id - b.id : timeDelta
    })
    .map((row) => ({
      messageId: row.id,
      turnId: row.turnId,
      role: row.role,
      content: row.content,
      createdAt: row.createdAt
    }))

  return {
    messages,
    searchedTurnCount: selectedTurnKeys.length
  }
}

export const searchRecentChineseConversation = async (input: {
  query: string
  limit?: number
  maxTurns?: number
  excludeRecentTurns?: number
}): Promise<ChineseConversationSearchResult> => {
  const query = normalizeWhitespace(input.query)
  const limit = Math.max(1, Math.min(10, Math.round(input.limit ?? 5)))
  const maxTurns = Math.max(1, Math.min(50, Math.round(input.maxTurns ?? DEFAULT_MAX_TURNS)))
  const excludeRecentTurns = Math.max(
    0,
    Math.min(10, Math.round(input.excludeRecentTurns ?? DEFAULT_EXCLUDE_RECENT_TURNS))
  )
  const queryTokens = tokenizeChineseConversationText(query)
  const { messages, searchedTurnCount } = await loadCandidateMessages({
    maxTurns,
    excludeRecentTurns
  })

  if (!query || queryTokens.length === 0 || messages.length === 0) {
    return {
      query,
      queryTokens,
      searchedTurnCount,
      searchedMessageCount: messages.length,
      matches: []
    }
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

  const byId = new Map<string, IndexedMessage>()
  for (const message of messages) {
    const uniqueId = String(message.messageId)
    byId.set(uniqueId, message)
    engine.addDoc(
      {
        content: message.content
      },
      uniqueId
    )
  }
  engine.consolidate()

  const matches = engine
    .search(query, limit)
    .map(([rawId, score]) => {
      const message = byId.get(String(rawId))
      if (!message) {
        return null
      }
      return {
        messageId: message.messageId,
        turnId: message.turnId,
        role: message.role,
        content: compactContent(message.content),
        createdAt: message.createdAt.toISOString(),
        score
      }
    })
    .filter((item): item is ChineseConversationSearchResult['matches'][number] =>
      Boolean(item)
    )

  return {
    query,
    queryTokens,
    searchedTurnCount,
    searchedMessageCount: messages.length,
    matches
  }
}
