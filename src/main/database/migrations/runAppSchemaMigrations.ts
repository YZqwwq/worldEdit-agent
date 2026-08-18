import type { DataSource, EntityManager } from 'typeorm'

type AppSchemaMigration = {
  id: string
  up: (manager: EntityManager) => Promise<void>
}

const migrations: AppSchemaMigration[] = [
  {
    id: '20260818_world_document_history_indexes',
    up: async (manager) => {
      await manager.query(
        'CREATE INDEX IF NOT EXISTS IDX_world_document_change_status_updated ON world_document_change (status, updatedAt)'
      )
      await manager.query(
        'CREATE INDEX IF NOT EXISTS IDX_world_document_change_commit ON world_document_change (commitId)'
      )
    }
  },
  {
    id: '20260818_world_document_checkpoints_and_metadata',
    up: async (manager) => {
      const commitColumns = (await manager.query(
        'PRAGMA table_info(world_document_commit)'
      )) as Array<{ name: string }>
      const names = new Set(commitColumns.map((column) => column.name))
      if (!names.has('restoredFromCommitId')) {
        await manager.query(
          'ALTER TABLE world_document_commit ADD COLUMN restoredFromCommitId text NULL'
        )
      }
      if (!names.has('intent')) {
        await manager.query(
          "ALTER TABLE world_document_commit ADD COLUMN intent text NOT NULL DEFAULT ''"
        )
      }
      await manager.query(`
        CREATE TABLE IF NOT EXISTS world_document_checkpoint (
          id text PRIMARY KEY NOT NULL,
          worldId text NOT NULL,
          commitId text NOT NULL,
          name text NOT NULL,
          note text NOT NULL DEFAULT '',
          createdAt datetime NOT NULL DEFAULT (datetime('now')),
          updatedAt datetime NOT NULL DEFAULT (datetime('now'))
        )
      `)
      await manager.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS IDX_world_document_checkpoint_world_name ON world_document_checkpoint (worldId, name)'
      )
      await manager.query(
        'CREATE INDEX IF NOT EXISTS IDX_world_document_checkpoint_world_updated ON world_document_checkpoint (worldId, updatedAt)'
      )
    }
  },
  {
    id: '20260818_world_document_branches',
    up: async (manager) => {
      const commitColumns = (await manager.query(
        'PRAGMA table_info(world_document_commit)'
      )) as Array<{ name: string }>
      if (!commitColumns.some((column) => column.name === 'branchId')) {
        await manager.query(
          "ALTER TABLE world_document_commit ADD COLUMN branchId text NOT NULL DEFAULT 'main'"
        )
      }
      await manager.query(`
        CREATE TABLE IF NOT EXISTS world_document_branch (
          id text PRIMARY KEY NOT NULL,
          worldId text NOT NULL,
          name text NOT NULL,
          headCommitId text NULL,
          active boolean NOT NULL DEFAULT (0),
          createdAt datetime NOT NULL DEFAULT (datetime('now')),
          updatedAt datetime NOT NULL DEFAULT (datetime('now'))
        )
      `)
      await manager.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS IDX_world_document_branch_world_name ON world_document_branch (worldId, name)'
      )
      await manager.query(
        'CREATE INDEX IF NOT EXISTS IDX_world_document_branch_world_active ON world_document_branch (worldId, active)'
      )
      await manager.query(`
        INSERT INTO world_document_branch (id, worldId, name, headCommitId, active)
        SELECT 'branch:' || worldId || ':main', worldId, '主方案', id, 1
        FROM world_document_commit AS commits
        WHERE sequence = (
          SELECT MAX(sequence) FROM world_document_commit WHERE worldId = commits.worldId
        )
        ON CONFLICT(worldId, name) DO NOTHING
      `)
      await manager.query(`
        UPDATE world_document_commit
        SET branchId = 'branch:' || worldId || ':main'
        WHERE branchId = 'main'
      `)
    }
  },
  {
    id: '20260818_world_document_merge_parent',
    up: async (manager) => {
      const columns = (await manager.query(
        'PRAGMA table_info(world_document_commit)'
      )) as Array<{ name: string }>
      if (!columns.some((column) => column.name === 'mergeParentCommitId')) {
        await manager.query(
          'ALTER TABLE world_document_commit ADD COLUMN mergeParentCommitId text NULL'
        )
      }
    }
  }
]

export const runAppSchemaMigrations = async (dataSource: DataSource): Promise<void> => {
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS app_schema_migration (
      id text PRIMARY KEY NOT NULL,
      appliedAt datetime NOT NULL DEFAULT (datetime('now'))
    )
  `)

  for (const migration of migrations) {
    const applied = (await dataSource.query(
      'SELECT id FROM app_schema_migration WHERE id = ? LIMIT 1',
      [migration.id]
    )) as Array<{ id: string }>
    if (applied.length > 0) continue

    await dataSource.transaction(async (manager) => {
      await migration.up(manager)
      await manager.query('INSERT INTO app_schema_migration (id) VALUES (?)', [migration.id])
    })
  }
}
