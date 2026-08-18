import { DataSource } from 'typeorm'
import { MainAgentToolEffectReceiptRecord } from '@share/entity/database/MainAgentToolEffectReceiptRecord'
import { MainAgentChangeSetRecord } from '@share/entity/database/MainAgentChangeSetRecord'
import { WorldEntityDocumentRecord } from '@share/entity/database/WorldEntityDocumentRecord'
import { runWithToolEffectExecutionContext } from '../../../toolEffects/toolEffectExecutionContext'
import {
  persistCompletedToolEffect,
  persistPlannedToolEffect
} from '../../../toolEffects/toolEffectReceiptService'

type FaultBoundary =
  | 'atomic_before_commit'
  | 'atomic_after_commit'
  | 'best_effort_after_action_before_receipt'

const database = process.argv[2]
const boundary = process.argv[3] as FaultBoundary | undefined
if (!database || !boundary) {
  throw new Error('toolEffectRecoveryFaultWorker requires a database path and fault boundary.')
}

const dataSource = new DataSource({
  type: 'better-sqlite3',
  database,
  synchronize: true,
  entities: [WorldEntityDocumentRecord, MainAgentToolEffectReceiptRecord, MainAgentChangeSetRecord]
})

const createDocument = (id: string): Partial<WorldEntityDocumentRecord> => ({
  id,
  ownerKind: 'world',
  worldId: 'world-1',
  ownerEntityId: null,
  parentDocumentId: null,
  title: boundary,
  contentHtml: '<p>fault boundary</p>',
  contentFormat: 'html',
  sortKey: 'a',
  revision: 1,
  schemaVersion: 1
})

const crash = (): never => {
  process.kill(process.pid, 'SIGKILL')
  throw new Error('SIGKILL did not terminate the worker.')
}

const run = async (): Promise<void> => {
  await dataSource.initialize()
  const atomic = boundary !== 'best_effort_after_action_before_receipt'
  const context = {
    eventId: `effect-fault-${boundary}`,
    turnId: 1,
    changeSetId: `effect-fault-${boundary}:turn:1`,
    sessionId: 'default',
    toolCallId: `tool-${boundary}`,
    toolName: 'create_world_document',
    recoveryMode: atomic ? ('same_database_transaction' as const) : ('best_effort' as const)
  }
  await persistPlannedToolEffect(dataSource, context)
  if (boundary === 'atomic_before_commit') crash()

  if (boundary === 'best_effort_after_action_before_receipt') {
    await dataSource.getRepository(WorldEntityDocumentRecord).save(createDocument('doc-fault'))
    crash()
  }

  await runWithToolEffectExecutionContext(context, () =>
    dataSource.transaction(async (manager) => {
      await manager.getRepository(WorldEntityDocumentRecord).save(createDocument('doc-fault'))
      await persistCompletedToolEffect(manager, {
        operation: '创建世界观文档',
        subject: { type: 'document', id: 'doc-fault', label: boundary },
        afterRevision: 1,
        summary: boundary
      })
    })
  )
  crash()
}

void run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
