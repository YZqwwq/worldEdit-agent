import { createHash } from 'node:crypto'
import type { BaseMessage } from '@langchain/core/messages'

type PendingToolConfirmation = {
  sessionId: string
  confirmationKey: string
  requestedEventId: string
  requestedAt: number
}

const CONFIRMATION_TTL_MS = 15 * 60 * 1000
const pendingConfirmations = new Map<string, PendingToolConfirmation>()

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)])
  )
}

export const buildToolConfirmationKey = (toolName: string, args: unknown): string =>
  createHash('sha256')
    .update(`${toolName}\n${JSON.stringify(canonicalize(args ?? {}))}`)
    .digest('hex')
    .slice(0, 24)

export const getLatestHumanMessageText = (messages: BaseMessage[]): string => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if ((message as { _getType?: () => string })._getType?.() !== 'human') continue
    if (typeof message.content === 'string') return message.content
    if (!Array.isArray(message.content)) return ''
    return message.content
      .map((part) =>
        part && typeof part === 'object' && 'text' in part ? String(part.text ?? '') : ''
      )
      .join('\n')
  }
  return ''
}

const normalizeDirectiveEvidence = (value: string): string =>
  value.trim().replace(/\s+/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")

export const currentUserMessageContainsDirectiveEvidence = (
  currentUserMessage: string,
  evidence: string
): boolean => {
  const normalizedMessage = normalizeDirectiveEvidence(currentUserMessage)
  const normalizedEvidence = normalizeDirectiveEvidence(evidence)
  return normalizedEvidence.length > 0 && normalizedMessage.includes(normalizedEvidence)
}

const confirmationCacheKey = (sessionId: string, confirmationKey: string): string =>
  `${sessionId}:${confirmationKey}`

const clearExpiredConfirmations = (now: number): void => {
  for (const [key, confirmation] of pendingConfirmations) {
    if (now - confirmation.requestedAt > CONFIRMATION_TTL_MS) {
      pendingConfirmations.delete(key)
    }
  }
}

export const registerToolConfirmationRequest = (input: {
  sessionId: string
  eventId: string
  confirmationKey: string
  now?: number
}): void => {
  const now = input.now ?? Date.now()
  clearExpiredConfirmations(now)
  pendingConfirmations.set(confirmationCacheKey(input.sessionId, input.confirmationKey), {
    sessionId: input.sessionId,
    confirmationKey: input.confirmationKey,
    requestedEventId: input.eventId,
    requestedAt: now
  })
}

export const consumeToolConfirmation = (input: {
  sessionId: string
  eventId: string
  confirmationKey: string
  userText: string
  now?: number
}): boolean => {
  const now = input.now ?? Date.now()
  clearExpiredConfirmations(now)
  const key = confirmationCacheKey(input.sessionId, input.confirmationKey)
  const pending = pendingConfirmations.get(key)
  if (
    !pending ||
    pending.requestedEventId === input.eventId ||
    !isExplicitToolConfirmation(input.userText)
  ) {
    return false
  }
  pendingConfirmations.delete(key)
  return true
}

export const clearToolConfirmationRequestsForTest = (): void => {
  pendingConfirmations.clear()
}

// Confirmation intent is only one condition; exact invocation identity and a later event are required.
export const isExplicitToolConfirmation = (text: string): boolean => {
  const normalized = text.trim().toLowerCase()
  if (!normalized) return false
  if (/(不|不要|取消|拒绝|别).{0,6}(确认|同意|执行|继续|删除)/u.test(normalized)) return false
  return /(^|[，。！？!?,\s])(确认|同意|可以执行|继续执行|执行吧|确定删除|是的|yes|confirm)([，。！？!?,\s]|$)/u.test(
    normalized
  )
}
