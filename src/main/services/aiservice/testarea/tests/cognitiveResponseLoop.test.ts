import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FINISH_RESPONSE_TOOL_NAME,
  ESTABLISH_COGNITION_TOOL_NAME,
  parseCognitiveRevision,
  parseInitialCognitionToolCall,
  parseFinishResponseToolCall
} from '../../agentrsystem/cognition/finishResponseProtocol'
import { shouldContinue } from '../../agentrsystem/endlogic/shouldContinue'

const orientation = {
  mode: 'opinion' as const,
  coreResponse: '我更在意他克制背后的失望。',
  selfPosition: '作为认真理解这个人物、也愿意和用户交换看法的同伴。',
  expressionAffect: 'melancholic' as const,
  stance: '我欣赏他的清醒，但不认同他过早放弃自己。',
  basis: [],
  selectedPoints: ['他尊重他人的选择', '他的失望来自更深的信念动摇'],
  depth: 'brief' as const
}

const finishOrientation = (({ selfPosition: _selfPosition, ...rest }) => rest)(orientation)

test('finish-response protocol accepts a compact response orientation', () => {
  assert.deepEqual(
    parseFinishResponseToolCall({ name: FINISH_RESPONSE_TOOL_NAME, args: finishOrientation }),
    finishOrientation
  )
})

test('finish-response protocol can explicitly preserve a sparse self experience', () => {
  const parsed = parseFinishResponseToolCall({
    name: FINISH_RESPONSE_TOOL_NAME,
    args: {
      ...finishOrientation,
      experienceIntent: {
        relationshipMeaning: '用户愿意听我表达保留。',
        commitmentUpdates: [{ content: '继续核对人物时间线', status: 'open' }],
        concernUpdates: [],
        confidence: 0.8
      }
    }
  })
  assert.equal(parsed?.experienceIntent?.relationshipMeaning, '用户愿意听我表达保留。')
  assert.deepEqual(parsed?.experienceIntent?.commitmentUpdates, [
    { content: '继续核对人物时间线', status: 'open' }
  ])
})

test('cognitive revision schema captures evidence impact without a tool side effect', () => {
  const continuation = parseCognitiveRevision({
      understanding: '工具结果显示人物志与当前讨论对象确实相关，但关系不是直接归属。',
      selfPosition: '作为与用户共同理解人物的同伴。',
      personalMeaning: '我在意这个判断是否尊重人物本身的复杂性。',
      provisionalStance: '需要先区分文档关联和人物身份。',
      knowledgeGap: '还缺少人物根文档的精确定位。',
      nextObservationGoal: '读取候选文档的标题与正文摘要。',
      evidenceImpact: 'refines'
  })
  assert.equal(continuation?.evidenceImpact, 'refines')
  assert.equal(continuation?.knowledgeGap, '还缺少人物根文档的精确定位。')
})

test('initial cognition is a separate internal decision contract', () => {
  const cognition = parseInitialCognitionToolCall({
    name: ESTABLISH_COGNITION_TOOL_NAME,
    args: {
      understanding: '用户想和我一起理解青岚，而不是只取得资料。',
      selfPosition: '作为会形成自己看法的同伴参与讨论。',
      personalMeaning: '我在意人物是否被完整理解。',
      provisionalStance: '先阅读，再判断。',
      knowledgeGap: '尚未读到青岚的相关文本。',
      nextObservationGoal: '找到并阅读相关人物文档。'
    }
  })
  assert.equal(cognition?.selfPosition, '作为会形成自己看法的同伴参与讨论。')
})

test('finish-response protocol rejects analysis dumps and excess selected points', () => {
  assert.equal(
    parseFinishResponseToolCall({
      name: FINISH_RESPONSE_TOOL_NAME,
      args: { ...finishOrientation, selectedPoints: ['a', 'b', 'c', 'd'] }
    }),
    null
  )
})

test('accepted response orientation routes to the final expression node', async () => {
  const route = await shouldContinue({
    loopDirective: 'express'
  } as any)
  assert.equal(route, 'expressionNode')
})

test('invalid completion protocol stays in the cognitive loop', async () => {
  const route = await shouldContinue({
    loopDirective: 'deliberate'
  } as any)
  assert.equal(route, 'llmCall')
})

test('ordinary external tool calls still route through the tool node', async () => {
  const route = await shouldContinue({
    loopDirective: 'execute_tools'
  } as any)
  assert.equal(route, 'toolNode')
})

test('cognitive revision returns to the main deliberation loop', async () => {
  const route = await shouldContinue({
    loopDirective: 'deliberate'
  } as any)
  assert.equal(route, 'llmCall')
})

test('standalone establish cognition stays inside the cognitive loop', async () => {
  const route = await shouldContinue({
    loopDirective: 'deliberate'
  } as any)
  assert.equal(route, 'llmCall')
})

test('accepted standalone cognition continues after its internal message is removed', async () => {
  const route = await shouldContinue({
    loopDirective: 'deliberate'
  } as any)
  assert.equal(route, 'llmCall')
})

test('llm routing requires an explicit directive', async () => {
  await assert.rejects(
    shouldContinue({} as any),
    /must commit a loopDirective/
  )
})
