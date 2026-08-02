export type ConversationMessageIdentity = {
  role: 'user' | 'ai'
  content: string
}

export type ConversationRecallQuerySemantics = {
  normalizedQuery: string
  searchText: string
  hasHistoryReference: boolean
  referenceOnly: boolean
}

const HISTORY_REFERENCE_PATTERN =
  /(刚才|刚刚|方才|上次|前面|此前|先前|之前|我们说过|我们聊过|你还记得|继续|接着)/u

const HISTORY_REFERENCE_PHRASES = [
  '我们之前说过的',
  '我们刚才说过的',
  '我们之前聊过的',
  '你还记得吗',
  '按之前那个',
  '按刚才那个',
  '继续刚才那个',
  '接着刚才那个',
  '之前说的',
  '刚才说的',
  '刚刚说的',
  '上次说的',
  '前面说的',
  '之前那个',
  '刚才那个',
  '刚刚那个',
  '上次那个',
  '前面那个',
  '我们说过',
  '我们聊过',
  '你还记得',
  '刚才',
  '刚刚',
  '方才',
  '上次',
  '前面',
  '此前',
  '先前',
  '之前',
  '继续',
  '接着'
] as const

const REFERENCE_FILLER_PATTERN =
  /(按|再|把|将|说的|提到的|讨论的|聊的|说|提到|讨论|聊|内容|事情|问题|那个|这个|一下|为什么|怎么样|怎么了|是什么|咋样|呢|吗|啊|吧|呀|啦|了|的)/gu

const normalizeWhitespace = (value: string): string =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const stripHistoryReferenceLanguage = (query: string): string => {
  const phrasePattern = new RegExp(HISTORY_REFERENCE_PHRASES.map(escapeRegExp).join('|'), 'gu')
  return query
    .replace(phrasePattern, ' ')
    .replace(REFERENCE_FILLER_PATTERN, ' ')
    .replace(/[\s,，。！？!?;；:：、"'`()[\]{}<>《》]+/gu, ' ')
    .trim()
}

export const analyzeConversationRecallQuery = (value: string): ConversationRecallQuerySemantics => {
  const normalizedQuery = normalizeWhitespace(value)
  const hasHistoryReference = HISTORY_REFERENCE_PATTERN.test(normalizedQuery)
  const searchText = hasHistoryReference
    ? stripHistoryReferenceLanguage(normalizedQuery)
    : normalizedQuery

  return {
    normalizedQuery,
    searchText,
    hasHistoryReference,
    referenceOnly: hasHistoryReference && searchText.length === 0
  }
}

const buildMessageIdentity = (message: ConversationMessageIdentity): string =>
  `${message.role}:${normalizeWhitespace(message.content).toLowerCase()}`

export const excludeConversationMessages = <T extends ConversationMessageIdentity>(
  messagesNewestFirst: T[],
  excludedMessages: ConversationMessageIdentity[]
): T[] => {
  const remainingExclusions = new Map<string, number>()
  for (const message of excludedMessages) {
    const key = buildMessageIdentity(message)
    remainingExclusions.set(key, (remainingExclusions.get(key) ?? 0) + 1)
  }

  return messagesNewestFirst.filter((message) => {
    const key = buildMessageIdentity(message)
    const remaining = remainingExclusions.get(key) ?? 0
    if (remaining <= 0) return true
    remainingExclusions.set(key, remaining - 1)
    return false
  })
}
