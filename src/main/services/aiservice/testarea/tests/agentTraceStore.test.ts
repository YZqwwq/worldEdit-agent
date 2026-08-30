import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentTraceRecord } from '@share/cache/render/aiagent/agentTrace'
import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import {
  appendAgentTraceRecord,
  configureAgentTraceStorage,
  listAgentTraceRuns,
  persistAgentTraceArtifact,
  queryAgentTrace,
  readAgentTraceArtifact
} from '../../../log/trace/agentTraceStore'
import { runWithAgentRuntimeContext } from '../../runtime/agentRuntimeContext'
import {
  traceArtifact,
  traceDecision,
  traceState
} from '../../../log/trace/agentTraceEmitter'
import { emitAgentStage, emitAgentThought, emitAgentTurnPhase } from '../../runtime/agentRuntimeOutput'

const makeRecord = (
  runId: string,
  sequence: number,
  overrides: Partial<AgentTraceRecord> = {}
): AgentTraceRecord => ({
  id: `${runId}-${sequence}`,
  sessionId: 'default',
  eventId: 'event-42',
  runId,
  turnId: 42,
  scope: 'loop',
  node: 'cognitionNode',
  phase: 'state',
  title: `record ${sequence}`,
  summary: 'x'.repeat(80),
  timestamp: 1_700_000_000_000 + sequence,
  level: 'info',
  sequence,
  ...overrides
})

test('trace queries require a run and remain bounded by cursor and character budget', () => {
  const root = mkdtempSync(join(tmpdir(), 'worldedit-agent-trace-'))
  configureAgentTraceStorage(root)
  try {
    appendAgentTraceRecord(makeRecord('run-a', 1))
    appendAgentTraceRecord(
      makeRecord('run-a', 2, { node: 'toolNode', phase: 'error', level: 'error' })
    )
    appendAgentTraceRecord(makeRecord('run-a', 3))
    appendAgentTraceRecord(makeRecord('run-b', 1))

    const firstPage = queryAgentTrace({ runId: 'run-a', limit: 2, charBudget: 10_000 })
    assert.deepEqual(
      firstPage.records.map((record) => record.sequence),
      [1, 2]
    )
    assert.equal(firstPage.nextCursor, 2)
    assert.equal(firstPage.totalMatching, 3)

    const errors = queryAgentTrace({ runId: 'run-a', level: 'error' })
    assert.deepEqual(
      errors.records.map((record) => record.node),
      ['toolNode']
    )

    const budgeted = queryAgentTrace({ runId: 'run-a', charBudget: 250 })
    assert.equal(budgeted.records.length, 1)
    assert.equal(budgeted.truncated, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('runtime traces receive a stable sequence and redact credential fields', async () => {
  const root = mkdtempSync(join(tmpdir(), 'worldedit-agent-trace-'))
  configureAgentTraceStorage(root)
  try {
    await runWithAgentRuntimeContext(
      'run-sequence',
      { sessionId: 'session-7', eventId: 'event-7', turnId: 7 },
      async () => {
      traceState('contextNode', { data: { apiKey: 'private-value', model: 'qwen' } })
      traceArtifact('modelNode', {
        data: {
          response: { authorization: 'Bearer private-value', body: 'x'.repeat(7_000) }
        }
      })
      traceDecision('cognitionNode', { summary: 'compose_final' })
      }
    )
    const result = queryAgentTrace({ runId: 'run-sequence' })
    assert.deepEqual(
      result.records.map((record) => record.sequence),
      [1, 2, 3, 4]
    )
    assert.equal(result.records.at(-1)?.node, 'runSummary')
    assert.equal(result.records[0].sessionId, 'session-7')
    assert.equal(result.records[0].eventId, 'event-7')
    assert.deepEqual(result.records[0].data, { apiKey: '[REDACTED]', model: 'qwen' })
    const artifactRef = (result.records[1].data as { $artifactRef: string }).$artifactRef
    const artifact = readAgentTraceArtifact({ artifactRef })
    assert.doesNotMatch(artifact.content, /private-value/)
    assert.match(artifact.content, /\[REDACTED\]/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('user-visible turn activity streams separately from diagnostic trace records', async () => {
  const root = mkdtempSync(join(tmpdir(), 'worldedit-agent-trace-'))
  configureAgentTraceStorage(root)
  const chunks: StreamChunk[] = []
  try {
    await runWithAgentRuntimeContext(
      'run-user-activity',
      {
        sessionId: 'session-9',
        eventId: 'event-9',
        turnId: 9,
        emitChunk: (chunk) => chunks.push(chunk)
      },
      async () => {
        emitAgentThought({
          thoughtId: 'thought-1',
          text: '需要先确认后半段人物经历。',
          sequence: 1,
          followsToolResult: false
        })
        emitAgentStage({
          stageId: 'tool-1',
          label: '正在读取人物文档',
          status: 'running'
        })
        emitAgentTurnPhase({ phase: 'finalizing', label: '正在整理回答' })
      }
    )

    assert.deepEqual(
      chunks.slice(0, 3).map((chunk) => chunk.type),
      ['agent_thought', 'agent_stage', 'agent_turn_phase']
    )
    assert.equal(chunks[0].type === 'agent_thought' ? chunks[0].text : '', '需要先确认后半段人物经历。')
    assert.equal(queryAgentTrace({ runId: 'run-user-activity' }).records.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('run listing uses deterministic terminal summaries instead of replaying all trace data', () => {
  const root = mkdtempSync(join(tmpdir(), 'worldedit-agent-trace-'))
  configureAgentTraceStorage(root)
  try {
    appendAgentTraceRecord(makeRecord('run-failed', 1))
    appendAgentTraceRecord(
      makeRecord('run-failed', 2, {
        node: 'runSummary',
        scope: 'run',
        phase: 'error',
        level: 'error',
        durationMs: 320,
        data: {
        nodePath: ['contextNode', 'cognitionNode'],
          tools: ['read_world_document'],
        failureNode: 'cognitionNode'
        }
      })
    )
    appendAgentTraceRecord(makeRecord('run-active', 1, { timestamp: 1_700_000_001_000 }))

    const summaries = listAgentTraceRuns({ limit: 10 })
    assert.equal(summaries[0].runId, 'run-active')
    assert.equal(summaries[0].status, 'running')
    assert.equal(summaries[1].status, 'failed')
    assert.deepEqual(summaries[1].tools, ['read_world_document'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('trace queries use typed turn, loop and tool-effect correlations', () => {
  const root = mkdtempSync(join(tmpdir(), 'worldedit-agent-trace-'))
  configureAgentTraceStorage(root)
  try {
    appendAgentTraceRecord(
      makeRecord('run-correlated', 1, {
        modelStep: 2,
        toolCallId: 'call-2',
        actionId: 'action-2',
        changeSetId: 'change-set-2',
        receiptIds: ['receipt-2'],
        scope: 'tool'
      })
    )
    appendAgentTraceRecord(
      makeRecord('run-correlated', 2, { modelStep: 3, toolCallId: 'call-3', scope: 'tool' })
    )

    assert.equal(queryAgentTrace({ turnId: 42, modelStep: 2 }).records.length, 1)
    assert.equal(queryAgentTrace({ eventId: 'event-42', toolCallId: 'call-2' }).records.length, 1)
    assert.equal(queryAgentTrace({ sessionId: 'default', changeSetId: 'change-set-2' }).records.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('trace artifacts are read explicitly with truncation and path containment', () => {
  const root = mkdtempSync(join(tmpdir(), 'worldedit-agent-trace-'))
  configureAgentTraceStorage(root)
  try {
    const artifactRef = persistAgentTraceArtifact({
      runId: 'run-artifact',
      artifactId: 'large-output',
      extension: 'txt',
      content: 'abcdef'
    })
    assert.deepEqual(readAgentTraceArtifact({ artifactRef, maxChars: 3 }), {
      content: 'abc',
      chars: 6,
      truncated: true
    })
    assert.throws(
      () => readAgentTraceArtifact({ artifactRef: '../../outside.txt' }),
      /escapes the trace artifact root/
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
