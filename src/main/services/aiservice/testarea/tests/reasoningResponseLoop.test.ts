import assert from 'node:assert/strict'
import test from 'node:test'
import { AIMessage } from '@langchain/core/messages'
import { shouldContinue } from '../../agentrsystem/endlogic/shouldContinue'
import { readDefaultResponseChannels } from '../../model-adapters/modelResponseChannels'
import { outputGuardNode } from '../../agentrsystem/node/outputguardnode/outputGuardNode'

test('reasoning loop routes only through runtime actions and final-content boundaries', async () => {
  assert.equal(await shouldContinue({ loopDirective: 'deliberate' } as any), 'llmCall')
  assert.equal(await shouldContinue({ loopDirective: 'execute_tools' } as any), 'toolNode')
  assert.equal(await shouldContinue({ loopDirective: 'compose_final' } as any), 'finalAnswerNode')
  assert.equal(await shouldContinue({ loopDirective: 'finalize' } as any), 'outputGuardNode')
})

test('llm routing requires an explicit runtime directive', async () => {
  await assert.rejects(shouldContinue({} as any), /must commit a loopDirective/)
})

test('provider reasoning and visible content remain separate channels', () => {
  const channels = readDefaultResponseChannels(new AIMessage({
    content: '这是给用户的简短回答。',
    additional_kwargs: { reasoning_content: '工具结果推翻了先前判断，因此需要收束。' }
  }))
  assert.deepEqual(channels, {
    reasoning: '工具结果推翻了先前判断，因此需要收束。',
    content: '这是给用户的简短回答。'
  })
})

test('reasoning content blocks never leak into visible content', () => {
  const channels = readDefaultResponseChannels(new AIMessage({
    content: [
      { type: 'reasoning', reasoning: '内部判断' },
      { type: 'text', text: '最终回答' }
    ] as any
  }))
  assert.deepEqual(channels, { reasoning: '内部判断', content: '最终回答' })
})

test('output guard accepts one canonical final-content candidate', async () => {
  const result = await outputGuardNode({
    finalContentCandidate: {
      messageId: 'final-1', content: '我更在意他信仰崩塌后的克制。', source: 'native_content'
    },
    turnLifecycle: { phase: 'forming', revision: 0, updatedAt: new Date().toISOString() }
  } as any)
  assert.equal(result.finalResponse?.content, '我更在意他信仰崩塌后的克制。')
  assert.equal(result.turnLifecycle?.phase, 'expressing')
})

test('output guard rejects internal reasoning wrappers', async () => {
  await assert.rejects(outputGuardNode({
    finalContentCandidate: {
      messageId: 'final-2', content: '<think>内部判断</think>', source: 'final_composition'
    }
  } as any), /internal reasoning wrapper/)
})
