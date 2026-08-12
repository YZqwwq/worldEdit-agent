import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultMemorySlots } from '../agentrsystem/manager/memory/memoryWritePolicy'
import {
  createFinalResponse,
  createTurnWorkspace,
  getEffectiveMemorySlots,
  withMemoryMessagesDraft,
  withMemorySlotsDraft,
  withObservationDraft,
  withSuccessfulToolUse
} from '../agentrsystem/state/turnWorkspace'
import { shouldBypassInteractivePerception } from '../agentrsystem/node/instantperceptionnode/instantPerceptionRouting'
import { resolveTurnWorkspaceCommitPolicy } from '../runtime/orchestration/turnCommitPolicy'

const createWorkspace = () =>
  createTurnWorkspace({
    eventId: 'event-1',
    turnId: 7,
    sessionId: 'default',
    runId: 'run-1',
    memorySlots: createDefaultMemorySlots(),
    persona: null
  })

test('turn workspace mutations preserve the base snapshot', () => {
  const workspace = createWorkspace()
  const nextSlots = {
    ...getEffectiveMemorySlots(workspace),
    user_mood: {
      ...getEffectiveMemorySlots(workspace).user_mood,
      current_mood: 'calm' as const
    }
  }
  const next = withMemorySlotsDraft(workspace, nextSlots)

  assert.equal(workspace.base.memorySlots.user_mood.current_mood, undefined)
  assert.equal(workspace.draft.memorySlots, undefined)
  assert.equal(getEffectiveMemorySlots(next).user_mood.current_mood, 'calm')
})

test('turn workspace carries one finalizable draft without duplicate derived effects', () => {
  let workspace = createWorkspace()
  workspace = withMemoryMessagesDraft(workspace, [
    { role: 'user', content: '问题' },
    { role: 'ai', content: '回答' }
  ])
  workspace = withSuccessfulToolUse(workspace, 'read_document')
  workspace = withSuccessfulToolUse(workspace, 'read_document')
  workspace = withObservationDraft(workspace, {
    id: 1,
    type: 'user_message',
    source: 'user',
    summary: '问题',
    payload: { text: '问题' },
    createdAt: '2026-08-09T00:00:00.000Z'
  })

  assert.deepEqual(workspace.draft.successfulToolNames, ['read_document'])
  assert.equal(workspace.draft.memoryMessages.length, 2)
  assert.equal(workspace.draft.observations.length, 1)
  assert.deepEqual(createFinalResponse({ messageId: ' message-1 ', content: ' 回答 ' }), {
    messageId: ' message-1 ',
    content: ' 回答 '
  })
})

test('background persona stages bypass interactive perception', () => {
  assert.equal(shouldBypassInteractivePerception(undefined), false)
  assert.equal(shouldBypassInteractivePerception({} as never), true)
})

test('background commits cannot publish interactive memory slots', () => {
  assert.deepEqual(
    resolveTurnWorkspaceCommitPolicy('completed', 'background_persona_stage_consumer'),
    {
      commitMemorySlots: false,
      commitPersona: true
    }
  )
  assert.deepEqual(resolveTurnWorkspaceCommitPolicy('interrupted', 'chat_runtime'), {
    commitMemorySlots: false,
    commitPersona: false
  })
})
