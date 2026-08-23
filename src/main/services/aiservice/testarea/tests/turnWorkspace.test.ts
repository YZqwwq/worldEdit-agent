import assert from 'node:assert/strict'
import test from 'node:test'
import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { createDefaultMemorySlots } from '../../agentrsystem/manager/memory/memoryWritePolicy'
import {
  createFinalResponse,
  createTurnWorkspace,
  getEffectiveMemorySlots,
  withDurableToolReceipt,
  withMemoryMessagesDraft,
  withMemorySlotsDraft,
  withObservationDraft,
  withSuccessfulToolUse,
  withToolChangeSetSummary
} from '../../agentrsystem/state/turnWorkspace'
import { buildDurableToolEffectCheckpointState } from '../../agentrsystem/execution/durableToolEffectCheckpoint'
import { resolveTurnWorkspaceCommitPolicy } from '../../runtime/orchestration/turnCommitPolicy'
import { createDefaultSelfCore } from '../../agentrsystem/manager/selfmodel/selfCoreDefinition'
import { getEffectiveSelfCore } from '../../agentrsystem/state/turnWorkspace'

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

test('Turn workspace captures an immutable Self Core base projection', () => {
  const selfCore = createDefaultSelfCore('你是法弥拉。', '2026-08-23T00:00:00.000Z')
  const workspace = createTurnWorkspace({
    eventId: 'event-core',
    turnId: 8,
    sessionId: 'default',
    runId: 'run-core',
    memorySlots: createDefaultMemorySlots(),
    persona: null,
    selfCore
  })
  assert.equal(workspace.base.selfCore?.revision, 1)
  assert.equal(getEffectiveSelfCore(workspace)?.revision, 1)
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

test('background commits cannot publish interactive memory slots', () => {
  assert.deepEqual(
    resolveTurnWorkspaceCommitPolicy('completed', 'background_persona_stage_consumer'),
    {
      commitMemorySlots: false,
      commitPersona: true
    }
  )
  assert.deepEqual(resolveTurnWorkspaceCommitPolicy('interrupted', 'chat_runtime'), {
    commitMemorySlots: true,
    commitPersona: true
  })
})

test('durable tool receipts survive interruption checkpoints without duplication', () => {
  const receipt = {
    toolCallId: 'call-update-doc',
    toolName: 'update_world_document',
    operation: '更新世界观文档',
    subject: { type: 'document', id: 'doc-1', label: '力量体系' },
    completion: 'complete' as const,
    completionState: 'completed' as const,
    summary: '更新力量体系说明。',
    retryable: false,
    evidenceRef: 'document:doc-1',
    payload: { revision: 9 },
    persistedAt: '2026-08-13T12:00:00.000Z'
  }
  let workspace = withDurableToolReceipt(createWorkspace(), receipt)
  workspace = withDurableToolReceipt(workspace, { ...receipt, summary: '最终回执' })

  assert.equal(workspace.draft.durableToolReceipts.length, 1)
  assert.equal(workspace.draft.durableToolReceipts[0]?.summary, '最终回执')

  const aiMessage = new AIMessage({
    content: '',
    tool_calls: [{ id: receipt.toolCallId, name: receipt.toolName, args: { documentId: 'doc-1' } }]
  })
  const toolMessage = new ToolMessage({
    content: JSON.stringify({ ok: true, revision: 9 }),
    tool_call_id: receipt.toolCallId,
    name: receipt.toolName
  })
  const checkpoint = buildDurableToolEffectCheckpointState(
    {
      messages: [aiMessage],
      activeToolsets: ['world_document_editor'],
      activeTools: [],
      turnWorkspace: createWorkspace()
    } as never,
    {
      messages: [toolMessage],
      activeToolsets: ['world_document_editor'],
      turnWorkspace: workspace
    }
  )

  assert.equal(checkpoint.messages.length, 2)
  assert.equal(checkpoint.turnWorkspace?.draft.durableToolReceipts[0]?.payload?.revision, 9)
})

test('change set summary survives the same workspace checkpoint as durable receipts', () => {
  const workspace = withToolChangeSetSummary(createWorkspace(), {
    id: 'event-1:turn:7',
    scopeType: 'turn',
    scopeId: 'event-1:7',
    eventId: 'event-1',
    turnId: 7,
    sessionId: 'default',
    lifecycle: 'open',
    outcome: 'partial',
    effectCount: 3,
    counts: { planned: 0, completed: 2, failed: 1, aborted: 0, unknown: 0 },
    subjectTypes: ['document', 'image'],
    summaries: ['更新文档', '替换图片', '地图更新失败'],
    createdAt: '2026-08-14T00:00:00.000Z'
  })

  assert.equal(workspace.draft.changeSet?.outcome, 'partial')
  assert.deepEqual(workspace.draft.changeSet?.subjectTypes, ['document', 'image'])
})

test('one tool call preserves multiple effect receipts by effect identity', () => {
  const base = {
    toolCallId: 'call-batch-edit',
    toolName: 'edit_world_assets',
    completion: 'complete' as const,
    completionState: 'completed' as const,
    summary: '完成修改',
    retryable: false,
    persistedAt: '2026-08-14T00:00:00.000Z'
  }
  let workspace = withDurableToolReceipt(createWorkspace(), {
    ...base,
    receiptId: 'receipt-document',
    effectKey: 'document:doc-1',
    operation: '更新文档',
    subject: { type: 'document', id: 'doc-1' }
  })
  workspace = withDurableToolReceipt(workspace, {
    ...base,
    receiptId: 'receipt-image',
    effectKey: 'image:image-1',
    operation: '替换图片',
    subject: { type: 'image', id: 'image-1' }
  })

  assert.equal(workspace.draft.durableToolReceipts.length, 2)
})
