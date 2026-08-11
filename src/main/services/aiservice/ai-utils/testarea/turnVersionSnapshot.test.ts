import assert from 'node:assert/strict'
import test from 'node:test'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import {
  deserializeTurnGraphState,
  readCompletedActionKeys,
  serializeTurnGraphState
} from '../../runtime/version/turnVersionSnapshot'
import { createDefaultMemorySlots } from '../../agentrsystem/manager/memory/memoryWritePolicy'
import { createTurnWorkspace } from '../../agentrsystem/state/turnWorkspace'
import type { MessagesState } from '../../agentrsystem/state/messageState'
import { canTransitionMainAgentEventStatus, canTransitionMainAgentTurnStatus } from '@share/cache/AItype/states/mainAgentOrchestrationRules'

const createState = (): typeof MessagesState.State => ({
  messages: [
    new HumanMessage({ content: '继续这个方案', id: 'user-1' }),
    new AIMessage({
      content: '',
      id: 'ai-1',
      tool_calls: [{ id: 'tool-1', name: 'read_world_document', args: { documentId: 'doc-1' } }]
    })
  ],
  turnWorkspace: createTurnWorkspace({
    eventId: 'event-1',
    turnId: 1,
    sessionId: 'default',
    runId: 'run-1',
    memorySlots: createDefaultMemorySlots(),
    persona: null
  }),
  turnExecutionLedger: {
    objective: '读取文档',
    phase: 'acting',
    modelStep: 1,
    unresolvedItems: [],
    actions: [
      {
        actionId: 'action-1',
        toolCallId: 'tool-1',
        toolName: 'read_world_document',
        operation: 'read',
        status: 'completed',
        summary: '读取完成',
        retryable: false,
        retryCondition: 'none',
        invocationFingerprint: 'read_world_document:{"documentId":"doc-1"}',
        evidenceRefs: [],
        startedAt: '2026-08-10T00:00:00.000Z',
        completedAt: '2026-08-10T00:00:01.000Z'
      }
    ]
  }
}) as unknown as typeof MessagesState.State

test('turn graph snapshot restores messages, workspace and exact resume point', () => {
  const snapshot = serializeTurnGraphState(createState())
  const restored = deserializeTurnGraphState(snapshot, 'toolNode')

  assert.equal(restored.resumeFromNode, 'toolNode')
  assert.equal(restored.messages?.length, 2)
  assert.equal(restored.messages?.[0].content, '继续这个方案')
  assert.equal(restored.turnWorkspace?.eventId, 'event-1')
  assert.equal(restored.turnExecutionLedger?.actions[0].status, 'completed')
})

test('completed tool actions are visible to rollback safety checks', () => {
  const snapshot = serializeTurnGraphState(createState())
  assert.deepEqual(readCompletedActionKeys(snapshot), [
    'read_world_document:{"documentId":"doc-1"}'
  ])
})

test('paused is a resumable state rather than a committed terminal state', () => {
  assert.equal(canTransitionMainAgentEventStatus('processing', 'paused'), true)
  assert.equal(canTransitionMainAgentEventStatus('paused', 'processing'), true)
  assert.equal(canTransitionMainAgentTurnStatus('processing', 'paused'), true)
  assert.equal(canTransitionMainAgentTurnStatus('paused', 'processing'), true)
})
