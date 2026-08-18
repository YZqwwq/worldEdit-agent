import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DataSource } from 'typeorm'
import { MainAgentToolEffectReceiptRecord } from '@share/entity/database/MainAgentToolEffectReceiptRecord'
import { MainAgentChangeSetRecord } from '@share/entity/database/MainAgentChangeSetRecord'
import { WorldEntityDocumentRecord } from '@share/entity/database/WorldEntityDocumentRecord'
import { assertProcessTerminatedAbruptly } from '../support/processTestSupport'
import { reconcileOrphanedPlannedToolEffects } from '../../../toolEffects/toolEffectReceiptService'

const cases = [
  {
    boundary: 'atomic_before_commit',
    expectedStatus: 'failed',
    documentExists: false
  },
  {
    boundary: 'atomic_after_commit',
    expectedStatus: 'completed',
    documentExists: true
  },
  {
    boundary: 'best_effort_after_action_before_receipt',
    expectedStatus: 'unknown',
    documentExists: true
  }
] as const

for (const faultCase of cases) {
  test(`tool effect recovery resolves ${faultCase.boundary}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), `worldedit-effect-${faultCase.boundary}-`))
    const database = join(directory, 'effect-recovery.sqlite')
    const worker = join(
      process.cwd(),
      'src/main/services/aiservice/testarea/.generated/tool-effect-recovery-fault-worker.cjs'
    )
    let dataSource: DataSource | undefined
    try {
      const result = spawnSync(process.execPath, [worker, database, faultCase.boundary], {
        encoding: 'utf8',
        timeout: 15_000
      })
      assertProcessTerminatedAbruptly(result)

      dataSource = new DataSource({
        type: 'better-sqlite3',
        database,
        synchronize: false,
        entities: [
          WorldEntityDocumentRecord,
          MainAgentToolEffectReceiptRecord,
          MainAgentChangeSetRecord
        ]
      })
      await dataSource.initialize()
      await reconcileOrphanedPlannedToolEffects(dataSource)

      const receipt = await dataSource
        .getRepository(MainAgentToolEffectReceiptRecord)
        .findOneByOrFail({ toolCallId: `tool-${faultCase.boundary}` })
      const document = await dataSource
        .getRepository(WorldEntityDocumentRecord)
        .findOneBy({ id: 'doc-fault' })
      assert.equal(receipt.status, faultCase.expectedStatus)
      assert.equal(Boolean(document), faultCase.documentExists)
    } finally {
      if (dataSource?.isInitialized) await dataSource.destroy()
      await rm(directory, { recursive: true, force: true })
    }
  })
}
