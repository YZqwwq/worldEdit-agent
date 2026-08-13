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

const cases: Array<{
  boundary: string
  eventStatus: MainAgentEventRecord['status']
  turnStatus: MainAgentTurnRecord['status']
  headKind: MainAgentTurnVersionRecord['kind']
  action: MainAgentTurnRecoveryAction
}> = [
  {
    boundary: 'checkpoint_running',
    eventStatus: 'processing',
    turnStatus: 'processing',
    headKind: 'checkpoint',
    action: 'fail_closed'
  },
  {
    boundary: 'ready_to_commit',
    eventStatus: 'processing',
    turnStatus: 'processing',
    headKind: 'ready_to_commit',
    action: 'resume_ready_commit'
  },
  {
    boundary: 'interrupted_before_queue_ack',
    eventStatus: 'processing',
    turnStatus: 'interrupted',
    headKind: 'final',
    action: 'reconcile_completed_event'
  },
  {
    boundary: 'interrupted_after_queue_ack',
    eventStatus: 'completed',
    turnStatus: 'interrupted',
    headKind: 'final',
    action: 'none'
  }
]

for (const faultCase of cases) {
  test(`process restart resolves ${faultCase.boundary}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), `worldedit-${faultCase.boundary}-`))
    const database = join(directory, 'recovery.sqlite')
    const worker = join(process.cwd(), 'src/main/services/aiservice/testarea/.generated/turn-recovery-fault-worker.cjs')
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

      assert.equal(event.status, faultCase.eventStatus)
      assert.equal(turn.status, faultCase.turnStatus)
      assert.equal(head.kind, faultCase.headKind)
      assert.equal(
        resolveMainAgentTurnRecovery({
          eventType: event.type,
          eventStatus: event.status,
          turnStatus: turn.status,
          headKind: head.kind
        }).action,
        faultCase.action
      )
    } finally {
      if (dataSource?.isInitialized) await dataSource.destroy()
      await rm(directory, { recursive: true, force: true })
    }
  })
}
