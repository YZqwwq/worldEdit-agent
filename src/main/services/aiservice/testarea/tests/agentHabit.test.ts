import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { AgentHabitStore } from '../../agentrsystem/manager/personal/agentHabitStore'
import { currentUserMessageContainsDirectiveEvidence } from '../../agentrsystem/node/toolnode/toolExecutionProtocol'
import { renderAgentHabitsPrompt } from '../../prompt/main_agent/persona/communicationHabits'

test('explicit user habits persist, replace the same topic, and can be forgotten', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'worldedit-agent-habit-'))
  const targetPath = join(directory, 'agent-habits.json')
  const store = new AgentHabitStore(() => targetPath)

  try {
    const first = await store.set({
      key: 'card_delivery',
      scope: 'communication',
      instruction: '以后默认直接在聊天中完整回答，不主动使用卡片。',
      userRequestEvidence: '我希望你以后不要用卡片回答。',
      nowIso: '2026-08-26T01:00:00.000Z'
    })
    assert.equal(first.changed, true)
    assert.equal(first.revision, 1)

    const repeated = await store.set({
      key: 'card_delivery',
      scope: 'communication',
      instruction: '以后默认直接在聊天中完整回答，不主动使用卡片。',
      userRequestEvidence: '我希望你以后不要用卡片回答。',
      nowIso: '2026-08-26T01:01:00.000Z'
    })
    assert.equal(repeated.changed, false)
    assert.equal(repeated.revision, 1)

    const replaced = await store.set({
      key: 'card_delivery',
      scope: 'communication',
      instruction: '以后长篇分析优先放入卡片，聊天保留结论。',
      userRequestEvidence: '以后长分析都放卡片里。',
      nowIso: '2026-08-26T01:02:00.000Z'
    })
    assert.equal(replaced.changed, true)
    assert.equal(replaced.revision, 2)
    assert.equal((await store.list())[0]?.instruction, replaced.habit.instruction)

    const prompt = renderAgentHabitsPrompt(await store.list())
    assert.match(prompt, /用户明确要求形成的长期习惯/)
    assert.match(prompt, /与上面的默认习惯冲突时，以这里较具体的要求为准/)
    assert.match(prompt, /长篇分析优先放入卡片/)

    const removed = await store.remove('card_delivery')
    assert.equal(removed.changed, true)
    assert.equal(removed.revision, 3)
    assert.equal((await store.list()).length, 0)

    const persisted = JSON.parse(await readFile(targetPath, 'utf-8')) as {
      revision: number
      habits: unknown[]
    }
    assert.equal(persisted.revision, 3)
    assert.deepEqual(persisted.habits, [])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('default communication habits remain unchanged when no user habit exists', () => {
  const prompt = renderAgentHabitsPrompt([])
  assert.match(prompt, /交流习惯/)
  assert.match(prompt, /不是机械阈值/)
  assert.doesNotMatch(prompt, /用户明确要求形成的长期习惯/)
})

test('habit edits require evidence copied from the current user message', () => {
  assert.equal(
    currentUserMessageContainsDirectiveEvidence(
      '我希望你以后不要用卡片回答，直接在聊天里说。',
      '以后不要用卡片回答'
    ),
    true
  )
  assert.equal(
    currentUserMessageContainsDirectiveEvidence('这次直接回答。', '以后都直接回答'),
    false
  )
})
