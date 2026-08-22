import { performance } from 'node:perf_hooks'
import { DataSource } from 'typeorm'
import { WorldEntityDocumentRecord } from '@share/entity/database/WorldEntityDocumentRecord'
import { WorldDocumentContentVersionRecord } from '@share/entity/database/WorldDocumentContentVersionRecord'
import { WorldDocumentTreeObjectRecord } from '@share/entity/database/WorldDocumentTreeObjectRecord'
import { WorldDocumentCommitRecord } from '@share/entity/database/WorldDocumentCommitRecord'
import { WorldDocumentChangeRecord } from '@share/entity/database/WorldDocumentChangeRecord'
import { WorldDocumentBranchRecord } from '@share/entity/database/WorldDocumentBranchRecord'
import { WorldDocumentCheckpointRecord } from '@share/entity/database/WorldDocumentCheckpointRecord'
import { WorldDocumentIntegrityCacheRecord } from '@share/entity/database/WorldDocumentIntegrityCacheRecord'
import {
  commitWorldDocumentChangeSetWithManager,
  ensureWorldDocumentHistoryBranchWithManager,
  restoreWorldDocumentCommitWithManager,
  stageWorldDocumentChangeWithManager
} from '../../../worldbuilding/worldDocumentVersionService'
import { getCachedWorldDocumentIntegrityReport } from '../../../worldbuilding/worldDocumentIntegrityService'
import { runAppSchemaMigrations } from '../../../../database/migrations/runAppSchemaMigrations'

type BenchmarkResult = {
  documents: number
  baselineMs: number
  singleDocumentCommitMs: number
  restoreMs: number
  integrityColdMs: number
  integrityCachedMs: number
}

const elapsed = async <T>(execute: () => Promise<T>): Promise<[T, number]> => {
  const startedAt = performance.now()
  const result = await execute()
  return [result, performance.now() - startedAt]
}

const createDataSource = async (): Promise<DataSource> => {
  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    synchronize: false,
    entities: [
      WorldEntityDocumentRecord,
      WorldDocumentContentVersionRecord,
      WorldDocumentTreeObjectRecord,
      WorldDocumentCommitRecord,
      WorldDocumentChangeRecord,
      WorldDocumentBranchRecord,
      WorldDocumentCheckpointRecord,
      WorldDocumentIntegrityCacheRecord
    ]
  })
  await dataSource.initialize()
  await runAppSchemaMigrations(dataSource)
  return dataSource
}

const runCase = async (count: number): Promise<BenchmarkResult> => {
  const dataSource = await createDataSource()
  try {
    const repository = dataSource.getRepository(WorldEntityDocumentRecord)
    await repository.save(
      Array.from({ length: count }, (_, index) =>
        repository.create({
          id: `doc-${String(index).padStart(4, '0')}`,
          worldId: 'benchmark-world',
          parentDocumentId: null,
          title: `Document ${index}`,
          contentHtml: `<h1>Document ${index}</h1><p>${'x'.repeat(1000)}</p>`,
          contentFormat: 'html',
          sortKey: String(index).padStart(6, '0'),
          revision: 1,
          schemaVersion: 1
        })
      )
    )

    const [, baselineMs] = await elapsed(() =>
      dataSource.transaction((manager) =>
        ensureWorldDocumentHistoryBranchWithManager(manager, 'benchmark-world')
      )
    )
    const [[firstCommit], singleDocumentCommitMs] = await elapsed(() =>
      dataSource.transaction(async (manager) => {
        const documents = manager.getRepository(WorldEntityDocumentRecord)
        const before = await documents.findOneByOrFail({ id: 'doc-0000' })
        const after = await documents.save(
          documents.create({
            ...before,
            contentHtml: '<h1>Edited</h1><p>benchmark edit</p>',
            revision: before.revision + 1
          })
        )
        await stageWorldDocumentChangeWithManager(manager, {
          changeSetId: `benchmark:edit:${count}`,
          operation: 'update',
          before,
          after,
          source: { format: 'html_editor', content: after.contentHtml }
        })
        return commitWorldDocumentChangeSetWithManager(manager, `benchmark:edit:${count}`, 'human')
      })
    )
    const head = await dataSource.getRepository(WorldDocumentBranchRecord).findOneByOrFail({
      worldId: 'benchmark-world',
      active: true
    })
    const [, restoreMs] = await elapsed(() =>
      dataSource.transaction((manager) =>
        restoreWorldDocumentCommitWithManager(manager, {
          targetCommitId: firstCommit.id,
          expectedHeadCommitId: head.headCommitId!
        })
      )
    )
    const [, integrityColdMs] = await elapsed(() =>
      getCachedWorldDocumentIntegrityReport(dataSource, 'benchmark-world')
    )
    const [, integrityCachedMs] = await elapsed(() =>
      getCachedWorldDocumentIntegrityReport(dataSource, 'benchmark-world')
    )
    return {
      documents: count,
      baselineMs,
      singleDocumentCommitMs,
      restoreMs,
      integrityColdMs,
      integrityCachedMs
    }
  } finally {
    await dataSource.destroy()
  }
}

const main = async (): Promise<void> => {
  const results: BenchmarkResult[] = []
  for (const count of [10, 100, 1000]) results.push(await runCase(count))
  console.table(
    results.map((result) =>
      Object.fromEntries(
        Object.entries(result).map(([key, value]) => [
          key,
          typeof value === 'number' && key !== 'documents' ? Number(value.toFixed(2)) : value
        ])
      )
    )
  )
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
