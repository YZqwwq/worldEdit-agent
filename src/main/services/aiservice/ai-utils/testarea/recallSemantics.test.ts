import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzeConversationRecallQuery,
  excludeConversationMessages
} from '../tools/conversation/conversationRecallSemantics'

test('natural history references use recent-context fallback', () => {
  for (const query of ['刚才', '刚才那个', '之前说的', '按之前那个', '继续刚才那个']) {
    const semantics = analyzeConversationRecallQuery(query)
    assert.equal(semantics.hasHistoryReference, true, query)
    assert.equal(semantics.referenceOnly, true, query)
    assert.equal(semantics.searchText, '', query)
  }
})

test('history references keep an explicit topic for retrieval', () => {
  const cases = [
    ['刚才那个 Bun 迁移', 'Bun 迁移'],
    ['之前说的角色菲尔娜', '角色菲尔娜'],
    ['上次那个工具为什么失败', '工具 失败']
  ] as const

  for (const [query, expectedSearchText] of cases) {
    const semantics = analyzeConversationRecallQuery(query)
    assert.equal(semantics.hasHistoryReference, true, query)
    assert.equal(semantics.referenceOnly, false, query)
    assert.equal(semantics.searchText, expectedSearchText, query)
  }
})

test('ordinary topic queries remain unchanged', () => {
  const semantics = analyzeConversationRecallQuery('Bun 从 Zig 迁移到 Rust')
  assert.equal(semantics.hasHistoryReference, false)
  assert.equal(semantics.referenceOnly, false)
  assert.equal(semantics.searchText, 'Bun 从 Zig 迁移到 Rust')
})

test('short-term exclusions remove only the newest matching occurrences', () => {
  const rows = [
    { id: 6, role: 'ai' as const, content: '最新回答' },
    { id: 5, role: 'user' as const, content: '重复问题' },
    { id: 4, role: 'ai' as const, content: '较早回答' },
    { id: 3, role: 'user' as const, content: '重复问题' },
    { id: 2, role: 'ai' as const, content: '更早回答' }
  ]

  const filtered = excludeConversationMessages(rows, [
    { role: 'ai', content: '最新回答' },
    { role: 'user', content: '重复问题' }
  ])

  assert.deepEqual(
    filtered.map((row) => row.id),
    [4, 3, 2]
  )
})
