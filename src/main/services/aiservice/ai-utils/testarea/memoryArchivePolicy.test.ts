import assert from 'node:assert/strict'
import test from 'node:test'
import type { MessageData } from '@share/cache/AItype/states/memoryState'
import {
  resolveArchivePlan,
  RUNTIME_ARCHIVE_HARD_LIMIT,
  SEMANTIC_ARCHIVE_REVIEW_MIN_MESSAGES
} from '../../agentrsystem/manager/memory/memoryArchivePolicy'

const messages = (count: number): MessageData[] =>
  Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'ai',
    content: `message-${index + 1}`,
    timestamp: new Date(index * 1000).toISOString(),
    sequence: index + 1
  }))

test('semantic archive waits until a useful multi-turn fragment exists', () => {
  const buffer = messages(SEMANTIC_ARCHIVE_REVIEW_MIN_MESSAGES - 1)
  assert.equal(resolveArchivePlan(buffer, 2), null)
})

test('a valid AI semantic boundary archives only the closed prefix', () => {
  const buffer = messages(5)
  assert.deepEqual(resolveArchivePlan(buffer, 4), {
    triggerKind: 'semantic_boundary',
    messageCount: 4
  })
})

test('a user message cannot close a semantic archive stage', () => {
  const buffer = messages(5)
  assert.equal(resolveArchivePlan(buffer, 5), null)
})

test('the Runtime hard limit archives without waiting for an AI decision', () => {
  const buffer = messages(RUNTIME_ARCHIVE_HARD_LIMIT)
  assert.deepEqual(resolveArchivePlan(buffer), {
    triggerKind: 'runtime_hard_limit',
    messageCount: RUNTIME_ARCHIVE_HARD_LIMIT
  })
})
