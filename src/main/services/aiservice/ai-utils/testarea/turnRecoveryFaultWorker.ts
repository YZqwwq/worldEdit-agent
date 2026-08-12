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

type FaultBoundary =
  | 'pause_before'
  | 'pause_during'
  | 'pause_after'
  | 'resume_running'
  | 'final_before'
  | 'final_after'

const database = process.argv[2]
const boundary = process.argv[3] as FaultBoundary | undefined

if (!database || !boundary) {
  throw new Error('turnRecoveryFaultWorker requires a database path and fault boundary.')
}

const dataSource = new DataSource({
  type: 'better-sqlite3',
  database,
  synchronize: true,
  entities: [MainAgentEventRecord, MainAgentTurnRecord, MainAgentTurnVersionRecord]
})

const seedProcessingTurn = async (): Promise<MainAgentTurnRecord> => {
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
    runId: `fault-${boundary}`,
    memorySlots: createDefaultMemorySlots(),
    persona: null
  }),
  finalResponse: {
    messageId: `${eventId}:final`,
    content: '已经完成计算的权威回复。'
  }
})

const crashNow = (): never => {
  process.kill(process.pid, 'SIGKILL')
  throw new Error('SIGKILL did not terminate the fault worker.')
}

const run = async (): Promise<void> => {
  await dataSource.initialize()
  const turn = await seedProcessingTurn()
  const eventId = turn.eventId

  if (boundary === 'final_before' || boundary === 'final_after') {
    const candidate = createReadyCandidate(eventId, turn.id)
    await persistTurnVersion(dataSource, {
      eventId,
      turnId: turn.id,
      kind: 'ready_to_commit',
      resumePoint: 'commit_turn',
      snapshotJson: serializeReadyToCommitCandidate(candidate),
      pause: false
    })
    if (boundary === 'final_before') crashNow()

    await dataSource.transaction(async (manager) => {
      const turnRepo = manager.getRepository(MainAgentTurnRecord)
      const eventRepo = manager.getRepository(MainAgentEventRecord)
      const savedTurn = await turnRepo.findOneByOrFail({ id: turn.id })
      const savedEvent = await eventRepo.findOneByOrFail({ id: eventId })
      const finalVersion = await persistFinalTurnVersionWithManager(manager, {
        turn: savedTurn,
        snapshotJson: JSON.stringify(candidate)
      })
      savedTurn.status = 'completed'
      savedTurn.completedAt = new Date()
      savedTurn.headVersionId = finalVersion.id
      savedEvent.status = 'completed'
      savedEvent.finishedAt = new Date()
      await turnRepo.save(savedTurn)
      await eventRepo.save(savedEvent)
    })
    crashNow()
  }

  const checkpoint = await persistTurnVersion(dataSource, {
    eventId,
    turnId: turn.id,
    resumePoint: 'toolNode',
    snapshotJson: JSON.stringify({ boundary, checkpoint: 1 }),
    pause: false
  })
  if (boundary === 'pause_before') crashNow()

  if (boundary === 'pause_during') {
    const runner = dataSource.createQueryRunner()
    await runner.connect()
    await runner.startTransaction()
    const versionRepo = runner.manager.getRepository(MainAgentTurnVersionRecord)
    const turnRepo = runner.manager.getRepository(MainAgentTurnRecord)
    const eventRepo = runner.manager.getRepository(MainAgentEventRecord)
    const uncommittedVersion = await versionRepo.save({
      turnId: turn.id,
      sequence: 2,
      parentVersionId: checkpoint.id,
      kind: 'checkpoint',
      resumePoint: 'llmCall',
      snapshotJson: JSON.stringify({ boundary, checkpoint: 2 })
    })
    const savedTurn = await turnRepo.findOneByOrFail({ id: turn.id })
    const savedEvent = await eventRepo.findOneByOrFail({ id: eventId })
    savedTurn.headVersionId = uncommittedVersion.id
    savedTurn.status = 'paused'
    savedTurn.pausedAt = new Date()
    savedEvent.status = 'paused'
    savedEvent.summary = 'turn_paused'
    await turnRepo.save(savedTurn)
    await eventRepo.save(savedEvent)
    crashNow()
  }

  await persistTurnVersion(dataSource, {
    eventId,
    turnId: turn.id,
    resumePoint: 'llmCall',
    snapshotJson: JSON.stringify({ boundary, checkpoint: 2 }),
    pause: true
  })
  if (boundary === 'pause_after') crashNow()

  await dataSource.transaction(async (manager) => {
    const savedTurn = await manager.getRepository(MainAgentTurnRecord).findOneByOrFail({ id: turn.id })
    const savedEvent = await manager.getRepository(MainAgentEventRecord).findOneByOrFail({ id: eventId })
    savedTurn.status = 'processing'
    savedTurn.pausedAt = null
    savedEvent.status = 'processing'
    savedEvent.finishedAt = null
    await manager.getRepository(MainAgentTurnRecord).save(savedTurn)
    await manager.getRepository(MainAgentEventRecord).save(savedEvent)
  })
  crashNow()
}

void run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
