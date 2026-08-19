import assert from 'node:assert/strict'
import test from 'node:test'
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
import { createTurnWorkspace, withDurableToolReceipt } from '../../agentrsystem/state/turnWorkspace'
import type { MessagesState } from '../../agentrsystem/state/messageState'
import {
  canTransitionMainAgentEventStatus,
  canTransitionMainAgentTurnStatus
} from '@share/cache/AItype/states/mainAgentOrchestrationRules'
import { MainAgentEventRecord } from '@share/entity/database/MainAgentEventRecord'
import { MainAgentTurnRecord } from '@share/entity/database/MainAgentTurnRecord'
import { MainAgentTurnVersionRecord } from '@share/entity/database/MainAgentTurnVersionRecord'
import { runAppSchemaMigrations } from '../../../../database/migrations/runAppSchemaMigrations'
import {
  persistFinalTurnVersionWithManager,
  persistTurnVersion
} from '../../runtime/version/turnVersionPersistence'
import type { MainAgentReadyToCommitCandidate } from '@share/cache/AItype/states/turnWorkspace'
import {
  resolveMainAgentTurnRecovery,
  type MainAgentTurnRecoveryState
} from '../../runtime/version/turnRecoveryPolicy'

const sqliteTest = (name: string, execute: () => Promise<void>): void => {
  test(name, { skip: process.env.RUN_TURN_VERSION_SQLITE_TESTS !== '1' }, execute)
}

const createState = (): typeof MessagesState.State =>
  ({
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

const createVersionDataSource = async (database: string): Promise<DataSource> => {
  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database,
    synchronize: false,
    entities: [MainAgentEventRecord, MainAgentTurnRecord, MainAgentTurnVersionRecord]
  })
  await dataSource.initialize()
  await runAppSchemaMigrations(dataSource)
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

test('durable application effects remain visible in a restored interruption snapshot', () => {
  const state = createState()
  state.turnWorkspace = withDurableToolReceipt(state.turnWorkspace!, {
    toolCallId: 'tool-write-1',
    toolName: 'update_world_document',
    operation: '更新世界观文档',
    subject: { type: 'document', id: 'doc-1' },
    completion: 'complete',
    completionState: 'completed',
    summary: '文档正文已更新。',
    retryable: false,
    evidenceRef: 'document:doc-1',
    payload: { revision: 3 },
    persistedAt: '2026-08-13T12:00:00.000Z'
  })

  const restored = deserializeTurnGraphState(
    serializeTurnGraphState(state),
    'toolContextReloadNode'
  )

  assert.equal(restored.turnWorkspace?.draft.durableToolReceipts.length, 1)
  assert.equal(restored.turnWorkspace?.draft.durableToolReceipts[0]?.payload?.revision, 3)
})

test('interrupted is a terminal Turn while its queue Event completes normally', () => {
  assert.equal(canTransitionMainAgentTurnStatus('processing', 'interrupted'), true)
  assert.equal(canTransitionMainAgentTurnStatus('interrupted', 'processing'), false)
  assert.equal(canTransitionMainAgentEventStatus('processing', 'completed'), true)
})

test('ready-to-commit candidates preserve the authoritative response and workspace', () => {
  const candidate = createReadyCandidate('ready-candidate', 42)
  const restored = deserializeReadyToCommitCandidate(serializeReadyToCommitCandidate(candidate))

  assert.deepEqual(restored, candidate)
  assert.equal(restored.finalResponse.content, candidate.finalResponse.content)
  assert.equal(restored.workspace.turnId, 42)
})

test('running, Final and interrupted boundaries resolve to explicit recovery actions', () => {
  const cases: Array<{
    boundary: string
    state: MainAgentTurnRecoveryState
    action: ReturnType<typeof resolveMainAgentTurnRecovery>['action']
  }> = [
    {
      boundary: 'running checkpoint',
      state: {
        eventType: 'user_message',
        eventStatus: 'processing',
        turnStatus: 'processing',
        headKind: 'checkpoint'
      },
      action: 'fail_closed'
    },
    {
      boundary: 'ready to commit',
      state: {
        eventType: 'user_message',
        eventStatus: 'processing',
        turnStatus: 'processing',
        headKind: 'ready_to_commit'
      },
      action: 'resume_ready_commit'
    },
    {
      boundary: 'ready to commit with an unknown tool effect',
      state: {
        eventType: 'user_message',
        eventStatus: 'processing',
        turnStatus: 'processing',
        headKind: 'ready_to_commit',
        hasUnknownToolEffects: true
      },
      action: 'fail_closed'
    },
    {
      boundary: 'completed before queue acknowledgement',
      state: {
        eventType: 'user_message',
        eventStatus: 'processing',
        turnStatus: 'completed',
        headKind: 'final'
      },
      action: 'reconcile_completed_event'
    },
    {
      boundary: 'completed after queue acknowledgement',
      state: {
        eventType: 'user_message',
        eventStatus: 'completed',
        turnStatus: 'completed',
        headKind: 'final'
      },
      action: 'none'
    },
    {
      boundary: 'interrupted before queue acknowledgement',
      state: {
        eventType: 'user_message',
        eventStatus: 'processing',
        turnStatus: 'interrupted',
        headKind: 'final'
      },
      action: 'reconcile_completed_event'
    },
    {
      boundary: 'interrupted after queue acknowledgement',
      state: {
        eventType: 'user_message',
        eventStatus: 'completed',
        turnStatus: 'interrupted',
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
      snapshotJson: serializeReadyToCommitCandidate(candidate)
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

    const savedTurn = await dataSource
      .getRepository(MainAgentTurnRecord)
      .findOneByOrFail({ id: turn.id })
    const savedEvent = await dataSource
      .getRepository(MainAgentEventRecord)
      .findOneByOrFail({ id: eventId })
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

sqliteTest('interrupted Final seals the Turn before the queue completes its Event', async () => {
  const dataSource = await createVersionDataSource(':memory:')
  try {
    const eventId = 'interrupted-turn-queue-release'
    const turn = await seedProcessingTurn(dataSource, eventId)
    const ready = await persistTurnVersion(dataSource, {
      eventId,
      turnId: turn.id,
      kind: 'ready_to_commit',
      resumePoint: 'commit_turn',
      snapshotJson: serializeReadyToCommitCandidate(createReadyCandidate(eventId, turn.id))
    })
    const interruptedSnapshot = JSON.stringify({
      schemaVersion: 1,
      eventId,
      turnId: turn.id,
      status: 'interrupted',
      interruption: {
        reason: 'user_interrupted',
        sourceVersionId: ready.id,
        resumePoint: 'commit_turn'
      }
    })

    const final = await dataSource.transaction(async (manager) => {
      const savedTurn = await manager.getRepository(MainAgentTurnRecord).findOneByOrFail({
        id: turn.id
      })
      const finalVersion = await persistFinalTurnVersionWithManager(manager, {
        turn: savedTurn,
        snapshotJson: interruptedSnapshot,
        reuseReadySnapshot: false
      })
      savedTurn.status = 'interrupted'
      savedTurn.interruptedAt = new Date()
      savedTurn.headVersionId = finalVersion.id
      await manager.getRepository(MainAgentTurnRecord).save(savedTurn)
      return finalVersion
    })

    const eventBeforeQueueAck = await dataSource
      .getRepository(MainAgentEventRecord)
      .findOneByOrFail({ id: eventId })
    assert.equal(final.kind, 'final')
    assert.equal(final.parentVersionId, ready.id)
    assert.equal(final.snapshotJson, interruptedSnapshot)
    assert.equal(eventBeforeQueueAck.status, 'processing')

    eventBeforeQueueAck.status = 'completed'
    eventBeforeQueueAck.summary = 'user_message_interrupted'
    eventBeforeQueueAck.finishedAt = new Date()
    await dataSource.getRepository(MainAgentEventRecord).save(eventBeforeQueueAck)
    assert.equal(
      (await dataSource.getRepository(MainAgentEventRecord).findOneByOrFail({ id: eventId }))
        .status,
      'completed'
    )
  } finally {
    await dataSource.destroy()
  }
})
