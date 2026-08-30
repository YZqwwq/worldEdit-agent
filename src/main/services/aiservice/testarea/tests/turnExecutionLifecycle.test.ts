import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceTurnExecutionModelStep,
  advanceToolBatch,
  appendTurnExecutionAction,
  beginToolBatch,
  createTurnExecutionAction,
  createTurnExecutionLedger,
  deriveTurnUnresolvedItems,
  findBlockedUnchangedInvocation
} from '../../agentrsystem/execution/turnExecutionLifecycle'
import { toolContextReloadNode } from '../../agentrsystem/node/toolcontextreloadnode/toolContextReloadNode'
import { mainAgentRunControlService } from '../../runtime/mainAgentRunControlService'

const action = (input: {
  actionId: string
  toolCallId: string
  documentId: string
  ok: boolean
  completion?: 'complete' | 'partial' | 'failed'
  summary: string
}) =>
  createTurnExecutionAction({
    ...input,
    toolName: 'read_world_document',
    args: { documentId: input.documentId },
    receipt: {
      kind: 'world_document_read',
      operation: '读取世界观文档',
      subject: { type: 'document', id: input.documentId },
      completion: input.completion,
      summary: input.summary,
      retryable: false,
      evidenceRef: `document:${input.documentId}`
    },
    startedAt: '2026-08-01T00:00:00.000Z'
  })

test('the turn ledger preserves multiple valid actions by the same tool', () => {
  let ledger = createTurnExecutionLedger('比较两篇世界观文档')
  ledger = advanceTurnExecutionModelStep(ledger, true)
  ledger = appendTurnExecutionAction(
    ledger,
    action({
      actionId: 'action-a',
      toolCallId: 'call-a',
      documentId: 'doc-a',
      ok: true,
      completion: 'complete',
      summary: '已取得文档 A 的完整正文。'
    })
  )
  ledger = appendTurnExecutionAction(
    ledger,
    action({
      actionId: 'action-b',
      toolCallId: 'call-b',
      documentId: 'doc-b',
      ok: true,
      completion: 'complete',
      summary: '已取得文档 B 的完整正文。'
    })
  )

  assert.equal(ledger.actions.length, 2)
  assert.deepEqual(
    ledger.actions.map((item) => item.subject?.id),
    ['doc-a', 'doc-b']
  )
  assert.equal(deriveTurnUnresolvedItems(ledger.actions).length, 0)
  assert.equal(ledger.objective, '比较两篇世界观文档')
  assert.deepEqual(
    ledger.actions.map((item) => item.summary),
    ['已取得文档 A 的完整正文。', '已取得文档 B 的完整正文。']
  )
})

test('a later successful action resolves an earlier partial result for the same subject', () => {
  let ledger = createTurnExecutionLedger('读取目标文档')
  ledger = appendTurnExecutionAction(
    ledger,
    action({
      actionId: 'action-partial',
      toolCallId: 'call-partial',
      documentId: 'doc-a',
      ok: true,
      completion: 'partial',
      summary: '暂时没有取得正文。'
    })
  )
  assert.deepEqual(deriveTurnUnresolvedItems(ledger.actions), ['暂时没有取得正文。'])

  ledger = appendTurnExecutionAction(
    ledger,
    action({
      actionId: 'action-complete',
      toolCallId: 'call-complete',
      documentId: 'doc-a',
      ok: true,
      completion: 'complete',
      summary: '已经取得完整正文。'
    })
  )
  assert.equal(deriveTurnUnresolvedItems(ledger.actions).length, 0)
})

test('pending tool context is promoted before the next model call', async () => {
  const pending = {
    id: 'pending-a',
    toolCallId: 'call-a',
    transcriptMessageIds: ['ai-a', 'tool-a'],
    toolName: 'read_world_document',
    retention: 'evidence' as const,
    ok: true,
    argsSummary: '{"documentId":"doc-a"}',
    resultSummary: '完整正文',
    createdAtLoop: 1
  }
  const patch = await toolContextReloadNode({
    pendingToolContext: [pending],
    toolEvidenceContext: [],
    ephemeralToolContext: [],
    activeToolTranscriptIds: ['ai-a', 'tool-a']
  } as any)

  assert.equal(patch.toolEvidenceContext?.length, 1)
  assert.equal(patch.toolEvidenceContext?.[0].toolCallId, 'call-a')
  assert.equal(patch.ephemeralToolContext?.length, 0)
})

test('tool batch cursor resumes only the unfinished calls', () => {
  let ledger = createTurnExecutionLedger('执行批量读取')
  ledger = advanceTurnExecutionModelStep(ledger, true)
  ledger = beginToolBatch(ledger, 'turn-1:1:a:b:c', ['a', 'b', 'c'])
  ledger = advanceToolBatch(ledger, 1)

  assert.equal(ledger.toolBatch?.status, 'running')
  assert.equal(ledger.toolBatch?.nextIndex, 1)

  const recovered = ledger
  const startIndex = recovered.toolBatch?.nextIndex ?? 0
  assert.deepEqual(recovered.toolBatch?.callIds.slice(startIndex), ['b', 'c'])

  const completed = advanceToolBatch(recovered, 3)
  assert.equal(completed.toolBatch?.status, 'completed')
  assert.equal(completed.toolBatch?.nextIndex, 3)
})

test('a mismatched tool batch starts a fresh cursor', () => {
  let ledger = createTurnExecutionLedger('执行批量读取')
  ledger = beginToolBatch(ledger, 'turn-1:1:a:b', ['a', 'b'])
  ledger = advanceToolBatch(ledger, 1)

  const next = beginToolBatch(ledger, 'turn-1:2:x:y', ['x', 'y'])
  assert.equal(next.toolBatch?.id, 'turn-1:2:x:y')
  assert.equal(next.toolBatch?.nextIndex, 0)
  assert.deepEqual(next.toolBatch?.callIds, ['x', 'y'])
})

test('a newer document edit continuation supersedes the stale revision for the same document', async () => {
  const supersessionKey = 'world-document-edit:doc-a'
  const previous = {
    id: 'evidence-old',
    toolCallId: 'call-old',
    supersessionKey,
    toolName: 'replace_text',
    retention: 'evidence' as const,
    ok: true,
    argsSummary: '{"expectedRevision":7}',
    resultSummary: '{"expectedRevisionForNextWrite":8}',
    createdAtLoop: 1
  }
  const pending = {
    id: 'pending-new',
    toolCallId: 'call-new',
    supersessionKey,
    transcriptMessageIds: ['ai-new', 'tool-new'],
    toolName: 'insert_text',
    retention: 'evidence' as const,
    ok: true,
    argsSummary: '{"expectedRevision":8}',
    resultSummary: '{"expectedRevisionForNextWrite":9}',
    createdAtLoop: 2
  }

  const patch = await toolContextReloadNode({
    pendingToolContext: [pending],
    toolEvidenceContext: [previous],
    ephemeralToolContext: [],
    activeToolTranscriptIds: ['ai-new', 'tool-new']
  } as any)

  assert.equal(patch.toolEvidenceContext?.length, 1)
  assert.equal(patch.toolEvidenceContext?.[0].toolCallId, 'call-new')
  assert.match(
    patch.toolEvidenceContext?.[0].resultSummary ?? '',
    /expectedRevisionForNextWrite\":9/
  )
})

test('unchanged arguments are blocked after a deterministic input failure', () => {
  let ledger = createTurnExecutionLedger('读取人物文档目录')
  ledger = appendTurnExecutionAction(
    ledger,
    createTurnExecutionAction({
      actionId: 'invalid-a',
      toolCallId: 'call-invalid-a',
      toolName: 'browse_world_document_tree',
      args: { worldId: 'world-a', entityId: 'entity-a' },
      ok: false,
      summary: 'entityId 参数格式错误。',
      retryCondition: 'change_arguments',
      fallbackRetryable: true,
      startedAt: '2026-08-01T00:00:00.000Z'
    })
  )

  assert.ok(
    findBlockedUnchangedInvocation(ledger, 'browse_world_document_tree', {
      entityId: 'entity-a',
      worldId: 'world-a'
    })
  )
  assert.equal(
    findBlockedUnchangedInvocation(ledger, 'browse_world_document_tree', {
      worldId: 'world-a',
      entityId: 'entity-b'
    }),
    undefined
  )
  assert.equal(ledger.actions[0]?.retryCondition, 'change_arguments')
})

test('eventual actions remain unresolved until a later completed state replaces them', () => {
  let ledger = createTurnExecutionLedger('执行后台阅读任务')
  ledger = appendTurnExecutionAction(
    ledger,
    createTurnExecutionAction({
      actionId: 'accepted-action',
      toolCallId: 'accepted-call',
      toolName: 'start_background_reading',
      args: { taskId: 'task-a' },
      ok: true,
      completionState: 'accepted',
      summary: '阅读任务已受理。',
      startedAt: '2026-08-01T00:00:00.000Z'
    })
  )

  assert.equal(ledger.actions[0]?.status, 'accepted')
  assert.deepEqual(deriveTurnUnresolvedItems(ledger.actions), ['阅读任务已受理。'])
  assert.equal(ledger.actions[0]?.status, 'accepted')

  ledger = appendTurnExecutionAction(
    ledger,
    createTurnExecutionAction({
      actionId: 'completed-action',
      toolCallId: 'completed-call',
      toolName: 'start_background_reading',
      args: { taskId: 'task-a' },
      ok: true,
      completionState: 'completed',
      summary: '阅读任务已经完成。',
      startedAt: '2026-08-01T00:01:00.000Z'
    })
  )

  assert.equal(deriveTurnUnresolvedItems(ledger.actions).length, 0)
})

test('interruption waits for durable tools to publish their receipt boundary', async () => {
  mainAgentRunControlService.reset()
  mainAgentRunControlService.startRun({ eventId: 'event-durable-tool', turnId: 91 })
  const finishTool = mainAgentRunControlService.beginDurableToolExecution()
  assert.equal(mainAgentRunControlService.interruptActiveRun(), true)

  let released = false
  const waiting = mainAgentRunControlService
    .waitForDurableToolExecutions('event-durable-tool')
    .then(() => {
      released = true
    })
  await Promise.resolve()
  assert.equal(released, false)

  finishTool()
  await waiting
  assert.equal(released, true)
  mainAgentRunControlService.finishRun('event-durable-tool')
})
