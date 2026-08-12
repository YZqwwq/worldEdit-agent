import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { DataSource } from 'typeorm'
import {
  deserializeReadyToCommitCandidate,
  deserializeTurnGraphState,
  readCompletedActionKeys,
  serializeReadyToCommitCandidate,
  serializeTurnGraphState
} from '../../runtime/version/turnVersionSnapshot'
import { createDefaultMemorySlots } from '../../agentrsystem/manager/memory/memoryWritePolicy'
import { createTurnWorkspace } from '../../agentrsystem/state/turnWorkspace'
import type { MessagesState } from '../../agentrsystem/state/messageState'
import { canTransitionMainAgentEventStatus, canTransitionMainAgentTurnStatus } from '@share/cache/AItype/states/mainAgentOrchestrationRules'
import { MainAgentEventRecord } from '@share/entity/database/MainAgentEventRecord'
import { MainAgentTurnRecord } from '@share/entity/database/MainAgentTurnRecord'
import { MainAgentTurnVersionRecord } from '@share/entity/database/MainAgentTurnVersionRecord'
import {
  persistCancelledPausedTurn,
  persistFinalTurnVersionWithManager,
  persistTurnVersion
} from '../../runtime/version/turnVersionPersistence'
import type { MainAgentReadyToCommitCandidate } from '@share/cache/AItype/states/turnWorkspace'
import {
  resolveMainAgentTurnRecovery,
  type MainAgentTurnRecoveryState
} from '../../runtime/version/turnRecoveryPolicy'

const sqliteTest = process.env.RUN_TURN_VERSION_SQLITE_TESTS === '1' ? test : test.skip

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

const createVersionDataSource = async (
  database: string,
  synchronize = true
): Promise<DataSource> => {
  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database,
    synchronize,
    entities: [MainAgentEventRecord, MainAgentTurnRecord, MainAgentTurnVersionRecord]
  })
  await dataSource.initialize()
  return dataSource
}

const seedProcessingTurn = async (
  dataSource: DataSource,
  eventId: string
): Promise<MainAgentTurnRecord> => {
  await dataSource.getRepository(MainAgentEventRecord).save({
    id: eventId,
    type: 'user_message',
    source: 'user',
    sessionId: 'default',
    priority: 'interactive',
    createdAtMs: Date.now(),
    dedupeKey: null,
    payloadJson: '{}',
    status: 'processing',
    consumer: null,
    summary: '',
    errorMessage: '',
    startedAt: new Date(),
    finishedAt: null
  })
  return dataSource.getRepository(MainAgentTurnRecord).save({
    eventId,
    sessionId: 'default',
    consumer: 'chat_runtime',
    status: 'processing',
    userMessageId: null,
    aiMessageId: null,
    headVersionId: null,
    reversible: 1,
    memoryCheckpointJson: '{}',
    errorMessage: '',
    startedAt: new Date(),
    completedAt: null,
    interruptedAt: null,
    pausedAt: null,
    cancelledAt: null,
    revertedAt: null
  })
}

const createReadyCandidate = (
  eventId: string,
  turnId: number
): MainAgentReadyToCommitCandidate => ({
  schemaVersion: 1,
  eventId,
  turnId,
  sessionId: 'default',
  consumer: 'chat_runtime',
  status: 'completed',
  workspace: createTurnWorkspace({
    eventId,
    turnId,
    sessionId: 'default',
    runId: 'ready-run',
    memorySlots: createDefaultMemorySlots(),
    persona: null
  }),
  finalResponse: {
    messageId: `${eventId}:final`,
    content: '这是已经完成计算、等待正式提交的回复。'
  }
})

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
  assert.equal(canTransitionMainAgentEventStatus('paused', 'cancelled'), true)
  assert.equal(canTransitionMainAgentTurnStatus('paused', 'cancelled'), true)
  assert.equal(canTransitionMainAgentEventStatus('cancelled', 'processing'), false)
  assert.equal(canTransitionMainAgentTurnStatus('cancelled', 'processing'), false)
})

test('ready-to-commit candidates preserve the authoritative response and workspace', () => {
  const candidate = createReadyCandidate('ready-candidate', 42)
  const restored = deserializeReadyToCommitCandidate(
    serializeReadyToCommitCandidate(candidate)
  )

  assert.deepEqual(restored, candidate)
  assert.equal(restored.finalResponse.content, candidate.finalResponse.content)
  assert.equal(restored.workspace.turnId, 42)
})

test('six crash boundaries resolve to explicit startup recovery actions', () => {
  const cases: Array<{
    boundary: string
    state: MainAgentTurnRecoveryState
    action: ReturnType<typeof resolveMainAgentTurnRecovery>['action']
  }> = [
    {
      boundary: 'before pause transaction',
      state: {
        eventType: 'user_message',
        eventStatus: 'processing',
        turnStatus: 'processing',
        headKind: 'checkpoint'
      },
      action: 'fail_closed'
    },
    {
      boundary: 'pause transaction committed',
      state: {
        eventType: 'user_message',
        eventStatus: 'paused',
        turnStatus: 'paused',
        headKind: 'checkpoint'
      },
      action: 'restore_paused_owner'
    },
    {
      boundary: 'after pause with ready candidate',
      state: {
        eventType: 'user_message',
        eventStatus: 'paused',
        turnStatus: 'paused',
        headKind: 'ready_to_commit'
      },
      action: 'restore_paused_owner'
    },
    {
      boundary: 'while resuming a normal checkpoint',
      state: {
        eventType: 'user_message',
        eventStatus: 'processing',
        turnStatus: 'processing',
        headKind: 'checkpoint'
      },
      action: 'fail_closed'
    },
    {
      boundary: 'before Final commit',
      state: {
        eventType: 'user_message',
        eventStatus: 'processing',
        turnStatus: 'processing',
        headKind: 'ready_to_commit'
      },
      action: 'resume_ready_commit'
    },
    {
      boundary: 'after Final commit',
      state: {
        eventType: 'user_message',
        eventStatus: 'completed',
        turnStatus: 'completed',
        headKind: 'final'
      },
      action: 'none'
    }
  ]

  for (const crashCase of cases) {
    assert.equal(
      resolveMainAgentTurnRecovery(crashCase.state).action,
      crashCase.action,
      crashCase.boundary
    )
  }
})

test('startup reconciles only a committed Turn with a Final HEAD', () => {
  assert.equal(
    resolveMainAgentTurnRecovery({
      eventType: 'user_message',
      eventStatus: 'processing',
      turnStatus: 'completed',
      headKind: 'final'
    }).action,
    'reconcile_completed_event'
  )
  assert.equal(
    resolveMainAgentTurnRecovery({
      eventType: 'user_message',
      eventStatus: 'processing',
      turnStatus: 'completed',
      headKind: 'ready_to_commit'
    }).action,
    'fail_closed'
  )
})

sqliteTest('pause checkpoint atomically saves version, HEAD, turn and event state', async () => {
  const dataSource = await createVersionDataSource(':memory:')
  try {
    const eventId = 'atomic-pause-success'
    const turn = await seedProcessingTurn(dataSource, eventId)
    const first = await persistTurnVersion(dataSource, {
      eventId,
      turnId: turn.id,
      resumePoint: 'contextNode',
      snapshotJson: '{"checkpoint":1}',
      pause: false
    })
    const candidate = createReadyCandidate(eventId, turn.id)
    const paused = await persistTurnVersion(dataSource, {
      eventId,
      turnId: turn.id,
      kind: 'ready_to_commit',
      resumePoint: 'commit_turn',
      snapshotJson: serializeReadyToCommitCandidate(candidate),
      pause: true
    })

    const savedTurn = await dataSource.getRepository(MainAgentTurnRecord).findOneByOrFail({ id: turn.id })
    const savedEvent = await dataSource.getRepository(MainAgentEventRecord).findOneByOrFail({ id: eventId })
    const versions = await dataSource.getRepository(MainAgentTurnVersionRecord).find({
      where: { turnId: turn.id },
      order: { sequence: 'ASC' }
    })

    assert.equal(versions.length, 2)
    assert.equal(paused.sequence, 2)
    assert.equal(paused.parentVersionId, first.id)
    assert.equal(paused.kind, 'ready_to_commit')
    assert.deepEqual(deserializeReadyToCommitCandidate(paused.snapshotJson), candidate)
    assert.equal(savedTurn.headVersionId, paused.id)
    assert.equal(savedTurn.status, 'paused')
    assert.ok(savedTurn.pausedAt instanceof Date)
    assert.equal(savedEvent.status, 'paused')
    assert.equal(savedEvent.summary, 'turn_paused')
    assert.equal(savedEvent.finishedAt, null)
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest('pause transaction rolls back version and HEAD when the event update fails', async () => {
  const dataSource = await createVersionDataSource(':memory:')
  try {
    const eventId = 'atomic-pause-rollback'
    const turn = await seedProcessingTurn(dataSource, eventId)
    const first = await persistTurnVersion(dataSource, {
      eventId,
      turnId: turn.id,
      resumePoint: 'contextNode',
      snapshotJson: '{"checkpoint":1}',
      pause: false
    })
    await dataSource.query(`
      CREATE TRIGGER reject_paused_event
      BEFORE UPDATE ON main_agent_event_record
      WHEN NEW.status = 'paused'
      BEGIN
        SELECT RAISE(ABORT, 'injected pause failure');
      END
    `)

    await assert.rejects(
      persistTurnVersion(dataSource, {
        eventId,
        turnId: turn.id,
        resumePoint: 'llmCall',
        snapshotJson: '{"checkpoint":2}',
        pause: true
      }),
      /injected pause failure/
    )

    const savedTurn = await dataSource.getRepository(MainAgentTurnRecord).findOneByOrFail({ id: turn.id })
    const savedEvent = await dataSource.getRepository(MainAgentEventRecord).findOneByOrFail({ id: eventId })
    const versions = await dataSource.getRepository(MainAgentTurnVersionRecord).findBy({ turnId: turn.id })

    assert.equal(versions.length, 1)
    assert.equal(savedTurn.headVersionId, first.id)
    assert.equal(savedTurn.status, 'processing')
    assert.equal(savedTurn.pausedAt, null)
    assert.equal(savedEvent.status, 'processing')
    assert.equal(savedEvent.summary, '')
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest('an atomically paused turn remains discoverable after reopening SQLite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'worldedit-turn-version-'))
  const database = join(directory, 'turn-version.sqlite')
  let writer: DataSource | undefined
  let reader: DataSource | undefined
  try {
    writer = await createVersionDataSource(database)
    const eventId = 'atomic-pause-reopen'
    const turn = await seedProcessingTurn(writer, eventId)
    const version = await persistTurnVersion(writer, {
      eventId,
      turnId: turn.id,
      kind: 'ready_to_commit',
      resumePoint: 'commit_turn',
      snapshotJson: serializeReadyToCommitCandidate(createReadyCandidate(eventId, turn.id)),
      pause: true
    })
    await writer.destroy()
    writer = undefined

    reader = await createVersionDataSource(database, false)
    const pausedTurn = await reader.getRepository(MainAgentTurnRecord).findOneByOrFail({
      status: 'paused'
    })
    const pausedEvent = await reader.getRepository(MainAgentEventRecord).findOneByOrFail({
      status: 'paused'
    })
    const head = await reader.getRepository(MainAgentTurnVersionRecord).findOneByOrFail({
      id: pausedTurn.headVersionId ?? -1
    })

    assert.equal(pausedTurn.eventId, eventId)
    assert.equal(pausedEvent.id, eventId)
    assert.equal(head.id, version.id)
    assert.equal(head.kind, 'ready_to_commit')
    assert.equal(head.resumePoint, 'commit_turn')
    assert.equal(
      resolveMainAgentTurnRecovery({
        eventType: pausedEvent.type,
        eventStatus: pausedEvent.status,
        turnStatus: pausedTurn.status,
        headKind: head.kind
      }).action,
      'restore_paused_owner'
    )
  } finally {
    if (writer?.isInitialized) await writer.destroy()
    if (reader?.isInitialized) await reader.destroy()
    await rm(directory, { recursive: true, force: true })
  }
})

sqliteTest('Final Version is committed with terminal turn and event state', async () => {
  const dataSource = await createVersionDataSource(':memory:')
  try {
    const eventId = 'final-version-atomic'
    const turn = await seedProcessingTurn(dataSource, eventId)
    const candidate = createReadyCandidate(eventId, turn.id)
    const ready = await persistTurnVersion(dataSource, {
      eventId,
      turnId: turn.id,
      kind: 'ready_to_commit',
      resumePoint: 'commit_turn',
      snapshotJson: serializeReadyToCommitCandidate(candidate),
      pause: false
    })

    const final = await dataSource.transaction(async (manager) => {
      const turnRepo = manager.getRepository(MainAgentTurnRecord)
      const eventRepo = manager.getRepository(MainAgentEventRecord)
      const savedTurn = await turnRepo.findOneByOrFail({ id: turn.id })
      const savedEvent = await eventRepo.findOneByOrFail({ id: eventId })
      const finalVersion = await persistFinalTurnVersionWithManager(manager, {
        turn: savedTurn,
        snapshotJson: '{}'
      })
      savedTurn.status = 'completed'
      savedTurn.completedAt = new Date()
      savedTurn.headVersionId = finalVersion.id
      savedEvent.status = 'completed'
      savedEvent.finishedAt = new Date()
      await turnRepo.save(savedTurn)
      await eventRepo.save(savedEvent)
      return finalVersion
    })

    const savedTurn = await dataSource.getRepository(MainAgentTurnRecord).findOneByOrFail({ id: turn.id })
    const savedEvent = await dataSource.getRepository(MainAgentEventRecord).findOneByOrFail({ id: eventId })
    assert.equal(final.kind, 'final')
    assert.equal(final.parentVersionId, ready.id)
    assert.equal(final.snapshotJson, ready.snapshotJson)
    assert.equal(savedTurn.headVersionId, final.id)
    assert.equal(savedTurn.status, 'completed')
    assert.equal(savedEvent.status, 'completed')
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest('cancelling a paused turn preserves versions and records a terminal state', async () => {
  const dataSource = await createVersionDataSource(':memory:')
  try {
    const eventId = 'cancel-paused-success'
    const turn = await seedProcessingTurn(dataSource, eventId)
    const head = await persistTurnVersion(dataSource, {
      eventId,
      turnId: turn.id,
      resumePoint: 'toolNode',
      snapshotJson: '{"checkpoint":"paused"}',
      pause: true
    })

    const result = await persistCancelledPausedTurn(dataSource)
    const savedTurn = await dataSource.getRepository(MainAgentTurnRecord).findOneByOrFail({ id: turn.id })
    const savedEvent = await dataSource.getRepository(MainAgentEventRecord).findOneByOrFail({ id: eventId })
    const versions = await dataSource.getRepository(MainAgentTurnVersionRecord).findBy({ turnId: turn.id })

    assert.deepEqual(result, { turnId: turn.id, eventId })
    assert.equal(savedTurn.status, 'cancelled')
    assert.ok(savedTurn.cancelledAt instanceof Date)
    assert.equal(savedTurn.headVersionId, head.id)
    assert.equal(savedEvent.status, 'cancelled')
    assert.equal(savedEvent.summary, 'turn_cancelled')
    assert.ok(savedEvent.finishedAt instanceof Date)
    assert.equal(versions.length, 1)
  } finally {
    await dataSource.destroy()
  }
})

sqliteTest('cancel transaction rolls back Turn when Event cancellation fails', async () => {
  const dataSource = await createVersionDataSource(':memory:')
  try {
    const eventId = 'cancel-paused-rollback'
    const turn = await seedProcessingTurn(dataSource, eventId)
    const head = await persistTurnVersion(dataSource, {
      eventId,
      turnId: turn.id,
      resumePoint: 'toolNode',
      snapshotJson: '{"checkpoint":"paused"}',
      pause: true
    })
    await dataSource.query(`
      CREATE TRIGGER reject_cancelled_event
      BEFORE UPDATE ON main_agent_event_record
      WHEN NEW.status = 'cancelled'
      BEGIN
        SELECT RAISE(ABORT, 'injected cancellation failure');
      END
    `)

    await assert.rejects(
      persistCancelledPausedTurn(dataSource),
      /injected cancellation failure/
    )

    const savedTurn = await dataSource.getRepository(MainAgentTurnRecord).findOneByOrFail({ id: turn.id })
    const savedEvent = await dataSource.getRepository(MainAgentEventRecord).findOneByOrFail({ id: eventId })
    assert.equal(savedTurn.status, 'paused')
    assert.equal(savedTurn.cancelledAt, null)
    assert.equal(savedTurn.headVersionId, head.id)
    assert.equal(savedEvent.status, 'paused')
    assert.equal(savedEvent.summary, 'turn_paused')
  } finally {
    await dataSource.destroy()
  }
})
