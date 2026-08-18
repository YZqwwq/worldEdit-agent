import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildToolConfirmationKey,
  clearToolConfirmationRequestsForTest,
  consumeToolConfirmation,
  isExplicitToolConfirmation,
  registerToolConfirmationRequest
} from '../../agentrsystem/node/toolnode/toolExecutionProtocol'

test('confirmation keys are stable across object key order but change with arguments', () => {
  const first = buildToolConfirmationKey('delete_world_document', {
    recursive: false,
    documentId: 'doc-a'
  })
  const reordered = buildToolConfirmationKey('delete_world_document', {
    documentId: 'doc-a',
    recursive: false
  })
  const changed = buildToolConfirmationKey('delete_world_document', {
    documentId: 'doc-b',
    recursive: false
  })

  assert.equal(first, reordered)
  assert.notEqual(first, changed)
})

test('the model cannot consume a confirmation challenge in the same user turn', () => {
  clearToolConfirmationRequestsForTest()
  const key = buildToolConfirmationKey('delete_world_document', { documentId: 'doc-a' })
  registerToolConfirmationRequest({
    sessionId: 'session-a',
    eventId: 'event-a',
    confirmationKey: key
  })
  assert.equal(
    consumeToolConfirmation({
      sessionId: 'session-a',
      eventId: 'event-a',
      confirmationKey: key,
      userText: '确认，继续执行。'
    }),
    false
  )
})

test('only a later explicit user confirmation authorizes the exact invocation', () => {
  clearToolConfirmationRequestsForTest()
  const key = buildToolConfirmationKey('delete_world_document', { documentId: 'doc-a' })
  const otherKey = buildToolConfirmationKey('delete_world_document', { documentId: 'doc-b' })
  registerToolConfirmationRequest({
    sessionId: 'session-a',
    eventId: 'event-a',
    confirmationKey: key
  })
  assert.equal(
    consumeToolConfirmation({
      sessionId: 'session-a',
      eventId: 'event-b',
      confirmationKey: otherKey,
      userText: '确认，继续执行。'
    }),
    false
  )
  assert.equal(
    consumeToolConfirmation({
      sessionId: 'session-a',
      eventId: 'event-b',
      confirmationKey: key,
      userText: '确认，继续执行。'
    }),
    true
  )
  assert.equal(
    consumeToolConfirmation({
      sessionId: 'session-a',
      eventId: 'event-c',
      confirmationKey: key,
      userText: '确认，继续执行。'
    }),
    false
  )
})

test('negative replies never count as confirmation', () => {
  assert.equal(isExplicitToolConfirmation('不要确认，取消删除。'), false)
  assert.equal(isExplicitToolConfirmation('确认，继续执行。'), true)
})
