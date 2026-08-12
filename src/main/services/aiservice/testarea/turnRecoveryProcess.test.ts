import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DataSource } from 'typeorm'
import { MainAgentEventRecord } from '@share/entity/database/MainAgentEventRecord'
import { MainAgentTurnRecord } from '@share/entity/database/MainAgentTurnRecord'
import { MainAgentTurnVersionRecord } from '@share/entity/database/MainAgentTurnVersionRecord'
import {
  resolveMainAgentTurnRecovery,
  type MainAgentTurnRecoveryAction
} from '../runtime/version/turnRecoveryPolicy'

type FaultCase = {
  boundary: string
  expectedAction: MainAgentTurnRecoveryAction
  eventStatus: MainAgentEventRecord['status']
  turnStatus: MainAgentTurnRecord['status']
  headKind: MainAgentTurnVersionRecord['kind']
  versionCount: number
}

const cases: FaultCase[] = [
  {
    boundary: 'pause_before',
    expectedAction: 'fail_closed',
    eventStatus: 'processing',
    turnStatus: 'processing',
    headKind: 'checkpoint',
    versionCount: 1
  },
  {
    boundary: 'pause_during',
    expectedAction: 'fail_closed',
    eventStatus: 'processing',
    turnStatus: 'processing',
    headKind: 'checkpoint',
    versionCount: 1
  },
  {
    boundary: 'pause_after',
    expectedAction: 'restore_paused_owner',
    eventStatus: 'paused',
    turnStatus: 'paused',
    headKind: 'checkpoint',
    versionCount: 2
  },
  {
    boundary: 'resume_running',
    expectedAction: 'fail_closed',
    eventStatus: 'processing',
    turnStatus: 'processing',
    headKind: 'checkpoint',
    versionCount: 2
  },
  {
    boundary: 'final_before',
    expectedAction: 'resume_ready_commit',
    eventStatus: 'processing',
    turnStatus: 'processing',
    headKind: 'ready_to_commit',
    versionCount: 1
  },
  {
    boundary: 'final_after',
    expectedAction: 'none',
    eventStatus: 'completed',
    turnStatus: 'completed',
    headKind: 'final',
    versionCount: 2
  }
]

for (const faultCase of cases) {
  test(`process restart resolves ${faultCase.boundary}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), `worldedit-${faultCase.boundary}-`))
    const database = join(directory, 'recovery.sqlite')
    const worker = join(
      process.cwd(),
      'src/main/services/aiservice/ai-utils/testarea/.generated/turn-recovery-fault-worker.cjs'
    )
    let dataSource: DataSource | undefined
    try {
      const result = spawnSync(process.execPath, [worker, database, faultCase.boundary], {
        encoding: 'utf8',
        timeout: 15_000
      })
      assert.equal(result.signal, 'SIGKILL', result.stderr || result.stdout)

      dataSource = new DataSource({
        type: 'better-sqlite3',
        database,
        synchronize: false,
        entities: [MainAgentEventRecord, MainAgentTurnRecord, MainAgentTurnVersionRecord]
      })
      await dataSource.initialize()
      const event = await dataSource.getRepository(MainAgentEventRecord).findOneByOrFail({
        id: `process-fault-${faultCase.boundary}`
      })
      const turn = await dataSource.getRepository(MainAgentTurnRecord).findOneByOrFail({
        eventId: event.id
      })
      const head = await dataSource.getRepository(MainAgentTurnVersionRecord).findOneByOrFail({
        id: turn.headVersionId ?? -1
      })
      const versions = await dataSource.getRepository(MainAgentTurnVersionRecord).findBy({
        turnId: turn.id
      })

      assert.equal(event.status, faultCase.eventStatus)
      assert.equal(turn.status, faultCase.turnStatus)
      assert.equal(head.kind, faultCase.headKind)
      assert.equal(versions.length, faultCase.versionCount)
      assert.equal(
        resolveMainAgentTurnRecovery({
          eventType: event.type,
          eventStatus: event.status,
          turnStatus: turn.status,
          headKind: head.kind
        }).action,
        faultCase.expectedAction
      )
    } finally {
      if (dataSource?.isInitialized) await dataSource.destroy()
      await rm(directory, { recursive: true, force: true })
    }
  })
}
