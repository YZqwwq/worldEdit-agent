import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceTurnExecutionModelStep,
  appendTurnExecutionAction,
  createTurnExecutionAction,
  createTurnExecutionLedger,
  findBlockedUnchangedInvocation,
  markTurnForFinalization,
  MAX_MODEL_STEPS_BEFORE_FINALIZATION,
  renderTurnExecutionLedger,
  shouldFinalizeToolLoop
} from '../agentrsystem/execution/turnExecutionLifecycle'
import { toolContextReloadNode } from '../agentrsystem/node/toolcontextreloadnode/toolContextReloadNode'
import { mainAgentRunControlService } from '../runtime/mainAgentRunControlService'

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
  assert.equal(ledger.unresolvedItems.length, 0)
  const prompt = renderTurnExecutionLedger(ledger)
  assert.match(prompt, /比较两篇世界观文档/)
  assert.match(prompt, /文档 A/)
  assert.match(prompt, /文档 B/)
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
  assert.deepEqual(ledger.unresolvedItems, ['暂时没有取得正文。'])

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
  assert.equal(ledger.unresolvedItems.length, 0)
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

test('the loop limit enters a ledger-based finalization phase', () => {
  let ledger = createTurnExecutionLedger('完成一个多步骤任务')
  for (let index = 0; index < MAX_MODEL_STEPS_BEFORE_FINALIZATION; index += 1) {
    ledger = advanceTurnExecutionModelStep(ledger, true)
  }
  assert.equal(shouldFinalizeToolLoop(ledger), true)

  ledger = markTurnForFinalization(ledger)
  assert.equal(ledger.phase, 'answering')
  assert.equal(shouldFinalizeToolLoop(ledger), false)
  assert.match(renderTurnExecutionLedger(ledger), /异常收尾阶段/)
})

test('unchanged arguments are blocked after a deterministic input failure', () => {
  let ledger = createTurnExecutionLedger('读取人物文档目录')
  ledger = appendTurnExecutionAction(
    ledger,
    createTurnExecutionAction({
      actionId: 'invalid-a',
      toolCallId: 'call-invalid-a',
      toolName: 'list_world_documents',
      args: { worldId: 'world-a', entityId: 'entity-a' },
      ok: false,
      summary: 'entityId 参数格式错误。',
      retryCondition: 'change_arguments',
      fallbackRetryable: true,
      startedAt: '2026-08-01T00:00:00.000Z'
    })
  )

  assert.ok(
    findBlockedUnchangedInvocation(ledger, 'list_world_documents', {
      entityId: 'entity-a',
      worldId: 'world-a'
    })
  )
  assert.equal(
    findBlockedUnchangedInvocation(ledger, 'list_world_documents', {
      worldId: 'world-a',
      entityId: 'entity-b'
    }),
    undefined
  )
  assert.match(renderTurnExecutionLedger(ledger), /必须修改参数后重试/)
})

test('repeated invalid actions can enter an explicit finalization state', () => {
  const ledger = markTurnForFinalization(
    createTurnExecutionLedger('读取人物文档'),
    'repeated_invalid_action'
  )

  assert.equal(ledger.finalizationReason, 'repeated_invalid_action')
  assert.match(renderTurnExecutionLedger(ledger), /同一无效参数被原样重复提交/)
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
  assert.deepEqual(ledger.unresolvedItems, ['阅读任务已受理。'])
  assert.match(renderTurnExecutionLedger(ledger), /不得声称最终工作已经完成/)

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

  assert.equal(ledger.unresolvedItems.length, 0)
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
