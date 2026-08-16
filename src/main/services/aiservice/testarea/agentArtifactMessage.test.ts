import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hasMainAgentArtifactContent,
  parseMainAgentMessageContentJson,
  serializeMainAgentMessageContent
} from '@share/cache/AItype/states/mainAgentMessageContent'

test('compound AI messages preserve artifact references without embedding artifact bodies', () => {
  const serialized = serializeMainAgentMessageContent([
    { type: 'text', text: '我把完整想法整理出来了。' },
    {
      type: 'artifact_ref',
      artifactId: 'artifact-1',
      artifactKind: 'agent_opinion',
      title: '关于菲尔娜的看法',
      summary: '讨论人格、权柄与概念载体之间的关系。'
    }
  ])

  const restored = parseMainAgentMessageContentJson(serialized)
  assert.equal(restored.length, 2)
  assert.equal(hasMainAgentArtifactContent(restored), true)
  assert.deepEqual(restored[1], {
    type: 'artifact_ref',
    artifactId: 'artifact-1',
    artifactKind: 'agent_opinion',
    title: '关于菲尔娜的看法',
    summary: '讨论人格、权柄与概念载体之间的关系。'
  })

  assert.doesNotMatch(serialized, /完整观点正文/)
})

test('invalid artifact references are dropped instead of leaking malformed UI controls', () => {
  const restored = parseMainAgentMessageContentJson(
    JSON.stringify([
      { type: 'text', text: '正常正文' },
      { type: 'artifact_ref', artifactId: '', artifactKind: 'agent_opinion', title: '' }
    ])
  )

  assert.deepEqual(restored, [{ type: 'text', text: '正常正文' }])
})
