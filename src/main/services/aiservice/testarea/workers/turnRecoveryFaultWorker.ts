import { DataSource } from 'typeorm'
import { MainAgentEventRecord } from '@share/entity/database/MainAgentEventRecord'
import { MainAgentTurnRecord } from '@share/entity/database/MainAgentTurnRecord'
import { MainAgentTurnVersionRecord } from '@share/entity/database/MainAgentTurnVersionRecord'
import {
  persistFinalTurnVersionWithManager,
  persistTurnVersion
} from '../../runtime/version/turnVersionPersistence'
import { serializeReadyToCommitCandidate } from '../../runtime/version/turnVersionSnapshot'
import { createTurnWorkspace } from '../../agentrsystem/state/turnWorkspace'
import { createDefaultMemorySlots } from '../../agentrsystem/manager/memory/memoryWritePolicy'
import type { MainAgentReadyToCommitCandidate } from '@share/cache/AItype/states/turnWorkspace'
import { runAppSchemaMigrations } from '../../../../database/migrations/runAppSchemaMigrations'

type FaultBoundary =
  | 'checkpoint_running'
  | 'ready_to_commit'
  | 'interrupted_before_queue_ack'
  | 'interrupted_after_queue_ack'

const database = process.argv[2]
const boundary = process.argv[3] as FaultBoundary | undefined
if (!database || !boundary) {
  throw new Error('turnRecoveryFaultWorker requires a database path and fault boundary.')
}

const dataSource = new DataSource({
  type: 'better-sqlite3',
  database,
  synchronize: false,
  entities: [MainAgentEventRecord, MainAgentTurnRecord, MainAgentTurnVersionRecord]
})

const seed = async (): Promise<MainAgentTurnRecord> => {
  const eventId = `process-fault-${boundary}`
  await dataSource.getRepository(MainAgentEventRecord).save({
    id: eventId,
    type: 'user_message',
    source: 'user',
    sessionId: 'default',
    priority: 'interactive',
    createdAtMs: Date.now(),
    dedupeKey: null,
    payloadJson: JSON.stringify({ messageId: 1, content: [{ type: 'text', text: boundary }] }),
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

const readyCandidate = (turn: MainAgentTurnRecord): MainAgentReadyToCommitCandidate => ({
  schemaVersion: 1,
  eventId: turn.eventId,
  turnId: turn.id,
  sessionId: turn.sessionId,
  consumer: 'chat_runtime',
  status: 'completed',
  workspace: createTurnWorkspace({
    eventId: turn.eventId,
    turnId: turn.id,
    sessionId: turn.sessionId,
    runId: `fault-${boundary}`,
    memorySlots: createDefaultMemorySlots(),
    persona: null
  }),
  finalResponse: { messageId: `${turn.eventId}:final`, content: '权威回复' }
})

const crash = (): never => {
  process.kill(process.pid, 'SIGKILL')
  throw new Error('SIGKILL did not terminate the worker.')
}

const run = async (): Promise<void> => {
  await dataSource.initialize()
  await runAppSchemaMigrations(dataSource)
  const turn = await seed()
  if (boundary === 'ready_to_commit') {
    const candidate = readyCandidate(turn)
    await persistTurnVersion(dataSource, {
      eventId: turn.eventId,
      turnId: turn.id,
      kind: 'ready_to_commit',
      resumePoint: 'commit_turn',
      snapshotJson: serializeReadyToCommitCandidate(candidate)
    })
    crash()
  }

  const checkpoint = await persistTurnVersion(dataSource, {
    eventId: turn.eventId,
    turnId: turn.id,
    resumePoint: 'toolContextReloadNode',
    snapshotJson: JSON.stringify({ messages: [], state: { turnWorkspace: readyCandidate(turn).workspace } })
  })
  if (boundary === 'checkpoint_running') crash()

  await dataSource.transaction(async (manager) => {
    const savedTurn = await manager.getRepository(MainAgentTurnRecord).findOneByOrFail({ id: turn.id })
    const finalVersion = await persistFinalTurnVersionWithManager(manager, {
      turn: savedTurn,
      reuseReadySnapshot: false,
      snapshotJson: JSON.stringify({
        schemaVersion: 1,
        eventId: turn.eventId,
        turnId: turn.id,
        status: 'interrupted',
        interruption: {
          reason: 'user_interrupted',
          sourceVersionId: checkpoint.id,
          resumePoint: checkpoint.resumePoint
        }
      })
    })
    savedTurn.status = 'interrupted'
    savedTurn.interruptedAt = new Date()
    savedTurn.headVersionId = finalVersion.id
    await manager.getRepository(MainAgentTurnRecord).save(savedTurn)
  })

  if (boundary === 'interrupted_after_queue_ack') {
    const event = await dataSource.getRepository(MainAgentEventRecord).findOneByOrFail({
      id: turn.eventId
    })
    event.status = 'completed'
    event.consumer = 'chat_runtime'
    event.summary = 'user_message_interrupted'
    event.finishedAt = new Date()
    await dataSource.getRepository(MainAgentEventRecord).save(event)
  }
  crash()
}

void run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
